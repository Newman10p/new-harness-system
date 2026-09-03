import type { ChannelAdapter, ChannelType, GatewayConfig, GatewayMessage, DeviceSession, GatewayStats } from "./types.js";
/**
 * Central orchestrator for the M.A.I. multi-device gateway system.
 *
 * Usage:
 *   const manager = new GatewayManager(agentLoop);
 *   await manager.initialize(config);
 *   manager.registerChannel(new SmsChannel());
 *   // ... messages flow through processUserMessage()
 *   await manager.shutdown();
 */
export declare class GatewayManager {
    private adapters;
    private config;
    private sessions;
    private messageHistory;
    private messageQueue;
    private rateLimiter;
    private initialized;
    private startTime;
    private stats;
    private processMessageHandler?;
    private flushInterval;
    private sessionPersistInterval;
    constructor();
    /**
     * Initialize the gateway manager with optional configuration overrides.
     * Loads persisted config, initializes rate limiter and queue, starts flush timer.
     */
    initialize(config?: Partial<GatewayConfig>): Promise<void>;
    /**
     * Register a channel adapter with the gateway.
     * Must be called before initialize() for the adapter to be started.
     */
    registerChannel(adapter: ChannelAdapter): void;
    /**
     * Gracefully shut down the gateway and all adapters.
     * Persists state, clears timers, and closes all connections.
     */
    shutdown(): Promise<void>;
    /**
     * Set the handler that processes normalized messages through the agent loop.
     * This is typically AgentLoop.processUserMessage().
     */
    setMessageProcessor(handler: (msg: string) => Promise<void>): void;
    /**
     * Handle an incoming message from any channel adapter.
     * Normalizes, rate-limits, updates session, and forwards to agent loop.
     */
    handleIncomingMessage(msg: GatewayMessage): Promise<void>;
    /**
     * Send a response through a specific channel to a specific target.
     * If the channel is unavailable, queues the message for retry.
     */
    sendResponse(channel: ChannelType, targetId: string, text: string, mediaUrl?: string): Promise<void>;
    /**
     * Broadcast a text message to ALL connected device sessions.
     * Useful for system-wide alerts and notifications.
     */
    broadcastToAll(text: string): Promise<void>;
    /**
     * Get all active device sessions.
     */
    getDeviceSessions(): DeviceSession[];
    /**
     * Get only active (recently active) sessions.
     * A session is considered active if it had activity in the last 30 minutes.
     */
    getActiveSessions(): DeviceSession[];
    /**
     * Get a specific session by device ID.
     */
    getSession(deviceId: string): DeviceSession | undefined;
    /**
     * Terminate a specific device session.
     */
    terminateSession(deviceId: string): boolean;
    /**
     * Authenticate a device session.
     */
    authenticateSession(deviceId: string): boolean;
    /**
     * Get comprehensive gateway statistics.
     */
    getStats(): GatewayStats;
    /**
     * Get the message history (limited by maxSize config).
     */
    getMessageHistory(): GatewayMessage[];
    /**
     * Get the current gateway configuration.
     */
    getConfig(): Readonly<GatewayConfig>;
    /**
     * Update gateway configuration and persist to disk.
     */
    updateConfig(updates: Partial<GatewayConfig>): Promise<void>;
    /**
     * Enable or disable a specific channel at runtime.
     */
    toggleChannel(channel: ChannelType, enabled: boolean): Promise<void>;
    /**
     * Get a registered adapter by channel type.
     */
    getAdapter(channel: ChannelType): ChannelAdapter | undefined;
    /**
     * Check whether the gateway has been initialized.
     */
    isInitialized(): boolean;
    private updateSession;
    private flushQueue;
    private loadConfig;
    private saveConfig;
    private loadSessions;
    private persistSessions;
    /**
     * Generate a unique message ID.
     */
    static generateId(): string;
}
//# sourceMappingURL=GatewayManager.d.ts.map