// ─── M.A.I. Type System ─── Single Source of Truth ──────────────────────────
// All interfaces for the Markdown-First / Model-as-an-Engine architecture.
//
// Architecture adapted from:
//   - Hermes Agent (nousresearch/hermes-agent): 3-tier cache, error classification,
//     streaming event vocabulary, micro-compaction, tool guardrails
//   - Pi (earendil-works/pi): Result<T,E>, 3-phase tool pipeline, dual-queue
//     message injection, structured stream events, extensible AgentMessage

import type OpenAI from "openai";

// ─── Action Protocol ────────────────────────────────────────────────────────
// The LLM communicates via ```action fenced code blocks containing JSON
// with an `action` discriminator field. This is the complete set.

export type ActionName =
  | "execute-terminal"
  | "read-file"
  | "write-file"
  | "append-file"
  | "list-directory"
  | "watch-directory"
  | "get-system-info"
  | "get-process-list"
  | "open-url"
  | "http-request"
  | "emit-hud-update"
  | "compact-memory"
  | "run-skill"
  | "schedule-task"
  | "screenshot-capture"
  | "clipboard-read"
  | "clipboard-write"
  | "open-application"
  | "search-files"
  | "get-gpu-info"
  | "get-network-info"
  | "manage-processes"
  | "voice-call"
  | "list-files-detailed"
  | "semantic-recall"
  | "self-modify"
  | "self-evaluate"
  | "self-diagnose"
  | "self-repair"
  | "adaptive-config"
  | "remember"
  | "recall"
  | "forget"
  | "profile-update"
  | "learn-pattern"
  | "create-skill"
  | "optimize-skill"
  | "rollback"
  | "control-window"
  | "input-inject"
  | "system-setting"
  | "media-control"
  | "screen-arrange"
  | "notification-send"
  | "dry-run"
  | "run-macro"
  | "search-conversations"
  | "web-search"
  | "web-scrape"
  | "analyze-image"
  | "sandbox-execute"
  | "device-control"
  | "ui-adapt"
  | "browser-control"
  | "email-access";

export interface Action {
  action: ActionName;
  [key: string]: unknown;
}

export type ActionResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

export type PrimitiveExecutor = (
  action: Action,
  ctx: ActionContext
) => Promise<ActionResult>;

// ─── Policy ────────────────────────────────────────────────────────────────
export interface PolicyConfig {
  deny_commands?: string[];
  allow_network?: string[];
  require_approval?: string[];
  auto_approve?: string[];
}

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

// ─── Agent State ──────────────────────────────────────────────────────────
export interface AgentState {
  messages: ChatMessage[];
  loopCount: number;
  isRunning: boolean;
  pendingApproval: PendingApproval | null;
  lastSpeechText?: string;
  consecutiveMalformed: number;
  // Hermes-style additions
  sessionId: string;
  createdAt: number;
  lastActivityAt: number;
  totalTokensUsed: number;
  totalActionsExecuted: number;
  compressionCount: number;
  aborted: boolean;
  iterationBudget: number;
}

export interface PendingApproval {
  action: Action;
  resolve: (approved: boolean) => void;
}

// ─── Context Compression (Hermes pattern) ──────────────────────────────────
export interface CompressionResult {
  compressed: boolean;
 originalTokenEstimate: number;
  newTokenEstimate: number;
 summary: string;
 turnsRemoved: number;
}

// ─── Error Classification (Hermes pattern) ────────────────────────────────
export type ErrorSeverity = "transient" | "rate_limit" | "auth" | "context_overflow" | "model_error" | "network" | "unknown";

export interface ClassifiedError {
  severity: ErrorSeverity;
  retryable: boolean;
  message: string;
  suggestion: string;
}

// ─── Chat ───────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ─── LLM ────────────────────────────────────────────────────────────────────
export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  provider: string;
}

// ─── Multi-Provider Fallback ────────────────────────────────────────────────
export interface ProviderEntry {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  priority: number; // lower = tried first
}

// ─── Parser ────────────────────────────────────────────────────────────────
export interface ParsedResponse {
  text: string;
  actions: Action[];
  malformedCount?: number;
}

// ─── HUD ───────────────────────────────────────────────────────────────────
export type HudChannel =
  | "jarvis_speech"
  | "activity_log"
  | "system_metrics"
  | "threat_level"
  | "reactor_pulse"
  | "file_list"
  | "voice_call_state"
  | "network_stats"
  | "gpu_stats"
  | "live_token"
  | "proactive_alert"
  | "user_profile_update"
  | "health_report"
  | "device_connected"
  | "device_disconnected"
  | "gateway_message"
  | "notification_incoming"
  | "ambient_listening"
  | "tunnel_status"
  | "analytics_snapshot"
  | "approval_request"
  | "voice_switch"
  | "silent_text"
  | "bg_activity"
  | "action_progress"
  | "piper_audio"
  | "tts_engine_status"
  | "tts_engine_switch"
  | "sandbox_output"
  | "sandbox_session_event"
  | "device_event"
  | "ui_patch"
  | "browser_event"
  | "email_event"
  | "interim_message"
  | "turn_start"
  | "turn_end";

// ─── Search Engine ──────────────────────────────────────────────────────
export interface SearchEngineConfig {
  engine: "duckduckgo" | "tavily" | "searxng";
  tavilyApiKey?: string;
  searxngUrl?: string;
  maxResults: number;
}

export interface HudPayloads {
  jarvis_speech: { text: string };
  activity_log: { message: string; level: "info" | "warn" | "error" };
  system_metrics: { cpu: number; memory: number; disk: number };
  threat_level: { level: "green" | "yellow" | "orange" | "red"; detail?: string };
  reactor_pulse: { power: number; status: string };
  file_list: { files: Array<{ name: string; path: string; size: number; modified: string; type: "file" | "dir"; extension: string }> };
  voice_call_state: { active: boolean; transcript: string };
  network_stats: { upload_bps: number; download_bps: number };
  gpu_stats: { temperature: number; utilization: number; memory_used: number; memory_total: number };
  live_token: { token: string };
  proactive_alert: { rule: string; action: string; detail: string };
  user_profile_update: { field: string; value: string };
  health_report: { subsystems: Array<{ name: string; status: "ok" | "degraded" | "failed"; detail: string }>; overall: "healthy" | "degraded" | "critical" };
  device_connected: { deviceId: string; channel: string; deviceName: string };
  device_disconnected: { deviceId: string; channel: string };
  gateway_message: { channel: string; source: string; text: string; timestamp: number };
  notification_incoming: { id: string; source: string; title: string; body: string; priority: string };
  ambient_listening: { active: boolean; wakeWord: string; audioLevel: number };
  tunnel_status: { active: boolean; method: string; publicUrl: string | null };
  analytics_snapshot: { totalInteractions: number; messagesSent: number; actionsExecuted: number; errorRate: number; uptimeSeconds: number };
  approval_request: { action: string; detail?: string };
  voice_switch: { personality: string };
  silent_text: { text: string };
  bg_activity: { id: string; action: string; status: "started" | "running" | "completed" | "failed" | "queued"; detail?: string; result?: string };
  action_progress: { id: string; action: string; step: string; percent?: number; detail?: string };
  piper_audio: { audio: string; format: string; text?: string };
  tts_engine_status: { engine: string; ready: boolean; error?: string; info?: Record<string, unknown> };
  tts_engine_switch: { engine: string; piperReady: boolean };
  sandbox_output: { sessionId: string; commandId: string; stream: "stdout" | "stderr"; chunk: string };
  sandbox_session_event: { event: "created" | "destroyed" | "config_changed"; sessionId: string; name: string; detail?: string };
  device_event: { event: "discovered" | "removed" | "state_change"; deviceId: string; name: string; capability?: string; value?: unknown };
  ui_patch: { type: "css" | "theme" | "layout" | "widget" | "script"; selector?: string; css?: string; variables?: Record<string, string>; html?: string; js?: string; id?: string; description?: string };
  browser_event: { event: "discovered" | "tab_opened" | "tab_closed" | "navigated" | "screenshot" | "search_performed"; browserId?: string; tabId?: string; url?: string; title?: string; detail?: string };
  email_event: { event: "connected" | "disconnected" | "new_mail" | "mail_fetched" | "mail_sent"; accountId?: string; folder?: string; uid?: string; subject?: string; detail?: string };
  interim_message: { type: "thinking" | "tool_call" | "compressing" | "waiting_approval" | "retrying" | "streaming"; detail?: string };
  turn_start: { iteration: number; contextTokens: number; budgetRemaining: number };
  turn_end: { iteration: number; reason: string; durationMs: number; tokensUsed: number };
}

export type HudMessage<C extends HudChannel> = {
  channel: C;
  payload: HudPayloads[C];
  timestamp: number;
};

export interface HudEmitter {
  (channel: HudChannel, payload: HudPayloads[HudChannel]): void;
}

// ─── Inbox Events ──────────────────────────────────────────────────────────
export interface InboxEvent {
  type: string;
  source: string;
  detail: string;
  timestamp: string;
}

// ─── Audit Log ─────────────────────────────────────────────────────────────
export type AuditEventType = "action_executed" | "action_blocked" | "action_approved" | "action_denied" | "action_timeout" | "llm_call" | "llm_error" | "policy_loaded" | "context_compressed" | "session_saved" | "session_restored" | "error_classified";

export interface AuditEntry {
  timestamp?: string;
  type: AuditEventType;
  action?: string;
  detail: string;
  durationMs?: number;
  ok?: boolean;
}

export interface AuditLogger {
  (entry: AuditEntry): Promise<void>;
}

// ─── Skill Runner ──────────────────────────────────────────────────────────
export interface SkillDefinition {
  name: string;
  description?: string;
  model?: string; // override model for this skill
  template: string; // prompt template with {{variables}}
  inputs: SkillInput[];
  actions?: Action[]; // optional pre-defined actions to execute
}

export interface SkillInput {
  name: string;
  prompt: string; // prompt shown to user to collect the value
  default?: string;
}

// ─── Scheduled Tasks ──────────────────────────────────────────────────────
export interface ScheduledTask {
  id: string;
  name: string;
  command: string; // user input to send to agent loop
  intervalMs: number; // recurring interval
  enabled: boolean;
  lastRun?: string;
  nextRun: string;
  runCount: number;
}

// ─── Action Context (passed into every primitive) ──────────────────────────
export interface ActionContext {
  emitHud: HudEmitter;
  appendInbox: (event: InboxEvent) => Promise<void>;
  audit: AuditLogger;
  llm?: unknown; // OpenAI instance — injected for compact-memory and run-skill
  model?: string; // configured model name — for compact-memory
  state?: AgentState;
}

// ─── File Entry (used by file_list HUD channel and list-files-detailed) ─────
export interface FileEntry {
  name: string;
  path: string;
  size: number;
  modified: string;
  type: "file" | "dir";
  extension: string;
}

/// Re-export the OpenAI type for compact-memory
export type { OpenAI };

// ═══════════════════════════════════════════════════════════════════════════════
// ARCHITECTURE ADAPTATIONS (from Hermes Agent + Pi)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Result Type (Pi pattern: never-throw for expected failures) ──────────────
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Convert an ActionResult to a Result for pipeline compatibility. */
export function actionResultToResult(r: ActionResult): Result<unknown> {
  return r.ok ? { ok: true, value: r.data } : { ok: false, error: r.error ?? "unknown error" };
}

// ─── Structured Stream Events (Hermes pattern: typed event vocabulary) ────────
// These events form the agent→UI delivery contract. The UI subscribes to
// typed events and builds its own state, completely decoupled from the loop.

export type AgentEventType =
  | "agent_start"
  | "agent_end"
  | "turn_start"
  | "turn_end"
  | "message_start"
  | "message_chunk"
  | "message_end"
  | "tool_call_start"
  | "tool_call_chunk"
  | "tool_call_end"
  | "tool_execution_start"
  | "tool_execution_update"
  | "tool_execution_end"
  | "commentary"
  | "error"
  | "compression_start"
  | "compression_end"
  | "approval_required"
  | "steering_injected";

export interface AgentEventBase {
  type: AgentEventType;
  timestamp: number;
}

export type AgentEvent =
  | (AgentEventBase & { type: "agent_start" })
  | (AgentEventBase & { type: "agent_end"; reason: string; durationMs: number; iterations: number })
  | (AgentEventBase & { type: "turn_start"; iteration: number; contextTokens: number; budgetRemaining: number })
  | (AgentEventBase & { type: "turn_end"; iteration: number; reason: string; durationMs: number; tokensUsed: number })
  | (AgentEventBase & { type: "message_start" })
  | (AgentEventBase & { type: "message_chunk"; text: string })
  | (AgentEventBase & { type: "message_end"; fullText: string })
  | (AgentEventBase & { type: "tool_call_start"; toolName: string; index: number; argsPreview?: string })
  | (AgentEventBase & { type: "tool_call_chunk"; toolName: string; chunk: string; index: number })
  | (AgentEventBase & { type: "tool_call_end"; toolName: string; index: number; durationMs: number; ok: boolean })
  | (AgentEventBase & { type: "tool_execution_start"; toolName: string; action: Action })
  | (AgentEventBase & { type: "tool_execution_update"; toolName: string; chunk: string })
  | (AgentEventBase & { type: "tool_execution_end"; toolName: string; result: ActionResult; durationMs: number })
  | (AgentEventBase & { type: "commentary"; text: string })
  | (AgentEventBase & { type: "error"; severity: ErrorSeverity; message: string; suggestion: string })
  | (AgentEventBase & { type: "compression_start"; mode: "batch" | "micro" })
  | (AgentEventBase & { type: "compression_end"; turnsCompacted: number; tokensFreed: number })
  | (AgentEventBase & { type: "approval_required"; action: Action; detail: string })
  | (AgentEventBase & { type: "steering_injected"; text: string });

export type AgentEventSubscriber = (event: AgentEvent) => void;

// ─── 3-Phase Tool Pipeline (Pi pattern: prepare → execute → finalize) ────────

export interface ToolPrepareResult {
  /** Whether the tool call passed validation and should proceed. */
  allowed: boolean;
  /** If not allowed, the reason (shown to LLM). */
  reason?: string;
  /** If approval is needed before execution. */
  requiresApproval?: boolean;
  /** Sanitized/transformed action (e.g. path normalization). */
  sanitizedAction?: Action;
  /** Which files this action will touch (for mutation queue). */
  affectedPaths?: string[];
  /** Execution mode override. */
  executionMode?: "sequential" | "parallel";
}

export interface ToolFinalizeResult {
  /** The final result text sent back to the LLM. */
  resultText: string;
  /** Whether to trigger any side effects (e.g. file watches). */
  sideEffects?: string[];
}

/** Tools that want to participate in the 3-phase pipeline implement this. */
export interface PipelineTool {
  /** Phase 1: Validate, sanitize, check policy, determine parallelism. */
  prepare?(action: Action, ctx: ActionContext): Promise<ToolPrepareResult>;
  /** Phase 3: Post-process result, trigger side effects, clean up. */
  finalize?(action: Action, result: ActionResult, ctx: ActionContext): Promise<ToolFinalizeResult>;
}

// ─── Dual-Queue Message Injection (Pi pattern: steering + follow-up) ─────────
// Steering: injected between tool-call turns (real-time user guidance)
// Follow-up: queued for after the agent would otherwise stop

export type QueueMode = "all" | "one-at-a-time";

export interface QueuedMessage {
  id: string;
  text: string;
  queuedAt: number;
  mode: QueueMode;
}

// ─── Enhanced Agent State additions ──────────────────────────────────────────
// These fields extend the existing AgentState for the new architecture.

export interface AgentLoopConfig {
  /** Maximum iterations per user turn (default: 8). */
  maxIterations: number;
  /** Maximum parallel tool executions (default: 4). */
  maxParallelTools: number;
  /** Enable micro-compaction after each turn (default: false). */
  microCompaction: boolean;
  /** Maximum tool result size in chars (default: 128000). */
  maxToolResultChars: number;
  /** Maximum tool result lines to keep in context (head-truncation). */
  maxToolResultLines: number;
  /** Tool execution timeout in ms (default: 60000). */
  toolTimeoutMs: number;
  /** Enable parallel independent tool execution (default: true). */
  parallelTools: boolean;
  /** Maximum retries for LLM calls (default: 2). */
  maxRetries: number;
  /** Maximum backoff in ms (default: 8000). */
  maxBackoffMs: number;
}

export const DEFAULT_LOOP_CONFIG: AgentLoopConfig = {
  maxIterations: 8,
  maxParallelTools: 4,
  microCompaction: false,
  maxToolResultChars: 128_000,
  maxToolResultLines: 500,
  toolTimeoutMs: 60_000,
  parallelTools: true,
  maxRetries: 2,
  maxBackoffMs: 8_000,
};

// ─── Tool Execution Groups (Hermes pattern: safety-based segmentation) ────────

export interface ToolExecutionPlan {
  /** Groups of tools that can run in parallel within each group. */
  groups: ToolExecutionGroup[];
}

export interface ToolExecutionGroup {
  /** Actions in this group — executed sequentially within, parallel across groups. */
  actions: Array<{ action: Action; index: number }>;
  /** Whether this group contains destructive operations (must run alone). */
  isDestructive: boolean;
}

// ─── File Mutation Queue (Pi pattern: serialize concurrent file writes) ───────

export interface FileMutationQueue {
  /** Enqueue a file operation — returns a promise that resolves when safe to proceed. */
  enqueue(filePath: string, operation: () => Promise<void>): Promise<void>;
  /** Drain all pending operations. */
  drain(): Promise<void>;
  /** Number of pending operations. */
  pending: number;
}

// ─── Compaction Types (Hermes micro-compaction + Pi retained-tail) ─────────────

export interface CompactionEntry {
  /** The LLM-generated summary of compacted turns. */
  summary: string;
  /** Number of message turns that were compacted. */
  turnsCompacted: number;
  /** Tokens before compaction. */
  tokensBefore: number;
  /** Tokens after compaction. */
  tokensAfter: number;
  /** Timestamp of compaction. */
  compactedAt: number;
}

// ─── Extended Audit Events ────────────────────────────────────────────────────

export type ExtendedAuditEventType =
  | AuditEventType
  | "provider_rotated"
  | "tool_parallel_group_start"
  | "tool_parallel_group_end"
  | "micro_compaction"
  | "steering_message"
  | "follow_up_message"
  | "file_mutation_queued"
  | "tool_prepared"
  | "tool_finalized";
