"use strict";
// ─── voice-call ──────────────────────────────────────────────────────
// Manages voice call state for the M.A.I. agent. Actual audio handling
// is client-side; this primitive manages state and emits HUD events.
Object.defineProperty(exports, "__esModule", { value: true });
exports.voiceCall = voiceCall;
// In-memory voice call state (could be persisted to ctx.state in the future)
const voiceCallState = {
    active: false,
    startedAt: null,
    transcript: "",
};
async function voiceCall(action, ctx) {
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
            ctx.emitHud("activity_log", {
                message: "Voice call started",
                level: "info",
            });
        }
        else if (operation === "stop") {
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
            ctx.emitHud("activity_log", {
                message: `Voice call stopped after ${duration}s`,
                level: "info",
            });
        }
        // Emit current state for both status and start/stop operations
        ctx.emitHud("activity_log", {
            message: `Voice call state: ${voiceCallState.active ? "active" : "inactive"}`,
            level: "info",
        });
        return {
            ok: true,
            data: {
                active: voiceCallState.active,
                startedAt: voiceCallState.startedAt,
                transcript: voiceCallState.transcript,
                operation,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Voice call operation failed: ${message}` };
    }
}
//# sourceMappingURL=voice-call.js.map