"use strict";
// ─── M.A.I. Multi-Device Gateway Types ──────────────────────────────────────
// Canonical type definitions for the gateway system.
// All channel adapters implement the ChannelAdapter interface and
// communicate via normalized GatewayMessage / GatewayResponse types.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_GATEWAY_CONFIG = void 0;
/**
 * Default gateway configuration values.
 */
exports.DEFAULT_GATEWAY_CONFIG = {
    channels: {
        sms: { enabled: false },
        telegram: { enabled: false },
        whatsapp: { enabled: false },
        sip: { enabled: false },
        webhook: { enabled: false },
        local: { enabled: true },
    },
    defaultChannel: "local",
    messageHistory: true,
    maxHistorySize: 1000,
    rateLimitPerMinute: 30,
    maxQueueSize: 500,
};
//# sourceMappingURL=types.js.map