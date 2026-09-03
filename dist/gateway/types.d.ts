/**
 * Supported communication channel identifiers.
 */
export type ChannelType = "sms" | "telegram" | "whatsapp" | "sip" | "webhook" | "local";
/**
 * Status of a channel adapter instance.
 */
export type ChannelStatus = "disconnected" | "connecting" | "connected" | "error" | "disabled";
/**
 * Normalized incoming message from any channel.
 * All channel adapters convert their native format into this shape
 * before forwarding to the AgentLoop pipeline.
 */
export interface GatewayMessage {
    /** Unique message identifier (UUID v4). */
    id: string;
    /** Channel the message arrived on. */
    channel: ChannelType;
    /** Source identifier — phone number, chat ID, SIP URI, webhook sender, etc. */
    source: string;
    /** Human-readable device or origin identifier. */
    sourceDevice: string;
    /** Text content of the message. */
    text: string;
    /** Optional media attachment URL (image, audio, document). */
    mediaUrl?: string;
    /** Unix epoch timestamp (ms). */
    timestamp: number;
    /** Channel-specific metadata (e.g., SIP call ID, Telegram message ID). */
    metadata: Record<string, unknown>;
}
/**
 * Normalized outgoing response routed back through a specific channel.
 */
export interface GatewayResponse {
    /** Target channel for delivery. */
    targetChannel: ChannelType;
    /** Target identifier — phone number, chat ID, SIP URI, etc. */
    targetId: string;
    /** Text content of the response. */
    text: string;
    /** Optional media URL to include in the response. */
    mediaUrl?: string;
    /** Unix epoch timestamp (ms). */
    timestamp: number;
}
/**
 * Contract that every channel adapter must implement.
 * The GatewayManager calls these methods to control the adapter lifecycle.
 */
export interface ChannelAdapter {
    /** Channel type this adapter handles. */
    type: ChannelType;
    /** Human-readable adapter name for logging/UI. */
    name: string;
    /**
     * Initialize the adapter with channel-specific configuration.
     * Must set up any connections, webhooks, or polling loops.
     * Should resolve silently if the channel is disabled.
     */
    initialize(config: ChannelConfig): Promise<void>;
    /**
     * Send an outgoing message through this channel.
     * Must handle text and optionally media attachments.
     */
    sendMessage(response: GatewayResponse): Promise<void>;
    /**
     * Gracefully shut down the adapter.
     * Must clean up connections, polling loops, and resources.
     */
    shutdown(): Promise<void>;
    /**
     * Register a handler for incoming messages.
     * The handler receives normalized GatewayMessage objects.
     * Optional — adapters that don't receive messages can omit this.
     */
    onMessage?: (handler: (msg: GatewayMessage) => Promise<void>) => void;
    /**
     * Get the current operational status of this adapter.
     */
    getStatus?(): ChannelStatus;
    /**
     * Get channel-specific health or diagnostic information.
     */
    getDiagnostics?(): Record<string, unknown>;
}
/**
 * Per-channel configuration block.
 * The `enabled` flag is required; all other keys are channel-specific.
 */
export interface ChannelConfig {
    /** Whether this channel is active. */
    enabled: boolean;
    /** Additional channel-specific settings. */
    [key: string]: unknown;
}
/**
 * Top-level gateway configuration persisted to state/gateway-config.json.
 */
export interface GatewayConfig {
    /** Per-channel configuration map. */
    channels: Partial<Record<ChannelType, ChannelConfig>>;
    /** Default channel used when none is specified. */
    defaultChannel: ChannelType;
    /** Whether to persist message history to disk. */
    messageHistory: boolean;
    /** Maximum number of messages to retain in memory. */
    maxHistorySize: number;
    /** Maximum messages per minute per device (rate limiting). */
    rateLimitPerMinute: number;
    /** Message queue max size before dropping oldest. */
    maxQueueSize: number;
}
/**
 * Default gateway configuration values.
 */
export declare const DEFAULT_GATEWAY_CONFIG: GatewayConfig;
/**
 * Represents an active connection from a device/channel.
 * Tracked by the GatewayManager for session management.
 */
export interface DeviceSession {
    /** Unique session identifier. */
    deviceId: string;
    /** Channel this session is connected through. */
    channel: ChannelType;
    /** Source identifier (phone number, chat ID, etc.). */
    source: string;
    /** Human-readable device or origin identifier. */
    sourceDevice: string;
    /** When this session was first established (Unix ms). */
    connectedAt: number;
    /** Last message or activity timestamp (Unix ms). */
    lastActivity: number;
    /** Session-specific metadata. */
    metadata: Record<string, unknown>;
    /** Whether the device has been authenticated. */
    authenticated: boolean;
}
/**
 * Runtime statistics exposed by the GatewayManager.
 */
export interface GatewayStats {
    /** Total uptime in seconds since initialization. */
    uptimeSeconds: number;
    /** Number of currently connected device sessions. */
    connectedDevices: number;
    /** Messages received per channel. */
    messagesReceived: Record<ChannelType, number>;
    /** Messages sent per channel. */
    messagesSent: Record<ChannelType, number>;
    /** Total messages in the delivery queue. */
    queueSize: number;
    /** Number of rate-limited messages dropped. */
    rateLimitedDropped: number;
    /** Per-channel adapter status. */
    channelStatus: Record<ChannelType, ChannelStatus>;
}
/**
 * Internal representation of a message awaiting delivery.
 */
export interface QueuedMessage {
    /** The response to deliver. */
    response: GatewayResponse;
    /** Number of delivery attempts so far. */
    attempts: number;
    /** Max number of attempts before dropping. */
    maxAttempts: number;
    /** When this message was queued (Unix ms). */
    queuedAt: number;
    /** Next retry timestamp (Unix ms). */
    nextRetryAt: number;
}
/**
 * Normalized inbound webhook request (used by SMS, WhatsApp, Webhook channels).
 */
export interface WebhookRequest {
    /** HTTP method of the incoming request. */
    method: string;
    /** Raw body of the request. */
    body: unknown;
    /** Query string parameters. */
    query: Record<string, string>;
    /** HTTP headers. */
    headers: Record<string, string | string[] | undefined>;
    /** Client IP address. */
    ip: string;
}
export type { ChannelConfig as Config };
//# sourceMappingURL=types.d.ts.map