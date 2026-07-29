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
import { ContextAssembler } from "./ContextAssembler.js";
import { ResponseParser } from "./ResponseParser.js";
import { PolicyEngine } from "../security/PolicyEngine.js";
import { ActionRegistry } from "../actions/index.js";
import { MAX_LOOP_ITERATIONS } from "./constants.js";
import { loadProviders, createClients, callWithFallback, type LLMInstance } from "./MultiProvider.js";

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

    // Build context payload (inbox + memory)
    let contextPayload = "";
    try {
      contextPayload = await ContextAssembler.assembleContextPayload();
    } catch {
      // Non-fatal — proceed without context
    }

    // Build the full user message with context
    const userContent = contextPayload
      ? `## User Input\n\n${input}\n\n---\n\n## Current Context\n\n${contextPayload}`
      : input;

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
          this.callbacks.onText?.(parsed.text);
          this.hudEmitter("jarvis_speech", { text: parsed.text });
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

    const stream = await client.client.chat.completions.create({
      model: client.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    });

    let fullText = "";
    let buffer = "";

    for await (const chunk of stream as AsyncIterable<{ choices?: Array<{ delta?: { content?: string } }> }>) {
      const token = chunk.choices?.[0]?.delta?.content;
      if (token) {
        buffer += token;
        fullText += token;

        // Stream tokens in ~50-char chunks for smoother display
        if (buffer.length >= 50) {
          this.callbacks.onToken?.(buffer);
          buffer = "";
        }
      }
    }

    // Flush remaining buffer
    if (buffer) {
      this.callbacks.onToken?.(buffer);
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

  private waitForApproval(action: Action): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.state.pendingApproval = { action, resolve };
    });
  }
}
