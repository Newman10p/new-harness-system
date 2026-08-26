// ─── M.A.I. Agent Event Bus ────────────────────────────────────────────────
// Adapted from Hermes Agent (GatewayStreamConsumer/GatewayEventDispatcher)
// and Pi (EventStream/AgentEventEmitter)
//
// The agent loop emits typed AgentEvents. The EventBus bridges these
// to: (1) the existing HudEmitter for backward compatibility, and
// (2) direct subscribers for the new streaming UI.

import type {
  AgentEvent,
  AgentEventSubscriber,
  AgentEventType,
  HudChannel,
  HudEmitter,
  HudPayloads,
  ErrorSeverity,
  Action,
  ActionResult,
} from "../types/index.js";

export class AgentEventBus {
  private subscribers = new Set<AgentEventSubscriber>();
  private hudEmitter: HudEmitter = () => {};
  private eventHistory: AgentEvent[] = [];
  private maxHistory = 1000;

  /** Wire to the existing HUD WebSocket for backward compatibility. */
  setHudEmitter(fn: HudEmitter): void {
    this.hudEmitter = fn;
  }

  /** Subscribe to typed events. Returns unsubscribe function. */
  subscribe(fn: AgentEventSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  /** Emit a typed event to all subscribers + bridge to HUD. */
  emit(event: AgentEvent): void {
    // Store in history (bounded)
    if (this.eventHistory.length >= this.maxHistory) {
      this.eventHistory.shift();
    }
    this.eventHistory.push(event);

    // Notify subscribers
    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch {
        // Subscriber errors must never break the event pipeline
      }
    }

    // Bridge to HUD (backward compatibility)
    this.bridgeToHud(event);
  }

  /**
   * Bridge typed AgentEvents to the existing HudEmitter channels.
   * This ensures the current Iron Man HUD continues working without changes.
   */
  private bridgeToHud(event: AgentEvent): void {
    const { type } = event;

    switch (type) {
      case "message_chunk":
        this.hudEmitter("live_token", { token: event.text });
        break;

      case "message_end":
        this.hudEmitter("jarvis_speech", { text: event.fullText });
        break;

      case "tool_execution_start":
        this.hudEmitter("bg_activity", {
          id: `action_${Date.now()}_${event.toolName}`,
          action: event.toolName,
          status: "started",
          detail: `Executing ${event.toolName}...`,
        });
        break;

      case "tool_execution_end": {
        const id = `action_${Date.now()}_${event.toolName}`;
        this.hudEmitter("bg_activity", {
          id,
          action: event.toolName,
          status: event.result.ok ? "completed" : "failed",
          detail: event.result.ok
            ? `${event.toolName} completed`
            : `${event.toolName} failed: ${event.result.error || "unknown"}`,
          result: event.result.ok ? "ok" : event.result.error,
        });
        break;
      }

      case "turn_start":
        this.hudEmitter("turn_start", {
          iteration: event.iteration,
          contextTokens: event.contextTokens,
          budgetRemaining: event.budgetRemaining,
        });
        break;

      case "turn_end":
        this.hudEmitter("turn_end", {
          iteration: event.iteration,
          reason: event.reason,
          durationMs: event.durationMs,
          tokensUsed: event.tokensUsed,
        });
        break;

      case "commentary":
        this.hudEmitter("silent_text", { text: event.text });
        break;

      case "error":
        this.hudEmitter("activity_log", {
          message: `[${event.severity}] ${event.message}`,  
          level: event.severity === "rate_limit" || event.severity === "context_overflow" ? "warn" : "error",
        });
        break;

      case "compression_start":
        this.hudEmitter("interim_message", {
          type: "compressing",
          detail: `${event.mode === "micro" ? "Micro-" : "Batch "}compacting context...`,
        });
        break;

      case "compression_end":
        this.hudEmitter("interim_message", {
          type: "compressing",
          detail: `Compacted ${event.turnsCompacted} turns, freed ~${event.tokensFreed} tokens`,
        });
        break;

      case "approval_required":
        this.hudEmitter("approval_request", {
          action: event.action.action,
          detail: event.detail,
        });
        break;

      case "steering_injected":
        this.hudEmitter("activity_log", {
          message: `Steering: ${event.text.slice(0, 100)}`,
          level: "info",
        });
        break;

      // agent_start, agent_end, tool_call_* — no HUD bridge needed
      // (these are primarily for subscribers)
    }
  }

  /** Convenience: emit a message chunk (streaming text). */
  emitMessageChunk(text: string): void {
    this.emit({ type: "message_chunk", text, timestamp: Date.now() });
  }

  /** Convenience: emit a commentary (interim status). */
  emitCommentary(text: string): void {
    this.emit({ type: "commentary", text, timestamp: Date.now() });
  }

  /** Convenience: emit an error event. */
  emitError(severity: ErrorSeverity, message: string, suggestion: string): void {
    this.emit({ type: "error", severity, message, suggestion, timestamp: Date.now() });
  }

  /** Get recent event history (for late subscribers / reconnecting clients). */
  getHistory(since?: number): AgentEvent[] {
    if (since === undefined) return [...this.eventHistory];
    return this.eventHistory.filter(e => e.timestamp >= since);
  }

  /** Clear event history. */
  clearHistory(): void {
    this.eventHistory.length = 0;
  }

  /** Number of active subscribers. */
  get subscriberCount(): number {
    return this.subscribers.size;
  }
}
