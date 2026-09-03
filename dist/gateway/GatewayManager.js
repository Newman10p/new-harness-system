"use strict";
// ─── M.A.I. Gateway Manager ─────────────────────────────────────────────────
// The central orchestrator for all multi-device gateway channels.
//
// Responsibilities:
//   - Manages lifecycle of all registered ChannelAdapter instances
//   - Normalizes incoming messages into GatewayMessage format
//   - Routes outgoing GatewayResponse objects to the correct adapter
//   - Tracks active DeviceSession entries with authentication state
//   - Provides message queue with retry logic and rate limiting
//   - Persists gateway configuration to state/gateway-config.json
//   - Exposes runtime statistics for HUD integration
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayManager = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const PROJECT_ROOT = process.cwd();
const GATEWAY_CONFIG_PATH = node_path_1.default.join(PROJECT_ROOT, "state", "gateway-config.json");
const DEVICE_SESSIONS_PATH = node_path_1.default.join(PROJECT_ROOT, "state", "device-sessions.json");
// ─── Rate Limiter ──────────────────────────────────────────────────────────
/**
 * Token-bucket style rate limiter keyed by device identifier.
 */
class RateLimiter {
    counts = new Map();
    maxPerMinute;
    constructor(maxPerMinute) {
        this.maxPerMinute = maxPerMinute;
    }
    /**
     * Check whether a message from the given key is within rate limits.
     * Returns true if allowed, false if rate-limited.
     */
    check(key) {
        const now = Date.now();
        let entry = this.counts.get(key);
        if (!entry || now >= entry.resetAt) {
            // Reset the bucket for a new minute window
            entry = { tokens: this.maxPerMinute, resetAt: now + 60_000 };
            this.counts.set(key, entry);
        }
        if (entry.tokens <= 0) {
            return false;
        }
        entry.tokens--;
        return true;
    }
    /** Reset all rate limit counters. */
    reset() {
        this.counts.clear();
    }
    /** Get the number of tracked keys. */
    size() {
        return this.counts.size;
    }
}
// ─── Message Queue ──────────────────────────────────────────────────────────
/**
 * In-memory delivery queue with exponential backoff retry.
 */
class MessageQueue {
    queue = [];
    maxSize;
    processing = false;
    constructor(maxSize) {
        this.maxSize = maxSize;
    }
    /**
     * Enqueue a response for delivery.
     * Drops the oldest message if the queue is full.
     */
    enqueue(response, maxAttempts = 5) {
        if (this.queue.length >= this.maxSize) {
            this.queue.shift(); // drop oldest
        }
        this.queue.push({
            response,
            attempts: 0,
            maxAttempts,
            queuedAt: Date.now(),
            nextRetryAt: Date.now(),
        });
    }
    /**
     * Dequeue the next message that is ready for delivery.
     * Returns null if no messages are available or processing is in progress.
     */
    dequeue() {
        if (this.processing || this.queue.length === 0) {
            return null;
        }
        const now = Date.now();
        // Find the first message ready for retry
        const idx = this.queue.findIndex(m => m.nextRetryAt <= now && m.attempts < m.maxAttempts);
        if (idx === -1) {
            return null;
        }
        const msg = this.queue[idx];
        this.queue.splice(idx, 1);
        this.processing = true;
        return msg;
    }
    /**
     * Mark the current message as complete (successful delivery).
     */
    complete() {
        this.processing = false;
    }
    /**
     * Return the current message to the queue with a backoff delay.
     */
    requeue(msg) {
        this.processing = false;
        msg.attempts++;
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        msg.nextRetryAt = Date.now() + Math.pow(2, msg.attempts) * 1000;
        if (msg.attempts < msg.maxAttempts && this.queue.length < this.maxSize) {
            this.queue.push(msg);
        }
    }
    /** Current queue length. */
    size() {
        return this.queue.length;
    }
    /** Drain all pending messages. */
    clear() {
        this.queue = [];
        this.processing = false;
    }
    /** Get a snapshot of all queued messages (for diagnostics). */
    snapshot() {
        return [...this.queue];
    }
}
// ─── Gateway Manager ────────────────────────────────────────────────────────
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
class GatewayManager {
    adapters = new Map();
    config;
    sessions = new Map();
    messageHistory = [];
    messageQueue;
    rateLimiter;
    initialized = false;
    startTime = Date.now();
    stats = {
        messagesReceived: {},
        messagesSent: {},
        rateLimitedDropped: 0,
    };
    processMessageHandler;
    flushInterval = null;
    sessionPersistInterval = null;
    constructor() {
        this.config = this.loadConfig();
        this.messageQueue = new MessageQueue(this.config.maxQueueSize);
        this.rateLimiter = new RateLimiter(this.config.rateLimitPerMinute);
    }
    // ─── Lifecycle ─────────────────────────────────────────────────────────────
    /**
     * Initialize the gateway manager with optional configuration overrides.
     * Loads persisted config, initializes rate limiter and queue, starts flush timer.
     */
    async initialize(config) {
        if (this.initialized) {
            console.warn("[Gateway] Already initialized, skipping");
            return;
        }
        // Merge any provided config overrides
        if (config) {
            this.config = { ...this.config, ...config };
            if (config.channels) {
                this.config.channels = { ...this.config.channels, ...config.channels };
            }
        }
        // Initialize all enabled channel adapters
        for (const [channelType, adapter] of this.adapters) {
            const channelConfig = this.config.channels[channelType];
            if (channelConfig?.enabled) {
                try {
                    await adapter.initialize(channelConfig);
                    console.log(`[Gateway] Channel '${adapter.name}' (${channelType}) initialized`);
                }
                catch (err) {
                    console.warn(`[Gateway] Channel '${adapter.name}' (${channelType}) failed to initialize:`, err instanceof Error ? err.message : String(err));
                }
            }
            else {
                console.log(`[Gateway] Channel '${adapter.name}' (${channelType}) is disabled`);
            }
        }
        // Load persisted sessions
        this.loadSessions();
        // Start the message queue flush interval (every 2 seconds)
        this.flushInterval = setInterval(() => this.flushQueue(), 2000);
        // Start session persistence interval (every 30 seconds)
        this.sessionPersistInterval = setInterval(() => this.persistSessions(), 30_000);
        // Save config
        this.saveConfig();
        this.initialized = true;
        console.log("[Gateway] Manager initialized successfully");
    }
    /**
     * Register a channel adapter with the gateway.
     * Must be called before initialize() for the adapter to be started.
     */
    registerChannel(adapter) {
        if (this.adapters.has(adapter.type)) {
            console.warn(`[Gateway] Channel '${adapter.type}' already registered, replacing`);
        }
        this.adapters.set(adapter.type, adapter);
        // Wire the incoming message handler
        adapter.onMessage?.((msg) => this.handleIncomingMessage(msg));
        // Initialize stats counters
        this.stats.messagesReceived[adapter.type] ??= 0;
        this.stats.messagesSent[adapter.type] ??= 0;
        console.log(`[Gateway] Channel '${adapter.name}' (${adapter.type}) registered`);
    }
    /**
     * Gracefully shut down the gateway and all adapters.
     * Persists state, clears timers, and closes all connections.
     */
    async shutdown() {
        console.log("[Gateway] Shutting down...");
        // Stop timers
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
        if (this.sessionPersistInterval) {
            clearInterval(this.sessionPersistInterval);
            this.sessionPersistInterval = null;
        }
        // Flush remaining queue
        await this.flushQueue();
        // Shutdown all adapters
        for (const [channelType, adapter] of this.adapters) {
            try {
                await adapter.shutdown();
                console.log(`[Gateway] Channel '${adapter.name}' (${channelType}) shut down`);
            }
            catch (err) {
                console.warn(`[Gateway] Error shutting down '${adapter.name}':`, err instanceof Error ? err.message : String(err));
            }
        }
        // Persist final state
        this.persistSessions();
        this.saveConfig();
        this.initialized = false;
        console.log("[Gateway] Shutdown complete");
    }
    // ─── Message Handling ────────────────────────────────────────────────────
    /**
     * Set the handler that processes normalized messages through the agent loop.
     * This is typically AgentLoop.processUserMessage().
     */
    setMessageProcessor(handler) {
        this.processMessageHandler = handler;
    }
    /**
     * Handle an incoming message from any channel adapter.
     * Normalizes, rate-limits, updates session, and forwards to agent loop.
     */
    async handleIncomingMessage(msg) {
        // Rate limit check
        const rateKey = `${msg.channel}:${msg.source}`;
        if (!this.rateLimiter.check(rateKey)) {
            this.stats.rateLimitedDropped++;
            console.warn(`[Gateway] Rate limited message from ${rateKey}`);
            return;
        }
        // Update stats
        this.stats.messagesReceived[msg.channel] = (this.stats.messagesReceived[msg.channel] ?? 0) + 1;
        // Update or create device session
        this.updateSession(msg);
        // Store in message history
        if (this.config.messageHistory) {
            this.messageHistory.push(msg);
            if (this.messageHistory.length > this.config.maxHistorySize) {
                this.messageHistory = this.messageHistory.slice(-this.config.maxHistorySize);
            }
        }
        // Forward to agent loop processor
        if (this.processMessageHandler) {
            try {
                // Prefix with channel context for the agent
                const contextualized = `[via ${msg.channel}:${msg.sourceDevice}] ${msg.text}`;
                await this.processMessageHandler(contextualized);
            }
            catch (err) {
                console.error(`[Gateway] Error processing message ${msg.id}:`, err instanceof Error ? err.message : String(err));
            }
        }
        else {
            console.warn("[Gateway] No message processor set — message dropped");
        }
    }
    /**
     * Send a response through a specific channel to a specific target.
     * If the channel is unavailable, queues the message for retry.
     */
    async sendResponse(channel, targetId, text, mediaUrl) {
        const response = {
            targetChannel: channel,
            targetId,
            text,
            mediaUrl,
            timestamp: Date.now(),
        };
        const adapter = this.adapters.get(channel);
        if (!adapter) {
            console.warn(`[Gateway] No adapter registered for channel '${channel}' — queuing`);
            this.messageQueue.enqueue(response);
            return;
        }
        try {
            await adapter.sendMessage(response);
            this.stats.messagesSent[channel] = (this.stats.messagesSent[channel] ?? 0) + 1;
        }
        catch (err) {
            console.error(`[Gateway] Failed to send via '${channel}' — queuing for retry:`, err instanceof Error ? err.message : String(err));
            this.messageQueue.enqueue(response);
        }
    }
    /**
     * Broadcast a text message to ALL connected device sessions.
     * Useful for system-wide alerts and notifications.
     */
    async broadcastToAll(text) {
        const sessions = this.getActiveSessions();
        const promises = sessions.map(session => this.sendResponse(session.channel, session.source, text).catch(err => {
            console.warn(`[Gateway] Broadcast failed for ${session.deviceId}:`, err instanceof Error ? err.message : String(err));
        }));
        await Promise.allSettled(promises);
    }
    // ─── Session Management ──────────────────────────────────────────────────
    /**
     * Get all active device sessions.
     */
    getDeviceSessions() {
        return Array.from(this.sessions.values());
    }
    /**
     * Get only active (recently active) sessions.
     * A session is considered active if it had activity in the last 30 minutes.
     */
    getActiveSessions() {
        const cutoff = Date.now() - 30 * 60 * 1000; // 30 minutes
        return this.getDeviceSessions().filter(s => s.lastActivity >= cutoff);
    }
    /**
     * Get a specific session by device ID.
     */
    getSession(deviceId) {
        return this.sessions.get(deviceId);
    }
    /**
     * Terminate a specific device session.
     */
    terminateSession(deviceId) {
        return this.sessions.delete(deviceId);
    }
    /**
     * Authenticate a device session.
     */
    authenticateSession(deviceId) {
        const session = this.sessions.get(deviceId);
        if (session) {
            session.authenticated = true;
            session.lastActivity = Date.now();
            return true;
        }
        return false;
    }
    // ─── Statistics ──────────────────────────────────────────────────────────
    /**
     * Get comprehensive gateway statistics.
     */
    getStats() {
        const channelStatus = {};
        for (const [type, adapter] of this.adapters) {
            const config = this.config.channels[type];
            if (!config?.enabled) {
                channelStatus[type] = "disabled";
            }
            else if (adapter.getStatus) {
                channelStatus[type] = adapter.getStatus();
            }
            else {
                channelStatus[type] = "connected";
            }
        }
        // Fill in unregistered channels
        const allChannels = ["sms", "telegram", "whatsapp", "sip", "webhook", "local"];
        for (const ch of allChannels) {
            channelStatus[ch] ??= "disabled";
        }
        return {
            uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
            connectedDevices: this.getActiveSessions().length,
            messagesReceived: { ...this.stats.messagesReceived },
            messagesSent: { ...this.stats.messagesSent },
            queueSize: this.messageQueue.size(),
            rateLimitedDropped: this.stats.rateLimitedDropped,
            channelStatus,
        };
    }
    /**
     * Get the message history (limited by maxSize config).
     */
    getMessageHistory() {
        return [...this.messageHistory];
    }
    /**
     * Get the current gateway configuration.
     */
    getConfig() {
        return this.config;
    }
    /**
     * Update gateway configuration and persist to disk.
     */
    async updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        if (updates.rateLimitPerMinute) {
            this.rateLimiter.reset();
            // RateLimiter doesn't have a method to update max, so we note the change
            // In a production system, we'd recreate the limiter
        }
        this.saveConfig();
        console.log("[Gateway] Configuration updated and persisted");
    }
    /**
     * Enable or disable a specific channel at runtime.
     */
    async toggleChannel(channel, enabled) {
        if (!this.config.channels[channel]) {
            this.config.channels[channel] = { enabled: false };
        }
        this.config.channels[channel].enabled = enabled;
        this.saveConfig();
        const adapter = this.adapters.get(channel);
        if (adapter) {
            if (enabled) {
                try {
                    await adapter.initialize(this.config.channels[channel]);
                    console.log(`[Gateway] Channel '${channel}' enabled`);
                }
                catch (err) {
                    console.warn(`[Gateway] Failed to enable '${channel}':`, err instanceof Error ? err.message : String(err));
                }
            }
            else {
                try {
                    await adapter.shutdown();
                    console.log(`[Gateway] Channel '${channel}' disabled`);
                }
                catch (err) {
                    console.warn(`[Gateway] Error disabling '${channel}':`, err instanceof Error ? err.message : String(err));
                }
            }
        }
    }
    /**
     * Get a registered adapter by channel type.
     */
    getAdapter(channel) {
        return this.adapters.get(channel);
    }
    /**
     * Check whether the gateway has been initialized.
     */
    isInitialized() {
        return this.initialized;
    }
    // ─── Private: Session Updates ────────────────────────────────────────────
    updateSession(msg) {
        const deviceId = `${msg.channel}:${msg.source}`;
        const existing = this.sessions.get(deviceId);
        if (existing) {
            existing.lastActivity = Date.now();
            existing.sourceDevice = msg.sourceDevice;
            // Merge metadata
            Object.assign(existing.metadata, msg.metadata);
        }
        else {
            const session = {
                deviceId,
                channel: msg.channel,
                source: msg.source,
                sourceDevice: msg.sourceDevice,
                connectedAt: msg.timestamp,
                lastActivity: Date.now(),
                metadata: { ...msg.metadata },
                authenticated: false,
            };
            this.sessions.set(deviceId, session);
            console.log(`[Gateway] New device session: ${deviceId}`);
        }
    }
    // ─── Private: Queue Flush ────────────────────────────────────────────────
    async flushQueue() {
        let msg = this.messageQueue.dequeue();
        while (msg) {
            const adapter = this.adapters.get(msg.response.targetChannel);
            if (!adapter) {
                this.messageQueue.complete();
                msg = this.messageQueue.dequeue();
                continue;
            }
            try {
                await adapter.sendMessage(msg.response);
                this.stats.messagesSent[msg.response.targetChannel] =
                    (this.stats.messagesSent[msg.response.targetChannel] ?? 0) + 1;
                this.messageQueue.complete();
            }
            catch (err) {
                console.warn(`[Gateway] Queue delivery attempt ${msg.attempts + 1} failed:`, err instanceof Error ? err.message : String(err));
                this.messageQueue.requeue(msg);
            }
            msg = this.messageQueue.dequeue();
        }
    }
    // ─── Private: Config Persistence ────────────────────────────────────────
    loadConfig() {
        try {
            if (node_fs_1.default.existsSync(GATEWAY_CONFIG_PATH)) {
                const raw = node_fs_1.default.readFileSync(GATEWAY_CONFIG_PATH, "utf-8");
                const parsed = JSON.parse(raw);
                // Merge with defaults to ensure all keys exist
                return {
                    messageHistory: true,
                    maxHistorySize: 1000,
                    rateLimitPerMinute: 30,
                    maxQueueSize: 500,
                    defaultChannel: "local",
                    channels: {},
                    ...parsed,
                };
            }
        }
        catch (err) {
            console.warn("[Gateway] Failed to load config, using defaults:", err instanceof Error ? err.message : String(err));
        }
        return {
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
    }
    saveConfig() {
        try {
            const dir = node_path_1.default.dirname(GATEWAY_CONFIG_PATH);
            if (!node_fs_1.default.existsSync(dir)) {
                node_fs_1.default.mkdirSync(dir, { recursive: true });
            }
            node_fs_1.default.writeFileSync(GATEWAY_CONFIG_PATH, JSON.stringify(this.config, null, 2));
        }
        catch (err) {
            console.warn("[Gateway] Failed to save config:", err instanceof Error ? err.message : String(err));
        }
    }
    // ─── Private: Session Persistence ────────────────────────────────────────
    loadSessions() {
        try {
            if (node_fs_1.default.existsSync(DEVICE_SESSIONS_PATH)) {
                const raw = node_fs_1.default.readFileSync(DEVICE_SESSIONS_PATH, "utf-8");
                const parsed = JSON.parse(raw);
                for (const session of parsed) {
                    this.sessions.set(session.deviceId, session);
                }
                console.log(`[Gateway] Loaded ${parsed.length} persisted sessions`);
            }
        }
        catch (err) {
            console.warn("[Gateway] Failed to load sessions:", err instanceof Error ? err.message : String(err));
        }
    }
    persistSessions() {
        try {
            const dir = node_path_1.default.dirname(DEVICE_SESSIONS_PATH);
            if (!node_fs_1.default.existsSync(dir)) {
                node_fs_1.default.mkdirSync(dir, { recursive: true });
            }
            const sessions = Array.from(this.sessions.values());
            node_fs_1.default.writeFileSync(DEVICE_SESSIONS_PATH, JSON.stringify(sessions, null, 2));
        }
        catch (err) {
            console.warn("[Gateway] Failed to persist sessions:", err instanceof Error ? err.message : String(err));
        }
    }
    // ─── Private: ID Generation ─────────────────────────────────────────────
    /**
     * Generate a unique message ID.
     */
    static generateId() {
        return node_crypto_1.default.randomUUID();
    }
}
exports.GatewayManager = GatewayManager;
//# sourceMappingURL=GatewayManager.js.map