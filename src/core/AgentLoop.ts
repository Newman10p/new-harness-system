// ─── M.A.I. Agent Loop ─────────────────────────────────────────────────────
// The 7-Phase Agent Loop (the "Nervous System"):
//
//   1. ASSEMBLE  — Build system prompt + context from MD brain files
//   2. INFER     — Send messages to LLM via OpenAI SDK (with fallback)
//   3. PARSE     — Extract ```action blocks from response
//   4. ENFORCE   — Validate actions against PolicyEngine firewall
//   5. EXECUTE   — Run approved actions via ActionRegistry
//   6. STREAM    — Send results to HUD via WebSocket (including live tokens)
//   7. LOOP      — If actions were executed, inject results and loop back
//
// Safety: maxLoops=20 hard limit. Pending approval pauses the loop
// until a WebSocket approval_response resolves the Promise.

import type {
  ChatMessage,
  Action,
  ActionResult,
  AgentState,
  LLMConfig,
  HudEmitter,
  InboxEvent,
  AuditEntry,
} from "../types/index.js";
import { createRequire } from "node:module";
import { ContextAssembler } from "./ContextAssembler.js";
import { ResponseParser } from "./ResponseParser.js";
import { PolicyEngine } from "../security/PolicyEngine.js";
import { ActionRegistry } from "../actions/index.js";
import { MAX_LOOP_ITERATIONS } from "./constants.js";
import { loadProviders, createClients, callWithFallback, streamWithProvider, type LLMInstance } from "./MultiProvider.js";

// Lazy-load intelligence engines (files may not exist yet)
const _require = createRequire(import.meta.url);

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
    updateFromInteraction: (input: string, loopCount: number) => Promise<void>;
    getProfileSummary: () => Promise<string | null>;
  };
}>("./UserModel.js", "UserModel");

// Module-level helper for tone adaptation
function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

// ─── Callbacks Interface ────────────────────────────────────────────────────
export interface AgentLoopCallbacks {
  onText?: (text: string) => void;
  onToken?: (token: string) => void;      // live streaming token
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
  private userModel: { updateFromInteraction: (input: string, loopCount: number) => Promise<void> } | null = null;

  constructor(
    llmConfig: LLMConfig,
    policyEngine: PolicyEngine,
    registry: ActionRegistry,
    callbacks: AgentLoopCallbacks = {}
  ) {
    // Build provider chain
    const providers = loadProviders();

    // Always include the primary config as first provider if not already present
    if (providers.length === 0 || providers[0].baseURL !== llmConfig.baseURL) {
      providers.unshift({
        name: llmConfig.provider,
        baseURL: llmConfig.baseURL,
        apiKey: llmConfig.apiKey,
        model: llmConfig.model,
        priority: -1, // highest priority
      });
    }

    // Initialize intelligence engines (if available)
    if (SelfImprovementEngine) {
      try { this.selfEngine = new SelfImprovementEngine(); } catch { /* non-fatal */ }
    }
    if (UserModel) {
      try { this.userModel = new UserModel(); } catch { /* non-fatal */ }
    }

    this.clients = createClients(providers);
    this.primaryModel = llmConfig.model;
    this.policyEngine = policyEngine;
    this.registry = registry;
    this.callbacks = callbacks;

    // Enable fallback if there are multiple providers
    this.useFallback = this.clients.length > 1;

    this.state = {
      messages: [],
      loopCount: 0,
      isRunning: false,
      pendingApproval: null,
      lastSpeechText: "",
    };
  }

  /**
   * Main entry point: process a user message through the full loop.
   */
  async processUserMessage(input: string): Promise<void> {
    if (this.state.isRunning) {
      this.callbacks.onError?.("Agent loop is already running — please wait.");
      return;
    }

    // Reset speech dedup on new user message
    this.state.lastSpeechText = "";

    // Build context payload (inbox + memory)
    let contextPayload = "";
    try {
      contextPayload = await ContextAssembler.assembleContextPayload();
    } catch {
      // Non-fatal — proceed without context
    }

    // Classify intent and adapt tone (if engines available)
    let intent: { type: string; urgency: string; suggestedSystemBehavior: string } | null = null;
    let toneAddon = "";
    if (IntentClassifier) {
      try {
        intent = IntentClassifier.classify(input);
      } catch { /* non-fatal */ }
    }
    if (ToneAdapter && intent) {
      try {
        const tone = ToneAdapter.adaptTone({
          urgency: intent.urgency,
          userMood: "neutral",
          timeOfDay: getTimeOfDay(),
          errorCount: this.recentErrors,
          sessionAge: Date.now() - this.sessionStart,
          taskComplexity: intent.type === "complex_task" ? 0.8 : 0.3,
        });
        toneAddon = ToneAdapter.getSystemPromptAddon(tone);
      } catch { /* non-fatal */ }
    }

    // Build the full user message with intent analysis and context
    const userContent = intent && contextPayload
      ? `## User Input\n\n${input}\n\n## Intent Analysis\n\nType: ${intent.type}\nUrgency: ${intent.urgency}\nBehavior: ${intent.suggestedSystemBehavior}\n\n## Current Context\n\n${contextPayload}`
      : contextPayload
        ? `## User Input\n\n${input}\n\n---\n\n## Current Context\n\n${contextPayload}`
        : input;

    // If tone adaptation produced an addon, inject it as a system message
    if (toneAddon) {
      // Remove any existing system message to re-inject with tone
      this.state.messages = this.state.messages.filter(m => m.role !== "system");
      this.state.messages.push({ role: "system", content: toneAddon });
    }

    this.state.messages.push({ role: "user", content: userContent });

    // Run the loop
    await this.runLoop();
  }

  /**
   * Inject an approval response from the WebSocket HUD.
   */
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

  setHudEmitter(fn: HudEmitter): void {
    this.hudEmitter = fn;
  }

  setInboxAppender(fn: (event: InboxEvent) => Promise<void>): void {
    this.inboxAppender = fn;
  }

  setAudit(fn: (entry: AuditEntry) => Promise<void>): void {
    this.audit = fn;
  }

  clearHistory(): void {
    this.state.messages = [];
    this.state.loopCount = 0;
  }

  getState(): Readonly<AgentState> {
    return this.state;
  }

  getProviderInfo(): { count: number; names: string[] } {
    return {
      count: this.clients.length,
      names: this.clients.map((c) => c.name),
    };
  }

  // ─── Private: Main Loop ─────────────────────────────────────────────────
  private async runLoop(): Promise<void> {
    this.state.isRunning = true;
    const maxLoops = MAX_LOOP_ITERATIONS;

    try {
      while (this.state.loopCount < maxLoops && this.state.isRunning) {
        this.state.loopCount++;
        const iteration = this.state.loopCount;

        this.callbacks.onLoopStart?.(iteration);

        // ─── Phase 1: ASSEMBLE ──
        if (this.state.messages.length === 0 || this.state.messages[0].role !== "system") {
          const systemPrompt = await ContextAssembler.assembleSystemPrompt(
            this.policyEngine.getConfig()
          );
          this.state.messages.unshift({ role: "system", content: systemPrompt });
        }

        // ─── Phase 2: INFER (with streaming + fallback) ──
        let rawResponse: string;
        try {
          rawResponse = await this.callLLMStreaming(this.state.messages);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.callbacks.onError?.(`LLM call failed: ${message}`);
          this.audit({
            type: "llm_error",
            detail: message,
            ok: false,
          });
          this.callbacks.onLoopEnd?.(iteration, `LLM error: ${message}`);
          break;
        }

        // ─── Phase 3: PARSE ──
        const parsed = ResponseParser.parseResponse(rawResponse);

        // Stream conversational text to HUD and CLI
        if (parsed.text) {
          // Deduplicate: skip if same text was spoken in previous iteration
          const normalizedText = parsed.text.trim();
          if (normalizedText !== this.state.lastSpeechText) {
            this.state.lastSpeechText = normalizedText;
            this.callbacks.onText?.(parsed.text);
            this.hudEmitter("jarvis_speech", { text: parsed.text });
          } else {
            // Still push to message history for LLM context
            this.callbacks.onText?.(parsed.text);
          }
          this.state.messages.push({ role: "assistant", content: parsed.text });
        }

        if (parsed.malformedCount && parsed.malformedCount > 0) {
          this.callbacks.onError?.(
            `Parse warning: ${parsed.malformedCount} malformed action block(s) ignored`
          );
        }

        if (parsed.actions.length === 0) {
          this.callbacks.onLoopEnd?.(iteration, "no actions to execute");
          break;
        }

        // ─── Phase 4: ENFORCE + Phase 5: EXECUTE + Phase 6: STREAM ──
        const results: string[] = [];

        for (const action of parsed.actions) {
          const decision = this.policyEngine.validateAction(
            action,
            this.registry.listActions()
          );

          if (!decision.allowed) {
            this.callbacks.onPolicyViolation?.(action, decision.reason);
            this.hudEmitter("threat_level", {
              level: "orange",
              detail: `Policy blocked [${action.action}]: ${decision.reason}`,
            });
            results.push(
              `[${action.action}] BLOCKED by policy: ${decision.reason}`
            );
            continue;
          }

          if (this.policyEngine.requiresApproval(action.action)) {
            this.callbacks.onApprovalRequired?.(action);
            this.hudEmitter("activity_log", {
              message: `Approval required for: ${action.action}`,
              level: "warn",
            });
            // Direct approval request to HUD — include action parameters for visibility
            const params = Object.entries(action)
              .filter(([k]) => k !== "action")
              .map(([k, v]) => `${k}: ${typeof v === "string" ? v.slice(0, 120) : JSON.stringify(v).slice(0, 120)}`)
              .join(" | ");
            this.hudEmitter("approval_request", {
              action: action.action,
              detail: params ? `Parameters — ${params}` : `Action "${action.action}" requires your approval before execution`,
            });
            const approved = await this.waitForApproval(action);
            if (!approved) {
              results.push(`[${action.action}] DENIED by user (approval rejected)`);
              continue;
            }
          }

          this.callbacks.onActionStart?.(action);

          const result = await this.registry.execute(action, {
            emitHud: this.hudEmitter,
            appendInbox: this.inboxAppender,
            audit: this.audit,
            llm: this.clients[0]?.client, // pass primary LLM client
            model: this.primaryModel,
            state: this.state,
          });

          this.callbacks.onActionResult?.(action, result);
          results.push(ResponseParser.formatActionResult(action, result));
        }

        // ─── Phase 7: LOOP ──
        const resultSummary = results.join("\n\n");
        this.state.messages.push({
          role: "assistant",
          content: resultSummary,
        });

        this.callbacks.onLoopEnd?.(iteration, "action results injected — looping");
      }
    } finally {
      this.state.isRunning = false;
      this.interactionCount++;

      // Trigger self-improvement every 10 interactions
      if (this.selfEngine && this.interactionCount % 10 === 0) {
        this.triggerSelfReflection();
      }

      // Update user model after every interaction
      if (this.userModel) {
        try {
          await this.userModel.updateFromInteraction(input, this.state.loopCount);
        } catch { /* non-fatal */ }
      }
    }
  }

  /**
   * Call LLM with live token streaming to the HUD.
   * Falls back to next provider on failure.
   */
  private async callLLMStreaming(messages: ChatMessage[]): Promise<string> {
    const start = Date.now();

    // If we have fallback providers, use the fallback chain
    if (this.useFallback) {
      try {
        const result = await callWithFallback(
          this.clients,
          messages.map((m) => ({ role: m.role, content: m.content }))
        );

        const duration = Date.now() - start;
        this.audit({
          type: "llm_call",
          detail: `Fallback chain used, served by: ${result.providerName}`,
          durationMs: duration,
          ok: true,
        });

        // Stream the full text as tokens (for HUD display)
        this.streamAsTokens(result.content);

        return result.content;
      } catch (err) {
        const duration = Date.now() - start;
        this.audit({
          type: "llm_error",
          detail: err instanceof Error ? err.message : String(err),
          durationMs: duration,
          ok: false,
        });
        throw err;
      }
    }

    // Single provider — use streaming directly
    const client = this.clients[0];
    if (!client) throw new Error("No LLM provider configured");

    // Use streamWithProvider which handles both OpenAI SDK and Ollama native
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

        // Stream tokens in ~50-char chunks for smoother display
        if (buffer.length >= 50) {
          this.callbacks.onToken?.(buffer);
          buffer = "";
        }
      }

      // Flush remaining buffer
      if (buffer) {
        this.callbacks.onToken?.(buffer);
      }
    } catch (err) {
      const duration = Date.now() - start;
      this.audit({
        type: "llm_error",
        detail: `Provider ${client.name}: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: duration,
        ok: false,
      });
      throw err;
    }

    const duration = Date.now() - start;
    this.audit({
      type: "llm_call",
      detail: `Provider: ${client.name}, Model: ${client.model}, Tokens: ~${fullText.length}`,
      durationMs: duration,
      ok: true,
    });

    return fullText;
  }

  /**
   * Stream pre-fetched text as simulated tokens to the HUD.
   */
  private streamAsTokens(text: string): void {
    // Split into word-like chunks for display
    const chunks = text.match(/\S.{0,40}\S|\S+/g) ?? [text];
    for (const chunk of chunks) {
      this.callbacks.onToken?.(chunk + " ");
    }
  }

  /**
   * Trigger self-improvement reflection (non-blocking, non-fatal).
   */
  private async triggerSelfReflection(): Promise<void> {
    try {
      await this.selfEngine!.reflect(5);
    } catch {
      // Self-improvement should never crash the system
    }
  }

  private waitForApproval(action: Action): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.state.pendingApproval = { action, resolve };
    });
  }
}
