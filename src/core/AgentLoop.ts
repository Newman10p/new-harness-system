// ─── M.A.I. Agent Loop ─────────────────────────────────────────────────────
// The 7-Phase Agent Loop (the "Nervous System"):
//
//   1. ASSEMBLE  — Build system prompt + context from MD brain files
//   2. INFER     — Send messages to LLM via OpenAI SDK
//   3. PARSE     — Extract ```action blocks from response
//   4. ENFORCE   — Validate actions against PolicyEngine firewall
//   5. EXECUTE   — Run approved actions via ActionRegistry
//   6. STREAM    — Send results to HUD via WebSocket
//   7. LOOP      — If actions were executed, inject results and loop back
//
// Safety: maxLoops=20 hard limit. Pending approval pauses the loop
// until a WebSocket approval_response resolves the Promise.

import OpenAI from "openai";
import type {
  ChatMessage,
  Action,
  ActionResult,
  AgentState,
  LLMConfig,
  HudEmitter,
  InboxEvent,
  HudChannel,
} from "../types/index.js";
import { ContextAssembler } from "./ContextAssembler.js";
import { ResponseParser } from "./ResponseParser.js";
import { PolicyEngine } from "../security/PolicyEngine.js";
import { ActionRegistry } from "../actions/index.js";
import { INBOX_PATH } from "./constants.js";
import fs from "node:fs/promises";
import path from "node:path";

// ─── Callbacks Interface ────────────────────────────────────────────────────
export interface AgentLoopCallbacks {
  onText?: (text: string) => void;
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
  private llm: OpenAI;
  private model: string;
  private policyEngine: PolicyEngine;
  private registry: ActionRegistry;
  private state: AgentState;
  private callbacks: AgentLoopCallbacks;
  private hudEmitter: HudEmitter = () => {};
  private inboxAppender: (event: InboxEvent) => Promise<void> = async () => {};

  constructor(
    llmConfig: LLMConfig,
    policyEngine: PolicyEngine,
    registry: ActionRegistry,
    callbacks: AgentLoopCallbacks = {}
  ) {
    this.llm = new OpenAI({
      baseURL: llmConfig.baseURL,
      apiKey: llmConfig.apiKey,
    });
    this.model = llmConfig.model;
    this.policyEngine = policyEngine;
    this.registry = registry;
    this.callbacks = callbacks;

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
   * Resolves the pending Promise that's blocking the loop.
   */
  resolveApproval(approved: boolean): void {
    if (this.state.pendingApproval) {
      const { resolve } = this.state.pendingApproval;
      this.state.pendingApproval = null;
      resolve(approved);
    }
  }

  /**
   * Wire the HUD emitter into the loop.
   * Called by the server to connect the WebSocket broadcast.
   */
  setHudEmitter(fn: HudEmitter): void {
    this.hudEmitter = fn;
  }

  /**
   * Wire the inbox appender into the loop.
   */
  setInboxAppender(fn: (event: InboxEvent) => Promise<void>): void {
    this.inboxAppender = fn;
  }

  /**
   * Clear conversation history.
   */
  clearHistory(): void {
    this.state.messages = [];
    this.state.loopCount = 0;
  }

  /**
   * Get current state (for diagnostics).
   */
  getState(): Readonly<AgentState> {
    return this.state;
  }

  // ─── Private: Main Loop ─────────────────────────────────────────────────
  private async runLoop(): Promise<void> {
    this.state.isRunning = true;
    const maxLoops = 20;

    try {
      while (this.state.loopCount < maxLoops && this.state.isRunning) {
        this.state.loopCount++;
        const iteration = this.state.loopCount;

        this.callbacks.onLoopStart?.(iteration);

        // ─── Phase 1: ASSEMBLE ──
        // Add system prompt to front of messages if not already present
        if (this.state.messages.length === 0 || this.state.messages[0].role !== "system") {
          const systemPrompt = await ContextAssembler.assembleSystemPrompt(
            this.policyEngine.getConfig()
          );
          this.state.messages.unshift({ role: "system", content: systemPrompt });
        }

        // ─── Phase 2: INFER ──
        let rawResponse: string;
        try {
          rawResponse = await this.callLLM(this.state.messages);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.callbacks.onError?.(`LLM call failed: ${message}`);
          this.callbacks.onLoopEnd?.(iteration, `LLM error: ${message}`);
          break;
        }

        // ─── Phase 3: PARSE ──
        const parsed = ResponseParser.parseResponse(rawResponse);

        // Stream conversational text to HUD and CLI
        if (parsed.text) {
          this.callbacks.onText?.(parsed.text);
          this.hudEmitter("jarvis_speech", { text: parsed.text });

          // Add assistant text to conversation
          this.state.messages.push({ role: "assistant", content: parsed.text });
        }

        if (parsed.malformedCount && parsed.malformedCount > 0) {
          this.callbacks.onError?.(
            `Parse warning: ${parsed.malformedCount} malformed action block(s) ignored`
          );
        }

        // No actions to execute — loop is done
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
            // Policy violation
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

          // Check if approval is required
          if (this.policyEngine.requiresApproval(action.action)) {
            this.callbacks.onApprovalRequired?.(action);
            this.hudEmitter("activity_log", {
              message: `Approval required for: ${action.action}`,
              level: "warn",
            });

            // Wait for WebSocket approval response
            const approved = await this.waitForApproval(action);
            if (!approved) {
              results.push(`[${action.action}] DENIED by user (approval rejected)`);
              continue;
            }
          }

          // Execute the action
          this.callbacks.onActionStart?.(action);

          const result = await this.registry.execute(action, {
            emitHud: this.hudEmitter,
            appendInbox: this.inboxAppender,
            llm: this.llm,
            state: this.state,
          });

          // Stream result
          this.callbacks.onActionResult?.(action, result);
          results.push(ResponseParser.formatActionResult(action, result));
        }

        // ─── Phase 7: LOOP ──
        // Inject action results as an assistant message and loop back
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
   * Process a single action (for standalone execution from WebSocket/API).
   */
  private async processAction(action: Action): Promise<ActionResult> {
    // Validate against policy
    const decision = this.policyEngine.validateAction(
      action,
      this.registry.listActions()
    );

    if (!decision.allowed) {
      return {
        ok: false,
        error: `Policy violation: ${decision.reason}`,
      };
    }

    // Check approval
    if (this.policyEngine.requiresApproval(action.action)) {
      const approved = await this.waitForApproval(action);
      if (!approved) {
        return { ok: false, error: "Action denied by user (approval rejected)" };
      }
    }

    // Execute
    return this.registry.execute(action, {
      emitHud: this.hudEmitter,
      appendInbox: this.inboxAppender,
      llm: this.llm,
      state: this.state,
    });
  }

  /**
   * Wait for user approval via WebSocket.
   * Returns a Promise that resolves when `resolveApproval()` is called.
   */
  private waitForApproval(action: Action): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.state.pendingApproval = { action, resolve };
    });
  }

  /**
   * Call the LLM via OpenAI SDK.
   */
  private async callLLM(messages: ChatMessage[]): Promise<string> {
    const response = await this.llm.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: 0.7,
      max_tokens: 4096,
    });

    return response.choices[0]?.message?.content ?? "";
  }
}
