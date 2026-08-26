// ─── M.A.I. Agent Loop ─────────────────────────────────────────────────────
// Hermes-adapted Agent Loop:
//
//   1. ASSEMBLE  — 3-tier prompt (stable → context → volatile) + preflight compression
//   2. INFER     — Interruptible LLM call with error classification + retry
//   3. PARSE     — Native tool_calls > markdown action blocks (dual mode)
//   4. ENFORCE   — PolicyEngine firewall validation
//   5. EXECUTE   — Sequential action dispatch with timeout
//   6. STREAM    — Live tokens + interim status to HUD
//   7. LOOP      — Continue if actions executed, with iteration budget
//
// Hermes patterns adapted:
//   - Interruptible API calls (AbortController)
//   - Preflight context compression (>85% triggers)
//   - Error classification with intelligent retry
//   - Message alternation enforcement
//   - Iteration budget tracking
//   - Post-turn memory flush
//   - Session persistence on turn completion

import type {
  ChatMessage,
  Action,
  ActionResult,
  AgentState,
  LLMConfig,
  HudEmitter,
  InboxEvent,
  AuditEntry,
  ClassifiedError,
} from "../types/index.js";
import { createRequire } from "node:module";
import { ContextAssembler } from "./ContextAssembler.js";
import { ResponseParser } from "./ResponseParser.js";
import { PolicyEngine } from "../security/PolicyEngine.js";
import { ActionRegistry } from "../actions/index.js";
import { MAX_LOOP_ITERATIONS } from "./constants.js";
import { loadProviders, createClients, callWithFallback, streamWithProvider, streamWithTools, supportsToolCalling, type LLMInstance, type StreamWithToolsResult } from "./MultiProvider.js";
import { getToolSchemas } from "./ToolSchema.js";

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
  private maxRetries = 2;
  private sessionSaveDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(
    llmConfig: LLMConfig,
    policyEngine: PolicyEngine,
    registry: ActionRegistry,
    callbacks: AgentLoopCallbacks = {}
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

    const envToolCalling = process.env.NATIVE_TOOL_CALLING;
    this.useNativeToolCalling = envToolCalling !== "false";

    // Hermes-style state initialization
    this.state = {
      messages: [],
      loopCount: 0,
      isRunning: false,
      pendingApproval: null,
      lastSpeechText: "",
      consecutiveMalformed: 0,
      sessionId: this.generateSessionId(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      totalTokensUsed: 0,
      totalActionsExecuted: 0,
      compressionCount: 0,
      aborted: false,
      iterationBudget: MAX_LOOP_ITERATIONS,
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

  setHudEmitter(fn: HudEmitter): void { this.hudEmitter = fn; }
  setInboxAppender(fn: (event: InboxEvent) => Promise<void>): void { this.inboxAppender = fn; }
  setAudit(fn: (entry: AuditEntry) => Promise<void>): void { this.audit = fn; }

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
    const maxLoops = MAX_LOOP_ITERATIONS;
    const turnStartTime = Date.now();
    let turnTokensUsed = 0;

    try {
      while (this.state.loopCount < maxLoops && this.state.isRunning && !this.state.aborted) {
        this.state.loopCount++;
        const iteration = this.state.loopCount;

        this.callbacks.onLoopStart?.(iteration);

        // ─── Phase 0: PREFLIGHT (Hermes pattern) ──
        // Check context pressure and compress if needed before calling LLM
        const compressionResult = await ContextAssembler.compressIfNeeded(this.state.messages);
        if (compressionResult) {
          this.state.messages = compressionResult.messages as ChatMessage[];
          this.state.compressionCount++;
          this.hudEmitter("interim_message", {
            type: "compressing",
            detail: `Compressed ${compressionResult.turnsRemoved} turns to free context`,
          });
          this.audit({
            type: "context_compressed",
            detail: `Compressed ${compressionResult.turnsRemoved} turns. Session compression #${this.state.compressionCount}`,
            ok: true,
          });
        }

        // Emit turn start with context info (Hermes UX pattern)
        const tokenEstimate = ContextAssembler.estimateTokens(this.state.messages);
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

        let rawResponse: string;
        let toolCallResult: StreamWithToolsResult | null = null;

        try {
          const llmResult = await this.callLLMWithRetry(this.state.messages);
          rawResponse = llmResult.text;
          toolCallResult = llmResult.toolCalls;
          turnTokensUsed += rawResponse.length;
        } catch (err) {
          const classified = classifyError(err);
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
          if (this.retryCount >= this.maxRetries) {
            this.hudEmitter("silent_text", {
              text: `I'm having trouble connecting right now (${classified.severity}). Please try again in a moment.`,
            });
            this.callbacks.onLoopEnd?.(iteration, `retries exhausted: ${classified.severity}`);
            break;
          }

          continue; // Retry loop
        }

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

        // Stream conversational text
        if (parsed.text) {
          const normalizedText = parsed.text.trim();
          if (normalizedText !== this.state.lastSpeechText) {
            this.state.lastSpeechText = normalizedText;
            this.callbacks.onText?.(parsed.text);
            this.hudEmitter("jarvis_speech", { text: parsed.text });
          } else {
            this.callbacks.onText?.(parsed.text);
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

        // No actions → done
        if (parsed.actions.length === 0) {
          this.callbacks.onLoopEnd?.(iteration, "no actions — response complete");
          break;
        }

        // Valid actions → reset malformed counter
        this.state.consecutiveMalformed = 0;

        // ─── Phase 4+5+6: ENFORCE + EXECUTE + STREAM ──
        this.hudEmitter("interim_message", {
          type: "tool_call",
          detail: `Executing ${parsed.actions.length} action(s)...`,
        });

        // Silent status
        if (parsed.actions.length > 0) {
          const actionNames = parsed.actions.map(a => a.action).join(", ");
          this.hudEmitter("silent_text", {
            text: `Working on ${parsed.actions.length > 1 ? `those ${parsed.actions.length} tasks` : actionNames}...`,
          });
        }

        const results: string[] = [];

        for (const action of parsed.actions) {
          if (this.state.aborted) break;

          const decision = this.policyEngine.validateAction(action, this.registry.listActions());

          if (!decision.allowed) {
            this.callbacks.onPolicyViolation?.(action, decision.reason);
            this.hudEmitter("threat_level", {
              level: "orange",
              detail: `Policy blocked [${action.action}]: ${decision.reason}`,
            });
            results.push(`[${action.action}] BLOCKED by policy: ${decision.reason}`);
            continue;
          }

          if (this.policyEngine.requiresApproval(action.action)) {
            this.callbacks.onApprovalRequired?.(action);
            this.hudEmitter("activity_log", {
              message: `Approval required for: ${action.action}`, level: "warn",
            });
            this.hudEmitter("interim_message", { type: "waiting_approval", detail: `Waiting for approval: ${action.action}` });
            const params = Object.entries(action)
              .filter(([k]) => k !== "action")
              .map(([k, v]) => `${k}: ${typeof v === "string" ? v.slice(0, 120) : JSON.stringify(v).slice(0, 120)}`)
              .join(" | ");
            this.hudEmitter("approval_request", {
              action: action.action,
              detail: params || `Action "${action.action}" requires approval`,
            });
            const approved = await this.waitForApproval(action);
            if (!approved) {
              results.push(`[${action.action}] DENIED by user`);
              continue;
            }
          }

          this.callbacks.onActionStart?.(action);
          const actionId = `action_${Date.now()}_${action.action}`;
          this.hudEmitter("bg_activity", {
            id: actionId, action: action.action, status: "started",
            detail: `Executing ${action.action}${action.command ? ": " + String(action.command).slice(0, 80) : ""}`,
          });

          const result = await this.registry.execute(action, {
            emitHud: this.hudEmitter,
            appendInbox: this.inboxAppender,
            audit: this.audit,
            llm: this.clients[0]?.client,
            model: this.primaryModel,
            state: this.state,
          });

          this.state.totalActionsExecuted++;
          this.callbacks.onActionResult?.(action, result);

          this.hudEmitter("bg_activity", {
            id: actionId, action: action.action,
            status: result.ok ? "completed" : "failed",
            detail: result.ok ? `${action.action} completed` : `${action.action} failed: ${result.error || "unknown"}`,
            result: result.ok ? "ok" : result.error,
          });
          results.push(ResponseParser.formatActionResult(action, result));
        }

        // ─── Phase 7: LOOP ──
        if (this.state.aborted) {
          this.callbacks.onLoopEnd?.(iteration, "aborted by user");
          break;
        }

        const resultSummary = results.join("\n\n");
        this.state.messages.push({ role: "assistant", content: resultSummary });

        // Emit turn end with stats
        const turnDuration = Date.now() - turnStartTime;
        this.hudEmitter("turn_end", {
          iteration,
          reason: "action results injected — looping",
          durationMs: turnDuration,
          tokensUsed: turnTokensUsed,
        });

        this.callbacks.onLoopEnd?.(iteration, "looping");
      }
    } finally {
      const turnDuration = Date.now() - turnStartTime;
      this.state.isRunning = false;
      this.state.lastActivityAt = Date.now();
      this.state.totalTokensUsed += turnTokensUsed;
      this.interactionCount++;
      this.recentErrors = 0; // Reset error tracking on successful turn completion

      // Final turn_end emission
      this.hudEmitter("turn_end", {
        iteration: this.state.loopCount,
        reason: this.state.aborted ? "aborted" : "complete",
        durationMs: turnDuration,
        tokensUsed: turnTokensUsed,
      });

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

      if (classified.retryable && this.retryCount < this.maxRetries) {
        this.retryCount++;
        const backoff = Math.min(1000 * Math.pow(2, this.retryCount - 1), 8000);

        this.hudEmitter("interim_message", {
          type: "retrying",
          detail: `${classified.severity} — retry ${this.retryCount}/${this.maxRetries} in ${backoff}ms: ${classified.suggestion}`,
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
    });
  }
}
