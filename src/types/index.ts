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
  | "schedule-task";

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
  | "reactor_pulse";

export interface HudPayloads {
  jarvis_speech: { text: string };
  activity_log: { message: string; level: "info" | "warn" | "error" };
  system_metrics: { cpu: number; memory: number; disk: number };
  threat_level: { level: "green" | "yellow" | "orange" | "red"; detail?: string };
  reactor_pulse: { power: number; status: string };
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

// ─── Re-export the OpenAI type for compact-memory ───────────────────────────
export type { OpenAI };
