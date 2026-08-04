// ─── M.A.I. Type System ─── Single Source of Truth ──────────────────────────
// All interfaces for the Markdown-First / Model-as-an-Engine architecture.

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
  | "web-scrape";

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
}

export interface PendingApproval {
  action: Action;
  resolve: (approved: boolean) => void;
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
  | "tts_engine_switch";

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
export type AuditEventType = "action_executed" | "action_blocked" | "action_approved" | "action_denied" | "action_timeout" | "llm_call" | "llm_error" | "policy_loaded";

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

// ─── Re-export the OpenAI type for compact-memory ───────────────────────────
export type { OpenAI };
