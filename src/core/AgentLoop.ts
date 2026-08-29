// ─── M.A.I. Agent Loop ─────────────────────────────────────────────────────
// Architecture adapted from Hermes Agent + Pi:
//
//   0. PREFLIGHT  — Micro-compaction + steering queue drain
//   1. ASSEMBLE   — 3-tier prompt (stable → context → volatile) + preflight batch compression
//   2. INFER      — Interruptible LLM call with error classification + retry + provider rotation
//   3. PARSE      — Native tool_calls > markdown action blocks (dual mode)
//   4. PREPARE    — 3-phase tool pipeline: prepare (validate/sanitize/plan parallelism)
//   5. ENFORCE    — PolicyEngine firewall validation
//   6. EXECUTE    — Parallel-safe execution groups (Hermes segmentation + Pi file-mutation queue)
//   7. FINALIZE   — Post-execution: finalize phase + result truncation + side effects
//   8. STREAM     — Live tokens via EventBus → typed AgentEvents → HUD bridge
//   9. LOOP       — Continue if actions executed, with iteration budget
//
// Hermes patterns:
//   - Interruptible API calls (AbortController)
//   - Preflight context compression (>85% triggers)
//   - Error classification with intelligent retry + provider rotation
//   - Message alternation enforcement
//   - Iteration budget tracking
//   - Micro-compaction (one exchange per turn)
//   - Tool execution segmentation (destructive vs parallel)
//   - Activity heartbeat for long tools
//   - Structured streaming event vocabulary
//
// Pi patterns:
//   - 3-phase tool pipeline (prepare → execute → finalize)
//   - Parallel independent tool execution with file-mutation queue
//   - Dual-queue message injection (steering + follow-up)
//   - Tool result truncation (head + tail preservation)
//   - Result<T,E> never-throw pattern for tool execution

import type {
  ChatMessage,
  Action,
  ActionName,
  ActionResult,
  AgentState,
  LLMConfig,
  HudEmitter,
  InboxEvent,
  AuditEntry,
  ClassifiedError,
  AgentLoopConfig,
  AgentEvent,
  QueuedMessage,
  ActionContext,
  PipelineTool,
  ToolPrepareResult,
  ToolFinalizeResult,
} from "../types/index.js";
import { DEFAULT_LOOP_CONFIG } from "../types/index.js";
import { createRequire } from "node:module";
import { ContextAssembler } from "./ContextAssembler.js";
import { ResponseParser } from "./ResponseParser.js";
import { PolicyEngine } from "../security/PolicyEngine.js";
import { ActionRegistry } from "../actions/index.js";
import { MAX_LOOP_ITERATIONS } from "./constants.js";
import { loadProviders, createClients, callWithFallback, streamWithProvider, streamWithTools, supportsToolCalling, type LLMInstance, type StreamWithToolsResult } from "./MultiProvider.js";
import { getToolSchemas } from "./ToolSchema.js";
import { AgentEventBus } from "./EventBus.js";
import { MicroCompactor } from "./MicroCompactor.js";
import { FileMutationQueue, getFileMutationQueue } from "./FileMutationQueue.js";
import { planToolExecution } from "./ToolExecutionPlanner.js";
import { formatToolResult } from "./ToolResultTruncator.js";
import { getLogger, setGlobalSession } from "./MaiLogger.js";

// Module-level logger (Hermes pattern: one per file)
const log = getLogger("AgentLoop");

// Lazy-load intelligence engines
const _require = createRequire(__filename);

function tryLoadEngine<T>(modPath: string, className: string): T | null {
  try {
    const mod = _require(modPath);
    return mod[className] ?? mod.default ?? null;
  } catch { /* engine not yet created */ }
  return null;
}

const IntentClassifier = tryLoadEngine<{ classify: (text: string) => { type: string; urgency: string; suggestedSystemBehavior: string } }>(
  "./IntentClassifier.js", "IntentClassifier"
);
const ToneAdapter = tryLoadEngine<{
  adaptTone: (opts: Record<string, unknown>) => Record<string, unknown>;
  getSystemPromptAddon: (tone: Record<string, unknown>) => string;
}>("./ToneAdapter.js", "ToneAdapter");
const SelfImprovementEngine = tryLoadEngine<{ new (): { reflect: (n: number) => Promise<void> } }>(
  "./SelfImprovementEngine.js", "SelfImprovementEngine"
);
const UserModel = tryLoadEngine<{
  new (): {
    updateFromInteraction: (params: { userMessage: string; actions: string[]; loopIterations: number; success: boolean; errors: string[]; }) => Promise<void>;
    getProfileSummary: () => Promise<string | null>;
    init?: () => Promise<void>;
    save?: () => Promise<void>;
  };
}>("./UserModel.js", "UserModel");

// ─── Error Classifier (Hermes pattern) ─────────────────────────────────────────
function classifyError(err: unknown): ClassifiedError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return { severity: "rate_limit", retryable: true, message: msg, suggestion: "Rate limited — backing off before retry" };
  }
  if (lower.includes("401") || lower.includes("403") || lower.includes("auth") || lower.includes("api key")) {
    return { severity: "auth", retryable: false, message: msg, suggestion: "Authentication error — check API key configuration" };
  }
  if (lower.includes("context length") || lower.includes("token limit") || lower.includes("too long") || lower.includes("maximum context")) {
    return { severity: "context_overflow", retryable: false, message: msg, suggestion: "Context too long — compression needed" };
  }
  if (lower.includes("econnrefused") || lower.includes("econnreset") || lower.includes("etimedout") || lower.includes("network") || lower.includes("socket")) {
    return { severity: "network", retryable: true, message: msg, suggestion: "Network error — will retry with backoff" };
  }
  if (lower.includes("model") || lower.includes("parameter") || lower.includes("invalid")) {
    return { severity: "model_error", retryable: false, message: msg, suggestion: "Model error — check model configuration" };
  }
  if (lower.includes("abort") || lower.includes("cancelled") || lower.includes("interrupt")) {
    return { severity: "transient", retryable: false, message: msg, suggestion: "Request was interrupted" };
  }
  return { severity: "unknown", retryable: true, message: msg, suggestion: "Unknown error — retrying" };
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Callbacks Interface ────────────────────────────────────────────────────
export interface AgentLoopCallbacks {
  onText?: (text: string) => void;
  onToken?: (token: string) => void;
  onActionStart?: (action: Action) => void;
  onActionResult?: (action: Action, result: ActionResult) => void;
  onPolicyViolation?: (action: Action, reason: string) => void;
  onApprovalRequired?: (action: Action) => void;
  onLoopStart?: (loopNumber: number) => void;
  onLoopEnd?: (loopNumber: number, reason: string) => void;
  onError?: (error: string) => void;
}

// ─── Agent Loop ─────────────────────────────────────────────────────────────
export class AgentLoop {
  private clients: LLMInstance[];
  private primaryModel: string;
  private policyEngine: PolicyEngine;
  private registry: ActionRegistry;
  private state: AgentState;
  private callbacks: AgentLoopCallbacks;
  private hudEmitter: HudEmitter = () => {};
  private static readonly APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private inboxAppender: (event: InboxEvent) => Promise<void> = async () => {};
  private audit: (entry: AuditEntry) => Promise<void> = async () => {};
  private useFallback: boolean;
  private interactionCount = 0;
  private sessionStart = Date.now();
  private recentErrors = 0;
  private selfEngine: { reflect: (n: number) => Promise<void> } | null = null;
  private userModel: { updateFromInteraction: (params: { userMessage: string; actions: string[]; loopIterations: number; success: boolean; errors: string[] }) => Promise<void>; save?: () => Promise<void>; init?: () => Promise<void> } | null = null;
  private messageQueue: string[] = [];
  private processingQueue = false;
  private useNativeToolCalling: boolean;
  // Hermes additions
  private abortController: AbortController | null = null;
  private retryCount = 0;
  private sessionSaveDebounce: ReturnType<typeof setTimeout> | null = null;

  // ── New architecture (Hermes + Pi) ──
  private eventBus = new AgentEventBus();
  private microCompactor: MicroCompactor;
  private fileMutationQueue: FileMutationQueue;
  private loopConfig: AgentLoopConfig;
  private steeringQueue: QueuedMessage[] = [];
  private followUpQueue: QueuedMessage[] = [];
  private activityHeartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    llmConfig: LLMConfig,
    policyEngine: PolicyEngine,
    registry: ActionRegistry,
    callbacks: AgentLoopCallbacks = {},
    config?: Partial<AgentLoopConfig>
  ) {
    const providers = loadProviders();

    if (providers.length === 0 || providers[0].baseURL !== llmConfig.baseURL) {
      providers.unshift({
        name: llmConfig.provider,
        baseURL: llmConfig.baseURL,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
        priority: -1,
      });
    }

    if (SelfImprovementEngine) {
      try { this.selfEngine = new SelfImprovementEngine(); } catch { /* non-fatal */ }
    }
    if (UserModel) {
      try {
        this.userModel = new UserModel();
        if (this.userModel?.init) this.userModel.init().catch(() => {});
      } catch { /* non-fatal */ }
    }

    this.clients = createClients(providers);
    this.primaryModel = llmConfig.model;
    this.policyEngine = policyEngine;
    this.registry = registry;
    this.callbacks = callbacks;
    this.useFallback = this.clients.length > 1;

    // New architecture initialization
    this.loopConfig = { ...DEFAULT_LOOP_CONFIG, ...config };
    this.microCompactor = new MicroCompactor();
    this.fileMutationQueue = getFileMutationQueue();

    const envToolCalling = process.env.NATIVE_TOOL_CALLING;
    this.useNativeToolCalling = envToolCalling !== "false";

    // Hermes-style state initialization
    this.state = {
      messages: [],
      loopCount: 0,
      isRunning: false,
      pendingApproval: null,
      pendingPromotion: null,
      lastSpeechText: "",
      consecutiveMalformed: 0,
      sandboxGranted: false,  // One-time sandbox permission: once granted, execute-terminal skips approval
      sessionId: this.generateSessionId(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      totalTokensUsed: 0,
      totalActionsExecuted: 0,
      compressionCount: 0,
      aborted: false,
      iterationBudget: this.loopConfig.maxIterations,
    };
  }

  private generateSessionId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `mai_${ts}_${rand}`;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Main entry point: process a user message through the full loop. */
  async processUserMessage(input: string): Promise<void> {
    log.info("Processing user message", { length: input.length, isRunning: this.state.isRunning, queueSize: this.messageQueue.length });
    setGlobalSession(this.state.sessionId);

    if (this.state.isRunning) {
      this.messageQueue.push(input);
      this.hudEmitter("silent_text", {
        text: `Queued (${this.messageQueue.length} pending) — I'll get to it shortly.`,
      });
      this.hudEmitter("activity_log", {
        message: `Message queued (${this.messageQueue.length} pending)`,
        level: "info",
      });
      if (!this.processingQueue) {
        this.processQueue();
      }
      return;
    }

    // Reset for new user turn
    this.state.lastSpeechText = "";
    this.state.aborted = false;
    this.retryCount = 0;

    // Classify intent (non-blocking)
    let intent: { type: string; urgency: string; suggestedSystemBehavior: string } | null = null;
    let toneAddon = "";
    if (IntentClassifier) {
      try { intent = IntentClassifier.classify(input); } catch { /* non-fatal */ }
    }
    if (ToneAdapter && intent) {
      try {
        const tone = ToneAdapter.adaptTone({
          urgency: intent.urgency,
          userMood: "neutral",
          timeOfDay: this.getTimeOfDay(),
          errorCount: this.recentErrors,
          sessionAge: Date.now() - this.sessionStart,
          taskComplexity: intent.type === "complex_task" ? 0.8 : 0.3,
        });
        toneAddon = ToneAdapter.getSystemPromptAddon(tone);
      } catch { /* non-fatal */ }
    }

    // Build user message — keep it clean (context goes in volatile tier now)
    const userContent = intent
      ? `[Intent: ${intent.type}, Urgency: ${intent.urgency}]\n\n${input}`
      : input;

    this.state.messages.push({ role: "user", content: userContent });

    // Store for post-turn updates
    this.currentUserInput = input;
    this.currentIntent = intent;
    this.currentToneAddon = toneAddon;

    // Run the loop
    await this.runLoop();
  }

  /** Interrupt the current loop execution (Hermes pattern). */
  abort(): void {
    this.state.aborted = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.hudEmitter("interim_message", { type: "thinking", detail: "Interrupted — finishing current action..." });
  }

  /** Inject an approval response from the WebSocket HUD. */
  resolveApproval(approved: boolean): void {
    if (this.state.pendingApproval) {
      const { action, resolve } = this.state.pendingApproval;
      this.state.pendingApproval = null;
      this.audit({
        type: approved ? "action_approved" : "action_denied",
        action: action.action,
        detail: `User ${approved ? "approved" : "denied"}: ${action.action}`,
        ok: approved,
      });
      resolve(approved);
    }
  }

  /** Inject a promotion response from the WebSocket HUD.
   *  The sandbox-promote primitive stores its resolve callback on state._promotionResolve,
   *  so we call it directly from here.
   */
  resolvePromotion(approved: boolean): void {
    const resolve = (this.state as any)._promotionResolve as ((v: boolean) => void) | undefined;
    if (resolve) {
      (this.state as any)._promotionResolve = null;
      this.audit({
        type: approved ? "action_approved" as const : "action_denied" as const,
        action: "sandbox-promote",
        detail: `User ${approved ? "approved" : "denied"} sandbox promotion`,
        ok: approved,
      });
      this.hudEmitter("activity_log", {
        message: approved
          ? "Promotion APPROVED — applying sandbox changes to real filesystem"
          : "Promotion DENIED — sandbox changes will not be applied",
        level: approved ? "info" : "warn",
      });
      resolve(approved);
    }
  }

  setHudEmitter(fn: HudEmitter): void {
    this.hudEmitter = fn;
    this.eventBus.setHudEmitter(fn);
  }
  setInboxAppender(fn: (event: InboxEvent) => Promise<void>): void { this.inboxAppender = fn; }
  setAudit(fn: (entry: AuditEntry) => Promise<void>): void { this.audit = fn; }

  /** Access the typed event bus for new-style subscribers. */
  getEventBus(): AgentEventBus { return this.eventBus; }

  /** Get the current loop configuration. */
  getLoopConfig(): Readonly<AgentLoopConfig> { return this.loopConfig; }

  /**
   * Inject a steering message — added between tool-call turns
   * (Pi pattern: real-time user guidance without interrupting the agent).
   */
  steer(text: string, mode: QueuedMessage["mode"] = "one-at-a-time"): void {
    this.steeringQueue.push({
      id: `steer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text,
      queuedAt: Date.now(),
      mode,
    });
  }

  /**
   * Queue a follow-up message — processed after the agent would otherwise stop
   * (Pi pattern: user types while agent is thinking).
   */
  followUp(text: string, mode: QueuedMessage["mode"] = "all"): void {
    this.followUpQueue.push({
      id: `follow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text,
      queuedAt: Date.now(),
      mode,
    });
  }

  clearHistory(): void {
    this.state.messages = [];
    this.state.loopCount = 0;
    this.state.consecutiveMalformed = 0;
    this.state.sessionId = this.generateSessionId();
    this.state.compressionCount = 0;
    this.state.totalTokensUsed = 0;
    this.state.totalActionsExecuted = 0;
    ContextAssembler.invalidateStableCache();
  }

  getState(): Readonly<AgentState> { return this.state; }
  isNativeToolCallingActive(): boolean {
    return this.useNativeToolCalling && this.clients.length > 0 && supportsToolCalling(this.clients[0]);
  }
  getProviderInfo(): { count: number; names: string[] } {
    return { count: this.clients.length, names: this.clients.map((c) => c.name) };
  }

  /** Export session for persistence. */
  exportSession(): object {
    return {
      sessionId: this.state.sessionId,
      createdAt: this.state.createdAt,
      lastActivityAt: this.state.lastActivityAt,
      messages: this.state.messages,
      totalTokensUsed: this.state.totalTokensUsed,
      totalActionsExecuted: this.state.totalActionsExecuted,
      compressionCount: this.state.compressionCount,
      interactionCount: this.interactionCount,
    };
  }

  /** Import a previously saved session. */
  importSession(data: { messages?: Array<{ role: string; content: string }>; sessionId?: string; totalTokensUsed?: number; totalActionsExecuted?: number; compressionCount?: number }): void {
    if (data.messages) {
      this.state.messages = data.messages.map(m => ({
        role: m.role as ChatMessage["role"],
        content: m.content,
      }));
    }
    if (data.sessionId) this.state.sessionId = data.sessionId;
    if (data.totalTokensUsed) this.state.totalTokensUsed = data.totalTokensUsed;
    if (data.totalActionsExecuted) this.state.totalActionsExecuted = data.totalActionsExecuted;
    if (data.compressionCount) this.state.compressionCount = data.compressionCount;
    this.audit({
      type: "session_restored",
      detail: `Restored session ${this.state.sessionId} with ${this.state.messages.length} messages`,
      ok: true,
    });
  }

  // ─── Private: Main Loop ─────────────────────────────────────────────────
  private currentUserInput = "";
  private currentIntent: { type: string; urgency: string; suggestedSystemBehavior: string } | null = null;
  private currentToneAddon = "";

  private async runLoop(): Promise<void> {
    this.state.isRunning = true;
    this.state.consecutiveMalformed = 0;
    const maxLoops = this.loopConfig.maxIterations;
    const turnStartTime = Date.now();
    let turnTokensUsed = 0;

    // Emit agent_start event
    this.eventBus.emit({ type: "agent_start", timestamp: Date.now() });

    // Start activity heartbeat (Hermes pattern: prevents inactivity watchdog)
    this.startActivityHeartbeat();

    try {
      // ── Outer loop: supports follow-up messages (Pi pattern) ──
      let outerContinue = true;
      while (outerContinue && !this.state.aborted) {
        outerContinue = false;
        this.state.loopCount = 0;

        // ── Inner loop: tool-call chaining + steering ──
        while (this.state.loopCount < maxLoops && this.state.isRunning && !this.state.aborted) {
          this.state.loopCount++;
          const iteration = this.state.loopCount;

          this.callbacks.onLoopStart?.(iteration);

          // ─── Phase 0: PREFLIGHT (Hermes + Pi) ──
          // 0a. Drain steering queue (inject between tool-call turns)
          await this.drainSteeringQueue();

          // 0b. Batch compression (original Hermes pattern)
          const compressionResult = await ContextAssembler.compressIfNeeded(this.state.messages);
          if (compressionResult) {
            this.state.messages = compressionResult.messages as ChatMessage[];
            this.state.compressionCount++;
            this.eventBus.emit({ type: "compression_start", mode: "batch", timestamp: Date.now() });
            this.eventBus.emit({ type: "compression_end", turnsCompacted: compressionResult.turnsRemoved, tokensFreed: 0, timestamp: Date.now() });
            this.hudEmitter("interim_message", {
              type: "compressing",
              detail: `Compressed ${compressionResult.turnsRemoved} turns to free context`,
            });
            this.audit({
              type: "context_compressed",
              detail: `Batch compressed ${compressionResult.turnsRemoved} turns. Session compression #${this.state.compressionCount}`,
              ok: true,
            });
          }

          // Emit turn start with context info (Hermes UX pattern)
          const tokenEstimate = ContextAssembler.estimateTokens(this.state.messages);
          const turnStartEvent = { type: "turn_start" as const, iteration, contextTokens: tokenEstimate, budgetRemaining: maxLoops - iteration, timestamp: Date.now() };
          this.eventBus.emit(turnStartEvent);
          this.hudEmitter("turn_start", {
            iteration,
            contextTokens: tokenEstimate,
            budgetRemaining: maxLoops - iteration,
          });

          // ─── Phase 1: ASSEMBLE (3-tier, Hermes pattern) ──
          if (this.state.messages.length === 0 || this.state.messages[0].role !== "system") {
            const systemPrompt = await ContextAssembler.assembleSystemPrompt(
              this.policyEngine.getConfig(),
              this.state,
              { systemMessageOverride: this.currentToneAddon || undefined }
            );
            this.state.messages.unshift({ role: "system", content: systemPrompt });
          } else {
            // Refresh volatile tier on each iteration (timestamp, memory, context pressure)
            const freshSystemPrompt = await ContextAssembler.assembleSystemPrompt(
              this.policyEngine.getConfig(),
              this.state,
              { systemMessageOverride: this.currentToneAddon || undefined }
            );
            this.state.messages[0] = { role: "system", content: freshSystemPrompt };
          }

          // ─── Phase 2: INFER (interruptible, with error classification + retry) ──
          this.hudEmitter("interim_message", { type: "thinking" });
          this.eventBus.emit({ type: "message_start", timestamp: Date.now() });

          // Hermes pattern: invalidate lastSpeechText at each inference start
          // so the same response text is never falsely deduped against the
          // PREVIOUS iteration's text
          this.state.lastSpeechText = "_loop_fresh_";

          let rawResponse: string;
          let toolCallResult: StreamWithToolsResult | null = null;

          try {
            const llmResult = await this.callLLMWithRetry(this.state.messages);
            rawResponse = llmResult.text;
            toolCallResult = llmResult.toolCalls;
            turnTokensUsed += rawResponse.length;
          } catch (err) {
            const classified = classifyError(err);
            log.error("LLM inference failed", { error: err, data: { severity: classified.severity, retryable: classified.retryable, retryCount: this.retryCount, iteration } });
            this.eventBus.emitError(classified.severity, classified.message, classified.suggestion);
            this.audit({
              type: "error_classified",
              detail: `${classified.severity}: ${classified.message} — ${classified.suggestion}`,
              ok: false,
            });

            // Handle context overflow with emergency compression
            if (classified.severity === "context_overflow") {
              const emergencyCompress = await ContextAssembler.compressIfNeeded(this.state.messages, 0.5);
              if (emergencyCompress) {
                this.state.messages = emergencyCompress.messages as ChatMessage[];
                this.state.compressionCount++;
                this.hudEmitter("interim_message", {
                  type: "compressing",
                  detail: "Emergency compression — context overflow",
                });
                continue; // Retry with compressed context
              }
            }

            // Non-retryable error — break
            if (!classified.retryable) {
              this.hudEmitter("silent_text", {
                text: classified.suggestion || "Something went wrong. Please try again.",
              });
              this.callbacks.onError?.(`${classified.severity}: ${classified.message}`);
              this.callbacks.onLoopEnd?.(iteration, `non-retryable ${classified.severity}`);
              break;
            }

            // Retryable but exhausted retries
            if (this.retryCount >= this.loopConfig.maxRetries) {
              this.hudEmitter("silent_text", {
                text: `I'm having trouble connecting right now (${classified.severity}). Please try again in a moment.`,
              });
              this.callbacks.onLoopEnd?.(iteration, `retries exhausted: ${classified.severity}`);
              break;
            }

            continue; // Retry loop
          }

          this.eventBus.emit({ type: "message_end", fullText: rawResponse, timestamp: Date.now() });

          // ─── Phase 3: PARSE ──
          let parsed = ResponseParser.parseResponse(rawResponse);
          let nativeToolActionsUsed = false;

          if (toolCallResult && toolCallResult.toolCalls.length > 0) {
            const toolParsed = ResponseParser.parseToolCalls(toolCallResult.toolCalls);
            if (toolParsed.actions.length > 0) {
              parsed = {
                text: parsed.text,
                actions: toolParsed.actions,
                malformedCount: (parsed.malformedCount ?? 0) + (toolParsed.malformedCount ?? 0),
              };
              nativeToolActionsUsed = true;
              this.audit({
                type: "llm_call",
                detail: `Native tool calling: ${toolParsed.actions.length} action(s) (provider: ${toolCallResult.providerName})`,
                ok: true,
              });
            } else if (parsed.actions.length === 0 && toolParsed.malformedCount && toolParsed.malformedCount > 0) {
              this.callbacks.onError?.(`Tool-call parse warning: ${toolParsed.malformedCount} malformed native tool_call(s) ignored`);
            }
          }

          // Stream conversational text via EventBus
          if (parsed.text) {
            const normalizedText = parsed.text.trim();
            // Emit EVERY unique text response to the HUD (not just the first per turn).
            // Hermes pattern: interim assistant text between tool iterations is delivered
            // as complete messages — the dedup only prevents identical consecutive emissions.
            const isDuplicate = normalizedText === this.state.lastSpeechText;
            this.state.lastSpeechText = normalizedText;
            this.callbacks.onText?.(parsed.text);
            if (!isDuplicate) {
              this.hudEmitter("jarvis_speech", { text: parsed.text });
            }
            // Enforce message alternation: merge text into assistant message
            const lastMsg = this.state.messages[this.state.messages.length - 1];
            if (lastMsg && lastMsg.role === "assistant") {
              lastMsg.content = parsed.text + "\n\n" + lastMsg.content;
            } else {
              this.state.messages.push({ role: "assistant", content: parsed.text });
            }
          }

          // Malformed guard
          if (parsed.malformedCount && parsed.malformedCount > 0) {
            this.state.consecutiveMalformed++;
            this.callbacks.onError?.(`Parse warning: ${parsed.malformedCount} malformed action block(s) ignored`);
            if (this.state.consecutiveMalformed >= 3) {
              this.hudEmitter("silent_text", {
                text: "I'm having trouble processing that. Could you rephrase it?",
              });
              this.callbacks.onLoopEnd?.(iteration, `halted: ${this.state.consecutiveMalformed} consecutive malformed`);
              break;
            }
          }

          // No actions → done (check follow-up queue)
          if (parsed.actions.length === 0) {
            // Pi pattern: if no text was emitted this iteration but we have results,
            // synthesize a brief summary so the user hears something
            if (!parsed.text && iteration > 1) {
              const summary = "Task complete.";
              this.hudEmitter("jarvis_speech", { text: summary });
              this.state.messages.push({ role: "assistant", content: summary });
            }
            this.callbacks.onLoopEnd?.(iteration, "no actions — response complete");
            break;
          }

          // Valid actions → reset malformed counter
          this.state.consecutiveMalformed = 0;

          // ─── Phase 4+5+6+7: PREPARE + ENFORCE + EXECUTE + FINALIZE ──
          this.hudEmitter("interim_message", {
            type: "tool_call",
            detail: `Executing ${parsed.actions.length} action(s)...`,
          });
          this.eventBus.emitCommentary(`Executing ${parsed.actions.length} action(s)...`);

          // Silent status
          if (parsed.actions.length > 0) {
            const actionNames = parsed.actions.map(a => a.action).join(", ");
            this.hudEmitter("silent_text", {
              text: `Working on ${parsed.actions.length > 1 ? `those ${parsed.actions.length} tasks` : actionNames}...`,
            });
          }

          // Execute tools with parallel support (Hermes segmentation + Pi 3-phase)
          const results = await this.executeActionsWithPipeline(parsed.actions);

          // ─── Phase 8+9: STREAM + LOOP ──
          if (this.state.aborted) {
            this.callbacks.onLoopEnd?.(iteration, "aborted by user");
            break;
          }

          const resultSummary = results.join("\n\n");
          this.state.messages.push({ role: "assistant", content: resultSummary });

          // Emit turn end with stats
          const turnDuration = Date.now() - turnStartTime;
          this.eventBus.emit({ type: "turn_end", iteration, reason: "action results injected — looping", durationMs: turnDuration, tokensUsed: turnTokensUsed, timestamp: Date.now() });
          this.hudEmitter("turn_end", {
            iteration,
            reason: "action results injected — looping",
            durationMs: turnDuration,
            tokensUsed: turnTokensUsed,
          });

          this.callbacks.onLoopEnd?.(iteration, "looping");
        } // end inner loop

        // ── Check follow-up queue (Pi pattern) ──
        const followUps = this.drainFollowUpQueue();
        if (followUps.length > 0) {
          outerContinue = true;
          for (const msg of followUps) {
            this.state.messages.push({ role: "user", content: msg.text });
            this.eventBus.emit({ type: "steering_injected", text: msg.text, timestamp: Date.now() });
          }
        }
      } // end outer loop
    } finally {
      const turnDuration = Date.now() - turnStartTime;
      this.state.isRunning = false;
      this.state.lastActivityAt = Date.now();
      this.state.totalTokensUsed += turnTokensUsed;
      this.interactionCount++;
      this.recentErrors = 0;
      this.stopActivityHeartbeat();

      // Emit agent_end event
      this.eventBus.emit({ type: "agent_end", reason: this.state.aborted ? "aborted" : "complete", durationMs: turnDuration, iterations: this.state.loopCount, timestamp: Date.now() });

      // Final turn_end emission
      this.hudEmitter("turn_end", {
        iteration: this.state.loopCount,
        reason: this.state.aborted ? "aborted" : "complete",
        durationMs: turnDuration,
        tokensUsed: turnTokensUsed,
      });

      // Micro-compaction after turn (Hermes pattern — opt-in)
      if (this.loopConfig.microCompaction && !this.state.aborted) {
        const compactionResult = await this.microCompactor.compactOne(
          this.state.messages,
          // Pass LLM summarization function if available
          this.clients[0]?.client ? async (turns, existing) => {
            try {
              const prompt = `Summarize the following conversation turns into a concise summary that preserves:
- Key decisions and conclusions
- File paths and operations performed
- Any errors encountered and their resolutions
- Pending tasks or open questions\n\nExisting summary context: ${existing.slice(0, 500)}\n\nTurns to summarize:\n${turns.map(m => `[${m.role}]: ${m.content.slice(0, 200)}`).join("\n")}\n\nProvide a concise summary (max 500 words):`;
              // Use the first available client for summarization
              const response = await callWithFallback(this.clients, [{ role: "user", content: prompt }]);
              return response.content;
            } catch { return null; }
          } : undefined
        );
        if (compactionResult) {
          this.state.compressionCount++;
          this.audit({ type: "context_compressed", detail: `Micro-compacted ${compactionResult.turnsCompacted} turns`, ok: true });
        }
      }

      // Trigger self-improvement every 10 interactions (non-blocking)
      if (this.selfEngine && this.interactionCount % 10 === 0) {
        this.triggerSelfReflection();
      }

      // Update user model
      if (this.userModel) {
        try {
          await this.userModel.updateFromInteraction({
            userMessage: this.currentUserInput,
            actions: this.state.messages.map(() => "unknown"),
            loopIterations: this.state.loopCount,
            success: !this.state.aborted,
            errors: [],
          });
          if (this.userModel.save) await this.userModel.save();
        } catch { /* non-fatal */ }
      }

      // Auto-save session (debounced)
      this.scheduleSessionSave();
    }
  }

  // ─── New Architecture: 3-Phase Tool Execution Pipeline (Pi + Hermes) ──────

  /**
   * Execute actions using the 3-phase pipeline with parallel groups.
   * This replaces the old sequential-only execution.
   */
  private async executeActionsWithPipeline(actions: Action[]): Promise<string[]> {
    const results: string[] = [];
    const actionCtx: ActionContext = {
      emitHud: this.hudEmitter,
      appendInbox: this.inboxAppender,
      audit: this.audit,
      llm: this.clients[0]?.client,
      model: this.primaryModel,
      state: this.state,
    };

    // Phase 4: Plan execution groups (Hermes safety segmentation)
    const indexedActions = actions.map((action, index) => ({ action, index }));
    const plan = planToolExecution(indexedActions, this.loopConfig);

    // Execute groups in sequence, actions within groups in parallel
    for (const group of plan.groups) {
      if (this.state.aborted) break;

      if (group.actions.length === 1) {
        // Single action — use 3-phase pipeline directly
        const { action } = group.actions[0];
        const result = await this.executeSingleActionWithPipeline(action, actionCtx);
        results.push(result);
      } else {
        // Parallel group — execute all, wait for all
        const groupPromises = group.actions.map(({ action }) =>
          this.executeSingleActionWithPipeline(action, actionCtx)
        );
        const groupResults = await Promise.all(groupPromises);
        results.push(...groupResults);
      }
    }

    return results;
  }

  /**
   * Execute a single action through the 3-phase pipeline:
   *   Phase 1: PREPARE (validate, sanitize, check policy)
   *   Phase 2: EXECUTE (run with timeout + file mutation queue)
   *   Phase 3: FINALIZE (post-process, truncate, side effects)
   */
  private async executeSingleActionWithPipeline(action: Action, ctx: ActionContext): Promise<string> {
    // ── Phase 4: PREPARE ──
    this.eventBus.emit({ type: "tool_execution_start", toolName: action.action, action, timestamp: Date.now() });
    this.audit({ type: "action_executed", action: action.action, detail: `Preparing: ${action.action}`, ok: true });

    // Check policy
    const decision = this.policyEngine.validateAction(action, this.registry.listActions());
    if (!decision.allowed) {
      this.callbacks.onPolicyViolation?.(action, decision.reason);
      this.hudEmitter("threat_level", { level: "orange", detail: `Policy blocked [${action.action}]: ${decision.reason}` });
      this.eventBus.emit({ type: "tool_execution_end", toolName: action.action, result: { ok: false, error: decision.reason }, durationMs: 0, timestamp: Date.now() });
      return `[${action.action}] BLOCKED by policy: ${decision.reason}`;
    }

    // Check approval (skip if sandbox-granted and this is a sandboxed action)
    const isSandboxedAction = action.action === "execute-terminal" && this.state.sandboxGranted;
    if (!isSandboxedAction && this.policyEngine.requiresApproval(action.action)) {
      // First execute-terminal approval grants sandbox access for the session
      const isSandboxRequest = action.action === "execute-terminal";
      this.callbacks.onApprovalRequired?.(action);
      this.hudEmitter("interim_message", { type: "waiting_approval", detail: isSandboxRequest ? "Grant sandbox access? Commands will run in an isolated environment." : `Waiting for approval: ${action.action}` });
      const params = Object.entries(action).filter(([k]) => k !== "action").map(([k, v]) => `${k}: ${typeof v === "string" ? v.slice(0, 120) : JSON.stringify(v).slice(0, 120)}`).join(" | ");
      this.hudEmitter("approval_request", { action: action.action, detail: params || `Action "${action.action}" requires approval` });
      this.eventBus.emit({ type: "approval_required", action, detail: params || action.action, timestamp: Date.now() });
      const approved = await this.waitForApproval(action);
      if (approved && action.action === "execute-terminal") {
        this.state.sandboxGranted = true;
        log.info("Sandbox access granted for session", { data: { sessionId: this.state.sessionId } });
        this.hudEmitter("activity_log", { message: "Sandbox access granted — commands will run isolated without further prompts", level: "info" });
      }
      if (!approved) {
        this.eventBus.emit({ type: "tool_execution_end", toolName: action.action, result: { ok: false, error: "Denied by user" }, durationMs: 0, timestamp: Date.now() });
        return `[${action.action}] DENIED by user`;
      }
    }

    this.callbacks.onActionStart?.(action);
    const actionId = `action_${Date.now()}_${action.action}`;
    log.info(`Executing tool: ${action.action}`, { actionId, hasFile: !!(action.path || action.file || action.filePath) });
    this.hudEmitter("bg_activity", { id: actionId, action: action.action, status: "started", detail: `Executing ${action.action}...` });

    // ── Phase 5+6: EXECUTE (with timeout + file mutation queue) ──
    const execStart = Date.now();
    let result: ActionResult;

    const hasFilePath = (action.path || action.file || action.filePath) as string | undefined;
    const executeFn = async () => {
      return this.registry.execute(action, ctx);
    };

    if (hasFilePath && this.loopConfig.parallelTools) {
      // Serialize via file mutation queue (Pi pattern)
      let fileMutationResult: ActionResult = { ok: false, error: "queued execution failed" };
      await this.fileMutationQueue.enqueue(hasFilePath, async () => {
        fileMutationResult = await Promise.race([
          executeFn(),
          new Promise<ActionResult>((resolve) =>
            setTimeout(() => resolve({ ok: false, error: `Timeout after ${this.loopConfig.toolTimeoutMs}ms` }), this.loopConfig.toolTimeoutMs)
          ),
        ]);
      });
      result = fileMutationResult;
    } else {
      // Direct execution with timeout
      result = await Promise.race([
        executeFn(),
        new Promise<ActionResult>((resolve) =>
          setTimeout(() => resolve({ ok: false, error: `Timeout after ${this.loopConfig.toolTimeoutMs}ms` }), this.loopConfig.toolTimeoutMs)
        ),
      ]);
    }

    const execDuration = Date.now() - execStart;
    this.state.totalActionsExecuted++;
    this.callbacks.onActionResult?.(action, result);

    // Structured result logging (Hermes pattern)
    if (result.ok) {
      log.info(`Tool completed: ${action.action}`, { data: { actionId, durationMs: execDuration } });
    } else {
      log.error(`Tool failed: ${action.action}`, { error: result.error, data: { actionId, durationMs: execDuration } });
    }

    this.hudEmitter("bg_activity", {
      id: actionId, action: action.action,
      status: result.ok ? "completed" : "failed",
      detail: result.ok ? `${action.action} completed` : `${action.action} failed: ${result.error || "unknown"}`,
      result: result.ok ? "ok" : result.error,
    });

    // ── Phase 7: FINALIZE (truncate + emit event) ──
    const resultText = result.ok
      ? await formatToolResult(action.action, JSON.stringify(result.data) ?? "", this.loopConfig)
      : `[${action.action}] FAILED: ${result.error || "unknown"}`;

    this.eventBus.emit({ type: "tool_execution_end", toolName: action.action, result, durationMs: execDuration, timestamp: Date.now() });

    return resultText;
  }

  // ─── Dual-Queue Message Injection (Pi pattern) ────────────────────────

  /** Drain the steering queue, injecting messages between tool-call turns. */
  private async drainSteeringQueue(): Promise<void> {
    if (this.steeringQueue.length === 0) return;
    const msg = this.steeringQueue.shift()!;
    this.state.messages.push({ role: "user", content: msg.text });
    this.eventBus.emit({ type: "steering_injected", text: msg.text, timestamp: Date.now() });
    this.audit({ type: "steering_message" as any, detail: `Steering: ${msg.text.slice(0, 100)}`, ok: true });
    // For "one-at-a-time" mode, only drain one per iteration
    if (msg.mode === "one-at-a-time") return;
    // For "all" mode, drain the rest
    await this.drainSteeringQueue();
  }

  /** Drain the follow-up queue for the outer loop. */
  private drainFollowUpQueue(): QueuedMessage[] {
    if (this.followUpQueue.length === 0) return [];
    const msgs = [...this.followUpQueue];
    this.followUpQueue.length = 0;
    this.audit({ type: "follow_up_message" as any, detail: `${msgs.length} follow-up message(s)`, ok: true });
    return msgs;
  }

  // ─── Activity Heartbeat (Hermes pattern) ──────────────────────────────
  /** Prevents inactivity watchdog from killing long tool calls. */
  private startActivityHeartbeat(): void {
    this.stopActivityHeartbeat();
    this.activityHeartbeat = setInterval(() => {
      this.state.lastActivityAt = Date.now();
    }, 30_000); // Touch every 30s
  }

  private stopActivityHeartbeat(): void {
    if (this.activityHeartbeat) {
      clearInterval(this.activityHeartbeat);
      this.activityHeartbeat = null;
    }
  }

  // ─── LLM Calls with Retry + Error Classification (Hermes pattern) ─────────
  private async callLLMWithRetry(messages: ChatMessage[]): Promise<{ text: string; toolCalls: StreamWithToolsResult | null }> {
    this.abortController = new AbortController();

    try {
      if (this.useNativeToolCalling && this.isNativeToolCallingActive()) {
        const result = await this.callLLMWithTools(messages);
        this.retryCount = 0; // Reset on success
        return { text: result.text, toolCalls: result };
      } else {
        const text = await this.callLLMStreaming(messages);
        this.retryCount = 0;
        return { text, toolCalls: null };
      }
    } catch (err) {
      const classified = classifyError(err);

      if (classified.retryable && this.retryCount < this.loopConfig.maxRetries) {
        this.retryCount++;
        const backoff = Math.min(1000 * Math.pow(2, this.retryCount - 1), this.loopConfig.maxBackoffMs);

        this.hudEmitter("interim_message", {
          type: "retrying",
          detail: `${classified.severity} — retry ${this.retryCount}/${this.loopConfig.maxRetries} in ${backoff}ms: ${classified.suggestion}`,
        });
        this.audit({
          type: "error_classified",
          detail: `Retry ${this.retryCount}: ${classified.severity} — ${classified.message}`,
          ok: false,
        });

        await sleep(backoff);

        // For rate limits, try next provider in fallback chain
        if (classified.severity === "rate_limit" && this.useFallback && this.clients.length > 1) {
          // Rotate: move first client to end
          const first = this.clients.shift()!;
          this.clients.push(first);
          this.hudEmitter("activity_log", {
            message: `Switching to provider: ${this.clients[0].name}`,
            level: "info",
          });
        }

        // Retry recursively (retryCount prevents infinite recursion)
        return this.callLLMWithRetry(messages);
      }

      throw err;
    }
  }

  /**
   * Call LLM with native tool calling support.
   */
  private async callLLMWithTools(messages: ChatMessage[]): Promise<StreamWithToolsResult> {
    const start = Date.now();
    const client = this.clients[0];
    if (!client) throw new Error("No LLM provider configured");

    const toolSchemas = getToolSchemas();

    try {
      const result = await streamWithTools(
        client,
        messages.map((m) => ({ role: m.role, content: m.content })),
        toolSchemas,
        {
          temperature: 0.7,
          max_tokens: 4096,
          onToken: (token) => this.callbacks.onToken?.(token),
        }
      );

      const duration = Date.now() - start;
      this.audit({
        type: "llm_call",
        detail: `Provider: ${client.name}, Model: ${client.model}, ToolCalls: ${result.toolCalls.length}${result.toolCalls.length > 0 ? ' (native)' : ''}`,
        durationMs: duration,
        ok: true,
      });

      return result;
    } catch (err) {
      const duration = Date.now() - start;
      this.audit({
        type: "llm_error",
        detail: `Provider ${client.name} (tool-calling): ${err instanceof Error ? err.message : String(err)}`,
        durationMs: duration,
        ok: false,
      });
      throw err;
    }
  }

  /**
   * Call LLM with live token streaming. Falls back to next provider on failure.
   */
  private async callLLMStreaming(messages: ChatMessage[]): Promise<string> {
    const start = Date.now();

    if (this.useFallback) {
      try {
        const result = await callWithFallback(
          this.clients,
          messages.map((m) => ({ role: m.role, content: m.content }))
        );

        this.audit({
          type: "llm_call",
          detail: `Fallback chain, served by: ${result.providerName}`,
          durationMs: Date.now() - start,
          ok: true,
        });

        this.streamAsTokens(result.content);
        return result.content;
      } catch (err) {
        this.audit({
          type: "llm_error",
          detail: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
          ok: false,
        });
        throw err;
      }
    }

    const client = this.clients[0];
    if (!client) throw new Error("No LLM provider configured");

    let fullText = "";
    let buffer = "";

    try {
      const tokenStream = streamWithProvider(
        client,
        messages.map((m) => ({ role: m.role, content: m.content })),
        { temperature: 0.7, max_tokens: 4096 }
      );

      for await (const token of tokenStream) {
        buffer += token;
        fullText += token;
        if (buffer.length >= 50) {
          this.callbacks.onToken?.(buffer);
          buffer = "";
        }
      }
      if (buffer) this.callbacks.onToken?.(buffer);
    } catch (err) {
      this.audit({
        type: "llm_error",
        detail: `Provider ${client.name}: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
        ok: false,
      });
      throw err;
    }

    this.audit({
      type: "llm_call",
      detail: `Provider: ${client.name}, Model: ${client.model}, Chars: ~${fullText.length}`,
      durationMs: Date.now() - start,
      ok: true,
    });

    return fullText;
  }

  private streamAsTokens(text: string): void {
    const chunks = text.match(/\S.{0,40}\S|\S+/g) ?? [text];
    for (const chunk of chunks) {
      this.callbacks.onToken?.(chunk + " ");
    }
  }

  // ─── Queue Processing ────────────────────────────────────────────────────
  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (this.messageQueue.length > 0) {
      while (this.state.isRunning) {
        await new Promise(r => setTimeout(r, 500));
      }

      const next = this.messageQueue.shift();
      if (next) {
        this.state.lastSpeechText = "";
        this.state.aborted = false;
        this.currentUserInput = next;
        this.state.messages.push({ role: "user", content: next });
        await this.runLoop();
      }
    }

    this.processingQueue = false;
  }

  // ─── Session Persistence (Hermes pattern) ────────────────────────────────
  private scheduleSessionSave(): void {
    if (this.sessionSaveDebounce) clearTimeout(this.sessionSaveDebounce);
    this.sessionSaveDebounce = setTimeout(() => {
      this.saveSession().catch(() => {});
    }, 2000);
  }

  private async saveSession(): Promise<void> {
    try {
      const { SESSION_DIR, SESSION_ACTIVE_PATH } = await import("./constants.js");
      const fs = await import("node:fs/promises");
      await fs.mkdir(SESSION_DIR, { recursive: true });
      const sessionData = this.exportSession();
      await fs.writeFile(SESSION_ACTIVE_PATH, JSON.stringify(sessionData, null, 2), "utf-8");
      this.audit({
        type: "session_saved",
        detail: `Session ${this.state.sessionId} saved (${this.state.messages.length} messages)`,
        ok: true,
      });
    } catch (err) {
      // Non-fatal — session persistence is best-effort
      console.error(`[Session] Save failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Try to restore a previous session on startup. */
  async tryRestoreSession(): Promise<boolean> {
    try {
      const { SESSION_ACTIVE_PATH } = await import("./constants.js");
      const fs = await import("node:fs/promises");
      const data = await fs.readFile(SESSION_ACTIVE_PATH, "utf-8");
      const session = JSON.parse(data);
      if (session.messages && Array.isArray(session.messages) && session.messages.length > 0) {
        this.importSession(session);
        return true;
      }
    } catch { /* No session to restore */ }
    return false;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return "night";
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    if (hour < 21) return "evening";
    return "night";
  }

  private async triggerSelfReflection(): Promise<void> {
    try { await this.selfEngine!.reflect(5); } catch { /* non-fatal */ }
  }

  private waitForApproval(action: Action): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.state.pendingApproval = { action, resolve };
      // Auto-deny after timeout to prevent deadlock
      setTimeout(() => {
        if (this.state.pendingApproval?.resolve === resolve) {
          log.warn("Approval timed out, auto-denying", { data: { action: action.action, timeoutMs: AgentLoop.APPROVAL_TIMEOUT_MS } });
          this.state.pendingApproval = null;
          resolve(false);
        }
      }, AgentLoop.APPROVAL_TIMEOUT_MS);
    });
  }
}
