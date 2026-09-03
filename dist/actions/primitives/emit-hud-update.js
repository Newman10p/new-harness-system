"use strict";
// ─── emit-hud-update ──────────────────────────────────────────────────────
// Sends a structured payload to the HUD frontend via WebSocket.
// Validates the channel name before emitting.
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitHudUpdate = emitHudUpdate;
const VALID_CHANNELS = [
    "jarvis_speech",
    "activity_log",
    "system_metrics",
    "threat_level",
    "reactor_pulse",
];
async function emitHudUpdate(action, ctx) {
    const channel = String(action.channel ?? "");
    const payload = action.payload;
    if (!channel) {
        return { ok: false, error: "Missing required field: channel" };
    }
    if (!VALID_CHANNELS.includes(channel)) {
        return {
            ok: false,
            error: `Invalid HUD channel: ${channel}. Valid: ${VALID_CHANNELS.join(", ")}`,
        };
    }
    if (!payload || typeof payload !== "object") {
        return { ok: false, error: "Missing or invalid field: payload (must be an object)" };
    }
    // Emit through the HUD broadcast function wired via ActionContext
    ctx.emitHud(channel, payload);
    return {
        ok: true,
        data: { channel, emitted: true },
    };
}
//# sourceMappingURL=emit-hud-update.js.map