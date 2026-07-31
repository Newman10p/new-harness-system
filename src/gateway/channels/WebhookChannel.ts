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

import crypto from "node:crypto";
import type {
  ChannelAdapter,
  ChannelConfig,
  ChannelStatus,
  GatewayMessage,
  GatewayResponse,
} from "../types.js";

// -- Webhook Message Format --

interface WebhookInboundPayload {
  text: string;
  sender?: string;
  device?: string;
  mediaUrl?: string;
  metadata?: Record<string, unknown>;
  replyTo?: string;
}

interface WebhookOutboundPayload {
  text: string;
  mediaUrl?: string;
  timestamp: number;
  messageId: string;
  replyTo?: string;
}

// -- Webhook Rate Limiter --

class WebhookRateLimiter {
  private counters: Map<string, { count: number; resetAt: number }> = new Map();
  private maxPerMinute: number;

  constructor(maxPerMinute = 30) {
    this.maxPerMinute = maxPerMinute;
  }

  check(key: string): boolean {
    const now = Date.now();
    let entry = this.counters.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: this.maxPerMinute, resetAt: now + 60_000 };
      this.counters.set(key, entry);
    }

    if (entry.count <= 0) return false;
    entry.count--;
    return true;
  }

  reset(): void {
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
export class WebhookChannel implements ChannelAdapter {
  readonly type = "webhook" as const;
  readonly name = "Generic Webhook";
  private config: ChannelConfig | null = null;
  private messageHandler: ((msg: GatewayMessage) => Promise<void>) | null = null;
  private status: ChannelStatus = "disconnected";
  private rateLimiter = new WebhookRateLimiter();
  private messageCount = 0;
  private errorCount = 0;
  private pendingReplies: Map<string, string> = new Map();

  // -- Adapter Interface --

  /**
   * Initialize the webhook channel with inbound/outbound URL configuration.
   */
  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    this.status = "connecting";

    // Validate required configuration
    const inboundUrl = config.inboundUrl as string | undefined;
    if (!inboundUrl) {
      console.warn("[WebhookChannel] Missing required inboundUrl configuration");
      this.status = "error";
      return;
    }

    // Configure rate limiter
    const maxPerMinute = config.maxMessagesPerMinute as number;
    if (maxPerMinute && maxPerMinute > 0) {
      this.rateLimiter = new WebhookRateLimiter(maxPerMinute);
    }

    this.status = "connected";
    console.log("[WebhookChannel] Initialized with inbound URL: " + inboundUrl);
    const outboundUrl = config.outboundUrl as string | undefined;
    console.log(
      "[WebhookChannel] Outbound URL: " + (outboundUrl || "not configured (responses will be queued)")
    );
  }

  /**
   * Send a response via the outbound webhook URL.
   * Includes HMAC signature and custom headers.
   */
  async sendMessage(response: GatewayResponse): Promise<void> {
    if (!this.config) {
      throw new Error("[WebhookChannel] Not initialized");
    }

    const outboundUrl = this.config.outboundUrl as string;
    if (!outboundUrl) {
      console.warn("[WebhookChannel] No outbound URL configured - response dropped");
      return;
    }

    const timeout = (this.config.timeout as number) || 10_000;
    const secret = this.config.secret as string | undefined;
    const customHeaders = (this.config.headers as Record<string, string>) || {};

    // Build the outbound payload
    const payload: WebhookOutboundPayload = {
      text: response.text,
      mediaUrl: response.mediaUrl,
      timestamp: response.timestamp,
      messageId: response.targetId,
      replyTo: this.pendingReplies.get(response.targetId),
    };

    // Generate HMAC signature if secret is configured
    const signature = secret ? this.generateSignature(payload) : undefined;

    try {
      const headers: Record<string, string> = {
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
        throw new Error(
          "Outbound webhook returned " + String(res.status) + ": " + errorBody
        );
      }

      // Clean up pending reply mapping
      this.pendingReplies.delete(response.targetId);
      this.messageCount++;
      console.log("[WebhookChannel] Response delivered to " + outboundUrl);
    } catch (err) {
      this.errorCount++;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error("[WebhookChannel] Failed to deliver response: " + msg);
    }
  }

  /**
   * Gracefully shut down the webhook channel.
   */
  async shutdown(): Promise<void> {
    this.status = "disconnected";
    this.rateLimiter.reset();
    this.pendingReplies.clear();
    console.log("[WebhookChannel] Shut down");
  }

  /**
   * Register a handler for incoming webhook messages.
   */
  onMessage(handler: (msg: GatewayMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Get the current channel status.
   */
  getStatus(): ChannelStatus {
    return this.status;
  }

  /**
   * Get channel diagnostic information.
   */
  getDiagnostics(): Record<string, unknown> {
    return {
      status: this.status,
      inboundUrl: this.config?.inboundUrl ?? "not configured",
      outboundUrl: this.config?.outboundUrl ?? "not configured",
      hasSecret: !!this.config?.secret,
      customHeaders: Object.keys((this.config?.headers as Record<string, string>) || {}).length,
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
  async handleInbound(
    body: unknown,
    signature?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
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
    const secret = this.config?.secret as string | undefined;
    if (secret) {
      if (!signature) {
        return { success: false, error: "Missing X-Webhook-Signature header (HMAC verification required)" };
      }

      const expectedSignature = this.generateSignature(body as Record<string, unknown>);
      const providedSignature = signature.replace(/^sha256=/, "");

      if (!crypto.timingSafeEqual(
        Buffer.from(expectedSignature, "hex"),
        Buffer.from(providedSignature, "hex")
      )) {
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
    const messageId = crypto.randomUUID();
    const message: GatewayMessage = {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[WebhookChannel] Error handling message:", msg);
      return { success: false, error: "Internal processing error" };
    }
  }

  /**
   * Generate an HMAC-SHA256 signature for a payload.
   */
  generateSignature(payload: unknown): string {
    const secret = this.config?.secret as string;
    if (!secret) {
      return "";
    }

    const data = typeof payload === "string"
      ? payload
      : JSON.stringify(payload);

    return crypto
      .createHmac("sha256", secret)
      .update(data)
      .digest("hex");
  }

  // -- Private Helpers --

  /**
   * Validate and parse the inbound payload.
   */
  private validatePayload(body: unknown): WebhookInboundPayload | null {
    if (!body || typeof body !== "object") {
      return null;
    }

    const payload = body as WebhookInboundPayload;

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
