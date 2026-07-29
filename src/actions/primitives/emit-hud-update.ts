// ─── emit-hud-update ──────────────────────────────────────────────────────
// Sends a structured payload to the HUD frontend via WebSocket.
// Validates the channel name before emitting.

import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";

const VALID_CHANNELS: HudChannel[] = [
  "jarvis_speech",
  "activity_log",
  "system_metrics",
  "threat_level",
  "reactor_pulse",
];

export async function emitHudUpdate(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const channel = String(action.channel ?? "");
  const payload = action.payload;

  if (!channel) {
    return { ok: false, error: "Missing required field: channel" };
  }

  if (!VALID_CHANNELS.includes(channel as HudChannel)) {
    return {
      ok: false,
      error: `Invalid HUD channel: ${channel}. Valid: ${VALID_CHANNELS.join(", ")}`,
    };
  }

  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Missing or invalid field: payload (must be an object)" };
  }

  // Emit through the HUD broadcast function wired via ActionContext
  ctx.emitHud(channel as HudChannel, payload as never);

  return {
    ok: true,
    data: { channel, emitted: true },
  };
}
