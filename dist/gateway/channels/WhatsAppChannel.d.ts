import type { ChannelAdapter, ChannelConfig, ChannelStatus, GatewayMessage, GatewayResponse } from "../types.js";
interface WhatsAppWebhookEntry {
    id: string;
    changes: WhatsAppWebhookChange[];
}
interface WhatsAppWebhookChange {
    field: string;
    value: {
        messaging_product: string;
        metadata?: {
            display_phone_number: string;
            phone_number_id: string;
        };
        messages?: WhatsAppIncomingMessage[];
        statuses?: WhatsAppMessageStatus[];
        contacts?: Array<{
            wa_id: string;
            profile?: {
                name: string;
            };
        }>;
    };
}
interface WhatsAppIncomingMessage {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: {
        body: string;
        preview_url?: boolean;
    };
    image?: {
        id: string;
        mime_type: string;
        sha256: string;
        caption?: string;
    };
    document?: {
        id: string;
        mime_type: string;
        sha256: string;
        filename?: string;
        caption?: string;
    };
    audio?: {
        id: string;
        mime_type: string;
    };
    video?: {
        id: string;
        mime_type: string;
    };
    location?: {
        latitude: number;
        longitude: number;
        name?: string;
        address?: string;
    };
    contacts?: Array<{
        phones: Array<{
            wa_id: string;
            type: string;
        }>;
    }>;
    interactive?: {
        type: string;
        [key: string]: unknown;
    };
    context?: {
        from: string;
        id: string;
    };
}
interface WhatsAppMessageStatus {
    id: string;
    status: "sent" | "delivered" | "read" | "failed";
    timestamp: string;
    recipient_id: string;
    errors?: Array<{
        code: number;
        title: string;
        message: string;
    }>;
}
/**
 * WhatsApp Business API channel adapter for the M.A.I. gateway.
 *
 * Uses the Meta Cloud API (formerly Facebook Graph API) for WhatsApp Business.
 * Requires a registered WhatsApp Business phone number and access token.
 *
 * Example config:
 * ```json
 * {
 *   "enabled": true,
 *   "phoneNumberId": "110234567890",
 *   "accessToken": "EAAGm0...",
 *   "verifyToken": "my-custom-verify-token",
 *   "webhookUrl": "https://your-server.com/api/gateway/whatsapp",
 *   "maxMessagesPerMinute": 20
 * }
 * ```
 */
export declare class WhatsAppChannel implements ChannelAdapter {
    readonly type: "whatsapp";
    readonly name = "WhatsApp Business";
    private config;
    private messageHandler;
    private status;
    private rateLimiter;
    private messageCount;
    private errorCount;
    private readonly API_BASE;
    /**
     * Initialize the WhatsApp channel with Meta Cloud API credentials.
     */
    initialize(config: ChannelConfig): Promise<void>;
    /**
     * Send a message response via the WhatsApp Cloud API.
     * Supports text messages and optionally attaches media.
     */
    sendMessage(response: GatewayResponse): Promise<void>;
    /**
     * Gracefully shut down the WhatsApp channel.
     */
    shutdown(): Promise<void>;
    /**
     * Register a handler for incoming WhatsApp messages.
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
     * Verify the WhatsApp webhook during Meta's challenge-response setup.
     * Call this from GET /api/gateway/whatsapp with the query parameters.
     *
     * @returns The challenge string to echo back, or null if verification fails.
     */
    verifyWebhook(mode: string, token: string, challenge: string): string | null;
    /**
     * Process an incoming WhatsApp webhook payload.
     * Call this from POST /api/gateway/whatsapp.
     */
    handleWebhook(payload: {
        entry: WhatsAppWebhookEntry[];
    }): Promise<void>;
    /**
     * Send a pre-approved WhatsApp message template.
     * Templates must be approved by Meta before use.
     */
    sendTemplate(recipient: string, templateName: string, languageCode?: string, components?: Array<{
        type: string;
        parameters?: Array<{
            type: string;
            text: string;
        }>;
    }>): Promise<void>;
    /**
     * Process an individual incoming WhatsApp message.
     */
    private processIncomingMessage;
    /**
     * Handle a delivery status update for a sent message.
     */
    private handleDeliveryStatus;
    /**
     * Download a media file URL from WhatsApp Cloud API.
     */
    private getMediaUrl;
    /**
     * Detect media type from URL extension.
     */
    private detectMediaType;
    /**
     * Split a long message into chunks that fit within WhatsApp's limits.
     */
    private splitMessage;
    /**
     * Make an API call to the Meta Graph API.
     */
    private apiCall;
}
export {};
//# sourceMappingURL=WhatsAppChannel.d.ts.map