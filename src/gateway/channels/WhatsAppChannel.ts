// ─── M.A.I. WhatsApp Channel (Meta Cloud API) ───────────────────────────────
// WhatsApp Business API / Meta Cloud API adapter for the M.A.I. gateway.
//
// Capabilities:
//   - Receive messages via WhatsApp webhook (POST /api/gateway/whatsapp)
//   - Send messages via WhatsApp Cloud API
//   - Handle text, image, document, location, and interactive messages
//   - Message templates for proactive notifications
//   - Webhook verification (GET challenge-response)
//   - Rate limiting per phone number
//
// Config:
//   { phoneNumberId, accessToken, verifyToken, webhookUrl, maxMessagesPerMinute }

import crypto from "node:crypto";
import type {
  ChannelAdapter,
  ChannelConfig,
  ChannelStatus,
  GatewayMessage,
  GatewayResponse,
} from "../types.js";

// ─── WhatsApp API Types ────────────────────────────────────────────────────
interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

interface WhatsAppWebhookChange {
  field: string;
  value: {
    messaging_product: string;
    metadata?: { display_phone_number: string; phone_number_id: string };
    messages?: WhatsAppIncomingMessage[];
    statuses?: WhatsAppMessageStatus[];
    contacts?: Array<{ wa_id: string; profile?: { name: string } }>;
  };
}

interface WhatsAppIncomingMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string; preview_url?: boolean };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: Array<{ phones: Array<{ wa_id: string; type: string }> }>;
  interactive?: { type: string; [key: string]: unknown };
  context?: { from: string; id: string };
}

interface WhatsAppMessageStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message: string }>;
}

interface WhatsAppMediaResponse {
  messaging_product: string;
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
}

// ─── WhatsApp Rate Limiter ──────────────────────────────────────────────────
class WhatsAppRateLimiter {
  private counters: Map<string, { count: number; resetAt: number }> = new Map();
  private maxPerMinute: number;

  constructor(maxPerMinute = 20) {
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

// ─── WhatsApp Channel Adapter ──────────────────────────────────────────────
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
export class WhatsAppChannel implements ChannelAdapter {
  readonly type = "whatsapp" as const;
  readonly name = "WhatsApp Business";
  private config: ChannelConfig | null = null;
  private messageHandler: ((msg: GatewayMessage) => Promise<void>) | null = null;
  private status: ChannelStatus = "disconnected";
  private rateLimiter = new WhatsAppRateLimiter();
  private messageCount = 0;
  private errorCount = 0;
  private readonly API_BASE = "https://graph.facebook.com/v18.0";

  // ─── Adapter Interface ────────────────────────────────────────────────────

  /**
   * Initialize the WhatsApp channel with Meta Cloud API credentials.
   */
  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    this.status = "connecting";

    // Validate required configuration
    const { phoneNumberId, accessToken } = config;
    if (!phoneNumberId || !accessToken) {
      console.warn(
        "[WhatsAppChannel] Missing required configuration (phoneNumberId, accessToken)"
      );
      this.status = "error";
      return;
    }

    // Configure rate limiter
    const maxPerMinute = config.maxMessagesPerMinute as number;
    if (maxPerMinute && maxPerMinute > 0) {
      this.rateLimiter = new WhatsAppRateLimiter(maxPerMinute);
    }

    // Verify phone number configuration
    try {
      await this.apiCall<{ display_phone_number: string; verified_name?: string }>(
        `/${phoneNumberId}`,
        "GET"
      );
      console.log(`[WhatsAppChannel] Initialized with phone number ID: ${phoneNumberId}`);
    } catch (err) {
      console.warn(
        "[WhatsAppChannel] Phone number verification failed:",
        err instanceof Error ? err.message : String(err)
      );
      this.status = "error";
      return;
    }

    this.status = "connected";
  }

  /**
   * Send a message response via the WhatsApp Cloud API.
   * Supports text messages and optionally attaches media.
   */
  async sendMessage(response: GatewayResponse): Promise<void> {
    if (!this.config) {
      throw new Error("[WhatsAppChannel] Not initialized");
    }

    const { phoneNumberId, accessToken } = this.config;
    const recipient = response.targetId.replace(/^(\+)?/, ""); // strip leading +

    try {
      if (response.mediaUrl) {
        // Send media message
        const mediaType = this.detectMediaType(response.mediaUrl);
        const payload: Record<string, unknown> = {
          messaging_product: "whatsapp",
          to: recipient,
          type: mediaType,
          [mediaType]: {
            link: response.mediaUrl,
            caption: response.text.substring(0, 1024),
          },
        };

        await this.apiCall(`/${phoneNumberId}/messages`, "POST", payload, accessToken as string);
      } else {
        // Send text message
        // WhatsApp limit: 4096 chars; split if needed
        const chunks = this.splitMessage(response.text, 4096);
        for (const chunk of chunks) {
          const payload = {
            messaging_product: "whatsapp",
            to: recipient,
            type: "text",
            text: {
              body: chunk,
              preview_url: false,
            },
          };
          await this.apiCall(`/${phoneNumberId}/messages`, "POST", payload, accessToken as string);
        }
      }

      this.messageCount++;
      console.log(`[WhatsAppChannel] Message sent to ${recipient}`);
    } catch (err) {
      this.errorCount++;
      throw new Error(
        `[WhatsAppChannel] Failed to send message: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Gracefully shut down the WhatsApp channel.
   */
  async shutdown(): Promise<void> {
    this.status = "disconnected";
    this.rateLimiter.reset();
    console.log("[WhatsAppChannel] Shut down");
  }

  /**
   * Register a handler for incoming WhatsApp messages.
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
      phoneNumberId: this.config?.phoneNumberId ?? "not configured",
      messagesSent: this.messageCount,
      errors: this.errorCount,
      configured: !!this.config?.accessToken,
    };
  }

  // ─── Webhook Handling ────────────────────────────────────────────────────

  /**
   * Verify the WhatsApp webhook during Meta's challenge-response setup.
   * Call this from GET /api/gateway/whatsapp with the query parameters.
   *
   * @returns The challenge string to echo back, or null if verification fails.
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === "subscribe" && token === (this.config?.verifyToken as string)) {
      console.log("[WhatsAppChannel] Webhook verified");
      return challenge;
    }
    console.warn("[WhatsAppChannel] Webhook verification failed");
    return null;
  }

  /**
   * Process an incoming WhatsApp webhook payload.
   * Call this from POST /api/gateway/whatsapp.
   */
  async handleWebhook(payload: { entry: WhatsAppWebhookEntry[] }): Promise<void> {
    if (!this.messageHandler) {
      console.warn("[WhatsAppChannel] No message handler registered");
      return;
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === "messages" && change.value.messages) {
          for (const message of change.value.messages) {
            await this.processIncomingMessage(message, change.value.contacts);
          }
        } else if (change.field === "messages" && change.value.statuses) {
          for (const status of change.value.statuses) {
            this.handleDeliveryStatus(status);
          }
        }
      }
    }
  }

  // ─── Template Messages ──────────────────────────────────────────────────

  /**
   * Send a pre-approved WhatsApp message template.
   * Templates must be approved by Meta before use.
   */
  async sendTemplate(
    recipient: string,
    templateName: string,
    languageCode = "en_US",
    components?: Array<{ type: string; parameters?: Array<{ type: string; text: string }> }>
  ): Promise<void> {
    if (!this.config) {
      throw new Error("[WhatsAppChannel] Not initialized");
    }

    const { phoneNumberId, accessToken } = this.config;
    const to = recipient.replace(/^(\+)?/, "");

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    if (components) {
      (payload.template as Record<string, unknown>).components = components;
    }

    await this.apiCall(`/${phoneNumberId}/messages`, "POST", payload, accessToken as string);
  }

  // ─── Private: Message Processing ─────────────────────────────────────────

  /**
   * Process an individual incoming WhatsApp message.
   */
  private async processIncomingMessage(
    msg: WhatsAppIncomingMessage,
    contacts?: Array<{ wa_id: string; profile?: { name: string } }>
  ): Promise<void> {
    if (!this.messageHandler) return;

    const from = msg.from;
    const contactProfile = contacts?.find(c => c.wa_id === from)?.profile?.name;

    // Rate limit check
    if (!this.rateLimiter.check(from)) {
      console.warn(`[WhatsAppChannel] Rate limited: ${from}`);
      return;
    }

    // Extract text content based on message type
    let text = "";
    let mediaUrl: string | undefined;

    switch (msg.type) {
      case "text":
        text = msg.text?.body ?? "";
        break;
      case "image":
        text = msg.image?.caption ?? "";
        mediaUrl = await this.getMediaUrl(msg.image!.id);
        break;
      case "document":
        text = msg.document?.caption ?? "";
        mediaUrl = await this.getMediaUrl(msg.document!.id);
        break;
      case "audio":
        mediaUrl = await this.getMediaUrl(msg.audio!.id);
        text = "[Audio message]";
        break;
      case "video":
        text = "[Video message]";
        mediaUrl = await this.getMediaUrl(msg.video!.id);
        break;
      case "location":
        text = `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
        break;
      case "contacts":
        text = "[Contact shared]";
        break;
      case "interactive":
        text = "[Interactive message]";
        break;
      default:
        text = `[${msg.type} message]`;
    }

    // Build the normalized gateway message
    const gatewayMessage: GatewayMessage = {
      id: crypto.randomUUID(),
      channel: "whatsapp",
      source: from,
      sourceDevice: contactProfile ?? from,
      text,
      mediaUrl,
      timestamp: parseInt(msg.timestamp, 10) * 1000,
      metadata: {
        messageId: msg.id,
        messageType: msg.type,
        contactName: contactProfile,
        isReplyTo: msg.context?.id,
        replyFrom: msg.context?.from,
        imageId: msg.image?.id,
        documentId: msg.document?.id,
        documentFilename: msg.document?.filename,
        documentMimeType: msg.document?.mime_type,
        locationName: msg.location?.name,
        locationAddress: msg.location?.address,
      },
    };

    // Forward to gateway manager
    try {
      await this.messageHandler(gatewayMessage);
    } catch (err) {
      console.error(
        `[WhatsAppChannel] Error handling message:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * Handle a delivery status update for a sent message.
   */
  private handleDeliveryStatus(status: WhatsAppMessageStatus): void {
    const logLevel = status.status === "failed" ? "error" : "info";
    const fn = logLevel === "error" ? console.error : console.log;

    if (status.status === "failed" && status.errors?.length) {
      fn(
        `[WhatsAppChannel] Message ${status.id} failed: ${status.errors.map(e => e.message).join(", ")}`
      );
    } else {
      fn(`[WhatsAppChannel] Message ${status.id}: ${status.status}`);
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Download a media file URL from WhatsApp Cloud API.
   */
  private async getMediaUrl(mediaId: string): Promise<string | undefined> {
    try {
      const media = await this.apiCall<WhatsAppMediaResponse>(
        `/${mediaId}`,
        "GET",
        undefined,
        this.config?.accessToken as string
      );
      return media.url;
    } catch {
      console.warn(`[WhatsAppChannel] Failed to get media URL for ${mediaId}`);
      return undefined;
    }
  }

  /**
   * Detect media type from URL extension.
   */
  private detectMediaType(url: string): "image" | "document" | "audio" | "video" {
    const lower = url.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(lower)) return "image";
    if (/\.(mp3|ogg|aac|amr)$/i.test(lower)) return "audio";
    if (/\.(mp4|3gp)$/i.test(lower)) return "video";
    return "document";
  }

  /**
   * Split a long message into chunks that fit within WhatsApp's limits.
   */
  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      let splitIdx = remaining.lastIndexOf("\n", maxLength);
      if (splitIdx <= 0) splitIdx = remaining.lastIndexOf(" ", maxLength);
      if (splitIdx <= 0) splitIdx = maxLength;

      chunks.push(remaining.substring(0, splitIdx));
      remaining = remaining.substring(splitIdx).trimStart();
    }

    return chunks;
  }

  /**
   * Make an API call to the Meta Graph API.
   */
  private async apiCall<T>(
    endpoint: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
    accessToken?: string
  ): Promise<T> {
    const url = `${this.API_BASE}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`WhatsApp API error ${res.status}: ${errorText}`);
    }

    return (await res.json()) as T;
  }
}
