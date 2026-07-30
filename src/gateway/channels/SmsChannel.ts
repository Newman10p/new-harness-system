// ─── M.A.I. SMS Channel (Twilio) ────────────────────────────────────────────
// Twilio SMS/MMS adapter for the M.A.I. gateway.
//
// Capabilities:
//   - Receive SMS/MMS via Twilio webhook (POST /api/gateway/sms)
//   - Send SMS via Twilio REST API
//   - Handle MMS media messages (images, audio, documents)
//   - Rate limiting: max 10 messages per minute per phone number
//   - Delivery status tracking via Twilio callbacks
//
// Config:
//   { accountSid, authToken, phoneNumber, webhookUrl, maxMessagesPerMinute }

import crypto from "node:crypto";
import type {
  ChannelAdapter,
  ChannelConfig,
  ChannelStatus,
  GatewayMessage,
  GatewayResponse,
} from "../types.js";

// ─── Twilio API Types ──────────────────────────────────────────────────────
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

// ─── Rate Limiter ───────────────────────────────────────────────────────────
class SmsRateLimiter {
  private counters: Map<string, { count: number; resetAt: number }> = new Map();
  private maxPerMinute: number;

  constructor(maxPerMinute = 10) {
    this.maxPerMinute = maxPerMinute;
  }

  check(phoneNumber: string): boolean {
    const now = Date.now();
    let entry = this.counters.get(phoneNumber);

    if (!entry || now >= entry.resetAt) {
      entry = { count: this.maxPerMinute, resetAt: now + 60_000 };
      this.counters.set(phoneNumber, entry);
    }

    if (entry.count <= 0) return false;
    entry.count--;
    return true;
  }

  reset(): void {
    this.counters.clear();
  }
}

// ─── SMS Channel Adapter ────────────────────────────────────────────────────
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
export class SmsChannel implements ChannelAdapter {
  readonly type = "sms" as const;
  readonly name = "Twilio SMS";
  private config: ChannelConfig | null = null;
  private messageHandler: ((msg: GatewayMessage) => Promise<void>) | null = null;
  private status: ChannelStatus = "disconnected";
  private rateLimiter = new SmsRateLimiter();
  private messageCount = 0;
  private errorCount = 0;

  // ─── Adapter Interface ────────────────────────────────────────────────────

  /**
   * Initialize the SMS channel with Twilio credentials.
   * Validates configuration and marks the channel as connected.
   */
  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    this.status = "connecting";

    // Validate required configuration
    const { accountSid, authToken, phoneNumber } = config;
    if (!accountSid || !authToken || !phoneNumber) {
      console.warn("[SmsChannel] Missing required Twilio configuration (accountSid, authToken, phoneNumber)");
      this.status = "error";
      return;
    }

    // Configure rate limiter
    const maxPerMinute = config.maxMessagesPerMinute as number;
    if (maxPerMinute && maxPerMinute > 0) {
      this.rateLimiter = new SmsRateLimiter(maxPerMinute);
    }

    this.status = "connected";
    console.log(`[SmsChannel] Initialized with phone number ${phoneNumber}`);
  }

  /**
   * Send an SMS/MMS response via Twilio REST API.
   * Supports text-only and text-with-media messages.
   */
  async sendMessage(response: GatewayResponse): Promise<void> {
    if (!this.config) {
      throw new Error("[SmsChannel] Not initialized");
    }

    const { accountSid, authToken, phoneNumber } = this.config;
    const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;

    // Build the form body
    const params = new URLSearchParams({
      From: phoneNumber as string,
      To: response.targetId,
      Body: response.text.substring(0, 1600), // Twilio limit: 1600 chars
    });

    // Attach media URL for MMS
    if (response.mediaUrl) {
      params.append("MediaUrl", response.mediaUrl);
    }

    try {
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

      const res = await fetch(`${baseUrl}/Messages.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Twilio API returned ${res.status}: ${errorBody}`);
      }

      const result = await res.json() as { sid?: string; status?: string };
      console.log(`[SmsChannel] Message sent: ${result.sid ?? "unknown"} (${result.status ?? "unknown"})`);
      this.messageCount++;
    } catch (err) {
      this.errorCount++;
      throw new Error(
        `[SmsChannel] Failed to send SMS: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Gracefully shut down the SMS channel.
   */
  async shutdown(): Promise<void> {
    this.status = "disconnected";
    this.rateLimiter.reset();
    console.log("[SmsChannel] Shut down");
  }

  /**
   * Register a handler for incoming SMS messages.
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
      phoneNumber: this.config?.phoneNumber ?? "not configured",
      messagesSent: this.messageCount,
      errors: this.errorCount,
      configured: !!this.config?.accountSid,
    };
  }

  // ─── Webhook Handler ─────────────────────────────────────────────────────

  /**
   * Process an incoming Twilio SMS webhook request.
   * Call this from your HTTP server at the configured webhook URL.
   *
   * @param body - The parsed Twilio webhook body
   * @returns A TwiML response string to acknowledge receipt
   */
  async handleWebhook(body: TwilioMessagePayload): Promise<string> {
    if (!this.messageHandler) {
      console.warn("[SmsChannel] No message handler registered — incoming message ignored");
      return this.twimlResponse("M.A.I. gateway not ready. Please try again later.");
    }

    // Rate limit check
    const fromNumber = body.From || "unknown";
    if (!this.rateLimiter.check(fromNumber)) {
      console.warn(`[SmsChannel] Rate limited: ${fromNumber}`);
      return this.twimlResponse("Slow down! You've sent too many messages. Try again in a minute.");
    }

    // Extract media URL for MMS
    const mediaUrl = body.NumMedia && parseInt(body.NumMedia, 10) > 0
      ? body.MediaUrl0
      : undefined;

    // Build the normalized gateway message
    const message: GatewayMessage = {
      id: crypto.randomUUID(),
      channel: "sms",
      source: fromNumber,
      sourceDevice: fromNumber,
      text: body.Body || "",
      mediaUrl,
      timestamp: Date.now(),
      metadata: {
        messageSid: body.MessageSid,
        accountSid: body.AccountSid,
        toNumber: body.To,
        fromCity: body.FromCity,
        fromState: body.FromState,
        fromCountry: body.FromCountry,
        mediaCount: body.NumMedia,
      },
    };

    // Forward to gateway manager (non-blocking)
    try {
      await this.messageHandler(message);
    } catch (err) {
      console.error(`[SmsChannel] Error handling message:`, err instanceof Error ? err.message : String(err));
    }

    // Return empty TwiML (no auto-reply from webhook — response comes from agent loop)
    return this.twimlResponse("");
  }

  /**
   * Verify that a webhook request is genuinely from Twilio.
   * Uses Twilio's signature validation.
   */
  validateSignature(
    url: string,
    params: Record<string, string>,
    signature: string
  ): boolean {
    if (!this.config?.authToken) return false;

    // Build the sorted parameter string
    const sortedKeys = Object.keys(params).sort();
    const dataString = url + sortedKeys.map(k => `${k}${params[k]}`).join("");

    // Compute HMAC-SHA1
    const hmac = crypto.createHmac("sha1", this.config.authToken as string);
    hmac.update(dataString);
    const computed = hmac.digest("base64");

    return computed === signature;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Generate a TwiML response string.
   */
  private twimlResponse(message: string): string {
    if (!message) {
      return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
    }
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${this.escapeXml(message)}</Message></Response>`;
  }

  /**
   * Escape special XML characters.
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
