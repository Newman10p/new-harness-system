// ─── M.A.I. Gateway Module ─────────────────────────────────────────────────
// Barrel export for the multi-device gateway system.
//
// Usage:
//   import { GatewayManager, SmsChannel, TelegramChannel, ... } from "../gateway/index.js";

// Core types
export type {
  ChannelType,
  ChannelStatus,
  GatewayMessage,
  GatewayResponse,
  ChannelAdapter,
  ChannelConfig,
  GatewayConfig,
  DeviceSession,
  GatewayStats,
  QueuedMessage,
  WebhookRequest,
} from "./types.js";

export { DEFAULT_GATEWAY_CONFIG } from "./types.js";

// Core manager
export { GatewayManager } from "./GatewayManager.js";

// Channel adapters
export { SmsChannel } from "./channels/SmsChannel.js";
export { TelegramChannel } from "./channels/TelegramChannel.js";
export { WhatsAppChannel } from "./channels/WhatsAppChannel.js";
export { SipChannel } from "./channels/SipChannel.js";
export { WebhookChannel } from "./channels/WebhookChannel.js";

// SIP types (re-exported for convenience)
export type { SipCall, CallState } from "./channels/SipChannel.js";
