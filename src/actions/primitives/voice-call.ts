// ─── voice-call ──────────────────────────────────────────────────────
// Manages voice call state for the M.A.I. agent. Actual audio handling
// is client-side; this primitive manages state and emits HUD events.

import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";

// In-memory voice call state (could be persisted to ctx.state in the future)
const voiceCallState = {
  active: false,
  startedAt: null as string | null,
  transcript: "",
};

export async function voiceCall(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const operation = String(action.operation ?? "").toLowerCase();

  if (operation !== "start" && operation !== "stop" && operation !== "status") {
    return {
      ok: false,
      error: `Invalid operation: "${operation}". Must be "start", "stop", or "status".`,
    };
  }

  try {
    if (operation === "start") {
      if (voiceCallState.active) {
        return {
          ok: true,
          data: {
            ...voiceCallState,
            message: "Voice call is already active.",
          },
        };
      }

      voiceCallState.active = true;
      voiceCallState.startedAt = new Date().toISOString();
      voiceCallState.transcript = "";

      ctx.emitHud("activity_log" as HudChannel, {
        message: "Voice call started",
        level: "info",
      } as never);
    } else if (operation === "stop") {
      if (!voiceCallState.active) {
        return {
          ok: true,
          data: {
            ...voiceCallState,
            message: "No active voice call to stop.",
          },
        };
      }

      voiceCallState.active = false;
      const duration = voiceCallState.startedAt
        ? Math.round((Date.now() - new Date(voiceCallState.startedAt).getTime()) / 1000)
        : 0;

      ctx.emitHud("activity_log" as HudChannel, {
        message: `Voice call stopped after ${duration}s`,
        level: "info",
      } as never);
    }

    // Emit current state for both status and start/stop operations
    ctx.emitHud("activity_log" as HudChannel, {
      message: `Voice call state: ${voiceCallState.active ? "active" : "inactive"}`,
      level: "info",
    } as never);

    return {
      ok: true,
      data: {
        active: voiceCallState.active,
        startedAt: voiceCallState.startedAt,
        transcript: voiceCallState.transcript,
        operation,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Voice call operation failed: ${message}` };
  }
}
