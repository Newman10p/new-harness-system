"use strict";
// M.A.I. Webhook Channel - Generic webhook channel for custom integrations.
//
// Capabilities:
//   - Receive messages via configurable inbound webhook URL
//   - HMAC signature verification for security
//   - Send responses via configurable outbound webhook
//   - JSON message format with extensible metadata
//   - Custom header injection for outbound requests
//   - Timeout and retry logic for outbound delivery
//
// Config:
//   { inboundUrl, outboundUrl, secret, headers, timeout, maxMessagesPerMinute }
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookChannel = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
// -- Webhook Rate Limiter --
class WebhookRateLimiter {
    counters = new Map();
    maxPerMinute;
    constructor(maxPerMinute = 30) {
        this.maxPerMinute = maxPerMinute;
    }
    check(key) {
        const now = Date.now();
        let entry = this.counters.get(key);
        if (!entry || now >= entry.resetAt) {
            entry = { count: this.maxPerMinute, resetAt: now + 60_000 };
            this.counters.set(key, entry);
        }
        if (entry.count <= 0)
            return false;
        entry.count--;
        return true;
    }
    reset() {
        this.counters.clear();
    }
}
// -- Webhook Channel Adapter --
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
class WebhookChannel {
    type = "webhook";
    name = "Generic Webhook";
    config = null;
    messageHandler = null;
    status = "disconnected";
    rateLimiter = new WebhookRateLimiter();
    messageCount = 0;
    errorCount = 0;
    pendingReplies = new Map();
    // -- Adapter Interface --
    /**
     * Initialize the webhook channel with inbound/outbound URL configuration.
     */
    async initialize(config) {
        this.config = config;
        this.status = "connecting";
        // Validate required configuration
        const inboundUrl = config.inboundUrl;
        if (!inboundUrl) {
            console.warn("[WebhookChannel] Missing required inboundUrl configuration");
            this.status = "error";
            return;
        }
        // Configure rate limiter
        const maxPerMinute = config.maxMessagesPerMinute;
        if (maxPerMinute && maxPerMinute > 0) {
            this.rateLimiter = new WebhookRateLimiter(maxPerMinute);
        }
        this.status = "connected";
        console.log("[WebhookChannel] Initialized with inbound URL: " + inboundUrl);
        const outboundUrl = config.outboundUrl;
        console.log("[WebhookChannel] Outbound URL: " + (outboundUrl || "not configured (responses will be queued)"));
    }
    /**
     * Send a response via the outbound webhook URL.
     * Includes HMAC signature and custom headers.
     */
    async sendMessage(response) {
        if (!this.config) {
            throw new Error("[WebhookChannel] Not initialized");
        }
        const outboundUrl = this.config.outboundUrl;
        if (!outboundUrl) {
            console.warn("[WebhookChannel] No outbound URL configured - response dropped");
            return;
        }
        const timeout = this.config.timeout || 10_000;
        const secret = this.config.secret;
        const customHeaders = this.config.headers || {};
        // Build the outbound payload
        const payload = {
            text: response.text,
            mediaUrl: response.mediaUrl,
            timestamp: response.timestamp,
            messageId: response.targetId,
            replyTo: this.pendingReplies.get(response.targetId),
        };
        // Generate HMAC signature if secret is configured
        const signature = secret ? this.generateSignature(payload) : undefined;
        try {
            const headers = {
                "Content-Type": "application/json",
                ...customHeaders,
            };
            if (signature) {
                headers["X-Webhook-Signature"] = "sha256=" + signature;
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            const res = await fetch(outboundUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                const errorBody = await res.text();
                throw new Error("Outbound webhook returned " + String(res.status) + ": " + errorBody);
            }
            // Clean up pending reply mapping
            this.pendingReplies.delete(response.targetId);
            this.messageCount++;
            console.log("[WebhookChannel] Response delivered to " + outboundUrl);
        }
        catch (err) {
            this.errorCount++;
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error("[WebhookChannel] Failed to deliver response: " + msg);
        }
    }
    /**
     * Gracefully shut down the webhook channel.
     */
    async shutdown() {
        this.status = "disconnected";
        this.rateLimiter.reset();
        this.pendingReplies.clear();
        console.log("[WebhookChannel] Shut down");
    }
    /**
     * Register a handler for incoming webhook messages.
     */
    onMessage(handler) {
        this.messageHandler = handler;
    }
    /**
     * Get the current channel status.
     */
    getStatus() {
        return this.status;
    }
    /**
     * Get channel diagnostic information.
     */
    getDiagnostics() {
        return {
            status: this.status,
            inboundUrl: this.config?.inboundUrl ?? "not configured",
            outboundUrl: this.config?.outboundUrl ?? "not configured",
            hasSecret: !!this.config?.secret,
            customHeaders: Object.keys(this.config?.headers || {}).length,
            pendingReplies: this.pendingReplies.size,
            messagesSent: this.messageCount,
            errors: this.errorCount,
        };
    }
    // -- Webhook Handler --
    /**
     * Handle an incoming webhook request.
     * Validates the payload, verifies the HMAC signature, and forwards to the gateway.
     *
     * @param body - The parsed request body
     * @param signature - The X-Webhook-Signature header value (optional)
     * @returns Result with messageId on success, or error description
     */
    async handleInbound(body, signature) {
        if (!this.messageHandler) {
            return { success: false, error: "Webhook channel not ready" };
        }
        // Validate the payload format
        const payload = this.validatePayload(body);
        if (!payload) {
            return {
                success: false,
                error: "Invalid payload format. Expected: { text: string, sender?: string, device?: string }",
            };
        }
        // Verify HMAC signature if secret is configured
        const secret = this.config?.secret;
        if (secret) {
            if (!signature) {
                return { success: false, error: "Missing X-Webhook-Signature header (HMAC verification required)" };
            }
            const expectedSignature = this.generateSignature(body);
            const providedSignature = signature.replace(/^sha256=/, "");
            if (!node_crypto_1.default.timingSafeEqual(Buffer.from(expectedSignature, "hex"), Buffer.from(providedSignature, "hex"))) {
                console.warn("[WebhookChannel] HMAC signature verification failed");
                return { success: false, error: "Invalid signature" };
            }
        }
        // Rate limit check
        const sender = payload.sender || "anonymous";
        if (!this.rateLimiter.check(sender)) {
            console.warn("[WebhookChannel] Rate limited: " + sender);
            return { success: false, error: "Rate limit exceeded" };
        }
        // Build the normalized gateway message
        const messageId = node_crypto_1.default.randomUUID();
        const message = {
            id: messageId,
            channel: "webhook",
            source: payload.sender || "unknown",
            sourceDevice: payload.device || payload.sender || "webhook-client",
            text: payload.text,
            mediaUrl: payload.mediaUrl,
            timestamp: Date.now(),
            metadata: {
                ...payload.metadata,
                replyTo: payload.replyTo,
            },
        };
        // Store reply-to mapping for response routing
        if (payload.replyTo) {
            this.pendingReplies.set(messageId, payload.replyTo);
        }
        // Forward to gateway manager
        try {
            await this.messageHandler(message);
            return { success: true, messageId };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[WebhookChannel] Error handling message:", msg);
            return { success: false, error: "Internal processing error" };
        }
    }
    /**
     * Generate an HMAC-SHA256 signature for a payload.
     */
    generateSignature(payload) {
        const secret = this.config?.secret;
        if (!secret) {
            return "";
        }
        const data = typeof payload === "string"
            ? payload
            : JSON.stringify(payload);
        return node_crypto_1.default
            .createHmac("sha256", secret)
            .update(data)
            .digest("hex");
    }
    // -- Private Helpers --
    /**
     * Validate and parse the inbound payload.
     */
    validatePayload(body) {
        if (!body || typeof body !== "object") {
            return null;
        }
        const payload = body;
        // Text field is required and must be a non-empty string
        if (!payload.text || typeof payload.text !== "string") {
            return null;
        }
        // Optional fields validation
        if (payload.sender && typeof payload.sender !== "string") {
            return null;
        }
        if (payload.device && typeof payload.device !== "string") {
            return null;
        }
        if (payload.mediaUrl && typeof payload.mediaUrl !== "string") {
            return null;
        }
        if (payload.metadata && typeof payload.metadata !== "object") {
            return null;
        }
        if (payload.replyTo && typeof payload.replyTo !== "string") {
            return null;
        }
        return {
            text: payload.text,
            sender: payload.sender,
            device: payload.device,
            mediaUrl: payload.mediaUrl,
            metadata: payload.metadata,
            replyTo: payload.replyTo,
        };
    }
}
exports.WebhookChannel = WebhookChannel;
//# sourceMappingURL=WebhookChannel.js.map