import type { ChannelAdapter, ChannelConfig, ChannelStatus, GatewayMessage, GatewayResponse } from "../types.js";
/**
 * Telegram Bot channel adapter for the M.A.I. gateway.
 *
 * Uses long polling via getUpdates to receive messages without requiring
 * a public webhook endpoint. Supports text, photo, and document messages.
 *
 * Example config:
 * ```json
 * {
 *   "enabled": true,
 *   "botToken": "123456:ABC-DEF...",
 *   "allowedChatIds": ["123456789"],
 *   "pollingInterval": 3000,
 *   "maxMessagesPerMinute": 20
 * }
 * ```
 */
export declare class TelegramChannel implements ChannelAdapter {
    readonly type: "telegram";
    readonly name = "Telegram Bot";
    private config;
    private messageHandler;
    private status;
    private rateLimiter;
    private pollingActive;
    private pollingTimer;
    private lastUpdateId;
    private messageCount;
    private errorCount;
    /**
     * Initialize the Telegram channel with bot token.
     * Starts the long polling loop to receive incoming messages.
     */
    initialize(config: ChannelConfig): Promise<void>;
    /**
     * Send a message response via the Telegram Bot API.
     * Supports text messages, and optionally attaches photos or documents.
     */
    sendMessage(response: GatewayResponse): Promise<void>;
    /**
     * Gracefully shut down the Telegram channel.
     * Stops polling and cleans up resources.
     */
    shutdown(): Promise<void>;
    /**
     * Register a handler for incoming Telegram messages.
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
     * Start the long-polling loop.
     * Fetches updates from Telegram Bot API at the configured interval.
     */
    private startPolling;
    /**
     * Fetch updates from the Telegram Bot API.
     */
    private fetchUpdates;
    /**
     * Process an incoming Telegram message.
     */
    private handleTelegramMessage;
    /**
     * Handle inline bot commands.
     */
    private handleCommand;
    /**
     * Handle a callback query from inline keyboard buttons.
     */
    private handleCallbackQuery;
    /**
     * Get the download URL for a Telegram file.
     */
    private getFileUrl;
    /**
     * Send a typing indicator to a chat.
     */
    private sendTypingIndicator;
    /**
     * Split a long message into chunks that fit within Telegram's limits.
     */
    private splitMessage;
    /**
     * Make an API call to the Telegram Bot API.
     */
    private apiCall;
}
//# sourceMappingURL=TelegramChannel.d.ts.map