import type { ChannelAdapter, ChannelConfig, ChannelStatus, GatewayMessage, GatewayResponse } from "../types.js";
interface TwilioMessagePayload {
    From: string;
    To: string;
    Body: string;
    NumMedia?: string;
    MediaUrl0?: string;
    MediaContentType0?: string;
    MessageSid?: string;
    AccountSid?: string;
    FromCity?: string;
    FromState?: string;
    FromCountry?: string;
    [key: string]: string | undefined;
}
/**
 * Twilio SMS/MMS channel adapter for the M.A.I. gateway.
 *
 * To receive messages, register a webhook handler at POST /api/gateway/sms
 * that calls `SmsChannel.handleWebhook()`.
 *
 * Example config:
 * ```json
 * {
 *   "enabled": true,
 *   "accountSid": "AC...",
 *   "authToken": "your-auth-token",
 *   "phoneNumber": "+15551234567",
 *   "webhookUrl": "https://your-server.com/api/gateway/sms",
 *   "maxMessagesPerMinute": 10
 * }
 * ```
 */
export declare class SmsChannel implements ChannelAdapter {
    readonly type: "sms";
    readonly name = "Twilio SMS";
    private config;
    private messageHandler;
    private status;
    private rateLimiter;
    private messageCount;
    private errorCount;
    /**
     * Initialize the SMS channel with Twilio credentials.
     * Validates configuration and marks the channel as connected.
     */
    initialize(config: ChannelConfig): Promise<void>;
    /**
     * Send an SMS/MMS response via Twilio REST API.
     * Supports text-only and text-with-media messages.
     */
    sendMessage(response: GatewayResponse): Promise<void>;
    /**
     * Gracefully shut down the SMS channel.
     */
    shutdown(): Promise<void>;
    /**
     * Register a handler for incoming SMS messages.
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
     * Process an incoming Twilio SMS webhook request.
     * Call this from your HTTP server at the configured webhook URL.
     *
     * @param body - The parsed Twilio webhook body
     * @returns A TwiML response string to acknowledge receipt
     */
    handleWebhook(body: TwilioMessagePayload): Promise<string>;
    /**
     * Verify that a webhook request is genuinely from Twilio.
     * Uses Twilio's signature validation.
     */
    validateSignature(url: string, params: Record<string, string>, signature: string): boolean;
    /**
     * Generate a TwiML response string.
     */
    private twimlResponse;
    /**
     * Escape special XML characters.
     */
    private escapeXml;
}
export {};
//# sourceMappingURL=SmsChannel.d.ts.map