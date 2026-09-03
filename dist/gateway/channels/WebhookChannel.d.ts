import type { ChannelAdapter, ChannelConfig, ChannelStatus, GatewayMessage, GatewayResponse } from "../types.js";
/**
 * Generic webhook channel adapter for the M.A.I. gateway.
 *
 * Allows integration with any external system that can send/receive HTTP requests.
 * The inbound webhook receives messages, and the outbound webhook delivers responses.
 *
 * Security:
 * - Inbound requests are validated with HMAC-SHA256 signatures when a secret is configured
 * - Outbound requests include the HMAC signature in the X-Webhook-Signature header
 */
export declare class WebhookChannel implements ChannelAdapter {
    readonly type: "webhook";
    readonly name = "Generic Webhook";
    private config;
    private messageHandler;
    private status;
    private rateLimiter;
    private messageCount;
    private errorCount;
    private pendingReplies;
    /**
     * Initialize the webhook channel with inbound/outbound URL configuration.
     */
    initialize(config: ChannelConfig): Promise<void>;
    /**
     * Send a response via the outbound webhook URL.
     * Includes HMAC signature and custom headers.
     */
    sendMessage(response: GatewayResponse): Promise<void>;
    /**
     * Gracefully shut down the webhook channel.
     */
    shutdown(): Promise<void>;
    /**
     * Register a handler for incoming webhook messages.
     */
    onMessage(handler: (msg: GatewayMessage) => Promise<void>): void;
    /**
     * Get the current channel status.
     */
    getStatus(): ChannelStatus;
    /**
     * Get channel diagnostic information.
     */
    getDiagnostics(): Record<string, unknown>;
    /**
     * Handle an incoming webhook request.
     * Validates the payload, verifies the HMAC signature, and forwards to the gateway.
     *
     * @param body - The parsed request body
     * @param signature - The X-Webhook-Signature header value (optional)
     * @returns Result with messageId on success, or error description
     */
    handleInbound(body: unknown, signature?: string): Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    /**
     * Generate an HMAC-SHA256 signature for a payload.
     */
    generateSignature(payload: unknown): string;
    /**
     * Validate and parse the inbound payload.
     */
    private validatePayload;
}
//# sourceMappingURL=WebhookChannel.d.ts.map