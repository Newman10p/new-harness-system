"use strict";
// ─── M.A.I. Gateway Module ─────────────────────────────────────────────────
// Barrel export for the multi-device gateway system.
//
// Usage:
//   import { GatewayManager, SmsChannel, TelegramChannel, ... } from "../gateway/index.js";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookChannel = exports.SipChannel = exports.WhatsAppChannel = exports.TelegramChannel = exports.SmsChannel = exports.GatewayManager = exports.DEFAULT_GATEWAY_CONFIG = void 0;
var types_js_1 = require("./types.js");
Object.defineProperty(exports, "DEFAULT_GATEWAY_CONFIG", { enumerable: true, get: function () { return types_js_1.DEFAULT_GATEWAY_CONFIG; } });
// Core manager
var GatewayManager_js_1 = require("./GatewayManager.js");
Object.defineProperty(exports, "GatewayManager", { enumerable: true, get: function () { return GatewayManager_js_1.GatewayManager; } });
// Channel adapters
var SmsChannel_js_1 = require("./channels/SmsChannel.js");
Object.defineProperty(exports, "SmsChannel", { enumerable: true, get: function () { return SmsChannel_js_1.SmsChannel; } });
var TelegramChannel_js_1 = require("./channels/TelegramChannel.js");
Object.defineProperty(exports, "TelegramChannel", { enumerable: true, get: function () { return TelegramChannel_js_1.TelegramChannel; } });
var WhatsAppChannel_js_1 = require("./channels/WhatsAppChannel.js");
Object.defineProperty(exports, "WhatsAppChannel", { enumerable: true, get: function () { return WhatsAppChannel_js_1.WhatsAppChannel; } });
var SipChannel_js_1 = require("./channels/SipChannel.js");
Object.defineProperty(exports, "SipChannel", { enumerable: true, get: function () { return SipChannel_js_1.SipChannel; } });
var WebhookChannel_js_1 = require("./channels/WebhookChannel.js");
Object.defineProperty(exports, "WebhookChannel", { enumerable: true, get: function () { return WebhookChannel_js_1.WebhookChannel; } });
//# sourceMappingURL=index.js.map