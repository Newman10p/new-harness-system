// ─── M.A.I. Telegram Channel ────────────────────────────────────────────────
// Telegram Bot API adapter for the M.A.I. gateway.
//
// Capabilities:
//   - Receive messages via Telegram Bot API long polling (getUpdates)
//   - Send messages (text, photo, documents) via Telegram API
//   - Support inline commands: /status, /help, /devices
//   - Typing indicators for better UX
//   - Rate limiting per chat ID
//   - Allowed chat ID filtering for security
//
// Config:
//   { botToken, allowedChatIds?: string[], pollingInterval?, maxMessagesPerMinute }

import crypto from "node:crypto";
import type {
  ChannelAdapter,
  ChannelConfig,
  ChannelStatus,
  GatewayMessage,
  GatewayResponse,
} from "../types.js";

// ─── Telegram API Types ─────────────────────────────────────────────────────
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string; file_size?: number }>;
  document?: { file_id: string; file_name?: string; mime_type?: string };
  voice?: { file_id: string; duration?: number };
  contact?: { phone_number: string; first_name: string };
  location?: { latitude: number; longitude: number };
  entities?: Array<{ type: string; offset: number; length: string }>;
}

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  is_bot: boolean;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// ─── Telegram Rate Limiter ──────────────────────────────────────────────────
class TelegramRateLimiter {
  private counters: Map<number, { count: number; resetAt: number }> = new Map();
  private maxPerMinute: number;

  constructor(maxPerMinute = 20) {
    this.maxPerMinute = maxPerMinute;
  }

  check(chatId: number): boolean {
    const now = Date.now();
    let entry = this.counters.get(chatId);

    if (!entry || now >= entry.resetAt) {
      entry = { count: this.maxPerMinute, resetAt: now + 60_000 };
      this.counters.set(chatId, entry);
    }

    if (entry.count <= 0) return false;
    entry.count--;
    return true;
  }

  reset(): void {
    this.counters.clear();
  }
}

// ─── Telegram Channel Adapter ───────────────────────────────────────────────
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
export class TelegramChannel implements ChannelAdapter {
  readonly type = "telegram" as const;
  readonly name = "Telegram Bot";
  private config: ChannelConfig | null = null;
  private messageHandler: ((msg: GatewayMessage) => Promise<void>) | null = null;
  private status: ChannelStatus = "disconnected";
  private rateLimiter = new TelegramRateLimiter();
  private pollingActive = false;
  private pollingTimer: ReturnType<typeof setTimeout> | null = null;
  private lastUpdateId = 0;
  private messageCount = 0;
  private errorCount = 0;

  // ─── Adapter Interface ────────────────────────────────────────────────────

  /**
   * Initialize the Telegram channel with bot token.
   * Starts the long polling loop to receive incoming messages.
   */
  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    this.status = "connecting";

    // Validate required configuration
    const { botToken } = config;
    if (!botToken) {
      console.warn("[TelegramChannel] Missing required botToken configuration");
      this.status = "error";
      return;
    }

    // Configure rate limiter
    const maxPerMinute = config.maxMessagesPerMinute as number;
    if (maxPerMinute && maxPerMinute > 0) {
      this.rateLimiter = new TelegramRateLimiter(maxPerMinute);
    }

    // Verify bot token by calling getMe
    try {
      const me = await this.apiCall<{ id: number; first_name: string; username: string }>("getMe");
      console.log(`[TelegramChannel] Bot authenticated: @${me.username} (${me.first_name})`);
    } catch (err) {
      console.warn(
        `[TelegramChannel] Bot token validation failed:`,
        err instanceof Error ? err.message : String(err)
      );
      this.status = "error";
      return;
    }

    // Start long polling
    this.pollingActive = true;
    this.status = "connected";
    this.startPolling();

    console.log("[TelegramChannel] Initialized and polling for updates");
  }

  /**
   * Send a message response via the Telegram Bot API.
   * Supports text messages, and optionally attaches photos or documents.
   */
  async sendMessage(response: GatewayResponse): Promise<void> {
    if (!this.config) {
      throw new Error("[TelegramChannel] Not initialized");
    }

    const chatId = parseInt(response.targetId, 10);
    if (isNaN(chatId)) {
      throw new Error(`[TelegramChannel] Invalid chat ID: ${response.targetId}`);
    }

    try {
      if (response.mediaUrl) {
        // Determine whether to send as photo or document
        const isPhoto = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(response.mediaUrl);
        if (isPhoto) {
          await this.apiCall("sendPhoto", {
            chat_id: chatId,
            photo: response.mediaUrl,
            caption: response.text.substring(0, 1024), // Telegram caption limit
            parse_mode: "Markdown",
          });
        } else {
          await this.apiCall("sendDocument", {
            chat_id: chatId,
            document: response.mediaUrl,
            caption: response.text.substring(0, 1024),
          });
        }
      } else {
        // Send as text message
        // Telegram limit: 4096 chars per message; split if needed
        const chunks = this.splitMessage(response.text, 4096);
        for (const chunk of chunks) {
          await this.apiCall("sendMessage", {
            chat_id: chatId,
            text: chunk,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          });
        }
      }

      this.messageCount++;
      console.log(`[TelegramChannel] Message sent to chat ${chatId}`);
    } catch (err) {
      this.errorCount++;
      throw new Error(
        `[TelegramChannel] Failed to send message: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Gracefully shut down the Telegram channel.
   * Stops polling and cleans up resources.
   */
  async shutdown(): Promise<void> {
    this.pollingActive = false;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.status = "disconnected";
    this.rateLimiter.reset();
    console.log("[TelegramChannel] Shut down");
  }

  /**
   * Register a handler for incoming Telegram messages.
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
      pollingActive: this.pollingActive,
      lastUpdateId: this.lastUpdateId,
      messagesSent: this.messageCount,
      errors: this.errorCount,
      configured: !!this.config?.botToken,
    };
  }

  // ─── Polling Loop ───────────────────────────────────────────────────────

  /**
   * Start the long-polling loop.
   * Fetches updates from Telegram Bot API at the configured interval.
   */
  private startPolling(): void {
    if (!this.pollingActive) return;

    const interval = (this.config?.pollingInterval as number) || 3000;

    this.pollingTimer = setTimeout(async () => {
      try {
        await this.fetchUpdates();
      } catch (err) {
        console.error(
          `[TelegramChannel] Polling error:`,
          err instanceof Error ? err.message : String(err)
        );
      }

      // Continue polling if still active
      if (this.pollingActive) {
        this.startPolling();
      }
    }, interval);
  }

  /**
   * Fetch updates from the Telegram Bot API.
   */
  private async fetchUpdates(): Promise<void> {
    if (!this.config?.botToken) return;

    const updates = await this.apiCall<TelegramUpdate[]>("getUpdates", {
      offset: this.lastUpdateId + 1,
      timeout: 30,
      allowed_updates: ["message", "edited_message", "callback_query"],
    });

    for (const update of updates ?? []) {
      this.lastUpdateId = update.update_id;

      if (update.message) {
        await this.handleTelegramMessage(update.message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
      }
    }
  }

  // ─── Message Processing ──────────────────────────────────────────────────

  /**
   * Process an incoming Telegram message.
   */
  private async handleTelegramMessage(msg: TelegramMessage): Promise<void> {
    if (!this.messageHandler) return;

    // Check allowed chat IDs filter
    const allowedIds = this.config?.allowedChatIds as string[] | undefined;
    if (allowedIds && allowedIds.length > 0) {
      const chatIdStr = String(msg.chat.id);
      if (!allowedIds.includes(chatIdStr)) {
        console.warn(`[TelegramChannel] Message from unauthorized chat ${msg.chat.id} — ignored`);
        return;
      }
    }

    // Rate limit check
    if (!this.rateLimiter.check(msg.chat.id)) {
      console.warn(`[TelegramChannel] Rate limited chat ${msg.chat.id}`);
      return;
    }

    // Handle bot commands
    const text = msg.text ?? "";
    if (text.startsWith("/")) {
      await this.handleCommand(text, msg.chat.id);
      return;
    }

    // Extract media URL if present
    let mediaUrl: string | undefined;
    if (msg.photo?.length) {
      const fileId = msg.photo[msg.photo.length - 1].file_id; // highest resolution
      mediaUrl = await this.getFileUrl(fileId);
    } else if (msg.document) {
      mediaUrl = await this.getFileUrl(msg.document.file_id);
    } else if (msg.voice) {
      mediaUrl = await this.getFileUrl(msg.voice.file_id);
    }

    // Build the normalized gateway message
    const message: GatewayMessage = {
      id: crypto.randomUUID(),
      channel: "telegram",
      source: String(msg.chat.id),
      sourceDevice: msg.from?.username
        ? `@${msg.from.username}`
        : msg.from
          ? `${msg.from.first_name} ${msg.from.last_name ?? ""}`.trim()
          : `Chat ${msg.chat.id}`,
      text: text || msg.caption || "",
      mediaUrl,
      timestamp: msg.date * 1000, // Telegram uses Unix seconds
      metadata: {
        messageId: msg.message_id,
        chatType: msg.chat.type,
        chatTitle: msg.chat.title,
        fromId: msg.from?.id,
        fromUsername: msg.from?.username,
        fromIsBot: msg.from?.is_bot,
        hasPhoto: !!msg.photo?.length,
        hasDocument: !!msg.document,
        hasVoice: !!msg.voice,
        hasLocation: !!msg.location,
        hasContact: !!msg.contact,
      },
    };

    // Show typing indicator
    this.sendTypingIndicator(msg.chat.id).catch(() => { /* non-fatal */ });

    // Forward to gateway manager
    try {
      await this.messageHandler(message);
    } catch (err) {
      console.error(
        `[TelegramChannel] Error handling message:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * Handle inline bot commands.
   */
  private async handleCommand(text: string, chatId: number): Promise<void> {
    const [command, ...args] = text.split(/\s+/);
    const cmd = command.replace(/@\w+$/, "").toLowerCase(); // strip @botname suffix

    switch (cmd) {
      case "/start":
        await this.apiCall("sendMessage", {
          chat_id: chatId,
          text: "🤖 *M.A.I. Gateway Active*\n\nSend me any message and I'll process it through the M.A.I. intelligence system.\n\n*Commands:*\n/help — Show available commands\n/status — System status\n/devices — Connected devices",
          parse_mode: "Markdown",
        });
        break;

      case "/help":
        await this.apiCall("sendMessage", {
          chat_id: chatId,
          text: "📚 *M.A.I. Commands*\n\n/status — Show gateway and system status\n/devices — List connected devices\n/help — Show this help message\n\nJust type a message to interact with M.A.I.",
          parse_mode: "Markdown",
        });
        break;

      case "/status":
        await this.apiCall("sendMessage", {
          chat_id: chatId,
          text: "📊 *Gateway Status*\n\nStatus: ✅ Online\nChannel: Telegram\nRate Limit: OK",
          parse_mode: "Markdown",
        });
        break;

      case "/devices":
        await this.apiCall("sendMessage", {
          chat_id: chatId,
          text: "📱 *Connected Devices*\n\nQuery device list through M.A.I. for live data.",
          parse_mode: "Markdown",
        });
        break;

      default:
        // Forward unknown commands as regular messages to the agent
        if (this.messageHandler) {
          await this.messageHandler({
            id: crypto.randomUUID(),
            channel: "telegram",
            source: String(chatId),
            sourceDevice: `Telegram Chat ${chatId}`,
            text: text,
            timestamp: Date.now(),
            metadata: { isCommand: true, command: cmd, args: args.join(" ") },
          });
        }
    }
  }

  /**
   * Handle a callback query from inline keyboard buttons.
   */
  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    // Acknowledge the callback query
    try {
      await this.apiCall("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "Acknowledged",
      });
    } catch {
      /* non-fatal */
    }

    // Forward as a message if handler is set
    if (this.messageHandler && query.data && query.message?.chat) {
      await this.messageHandler({
        id: crypto.randomUUID(),
        channel: "telegram",
        source: String(query.message.chat.id),
        sourceDevice: query.from.username ? `@${query.from.username}` : String(query.from.id),
        text: query.data,
        timestamp: Date.now(),
        metadata: {
          isCallbackQuery: true,
          callbackQueryId: query.id,
          originalMessageId: query.message.message_id,
        },
      });
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Get the download URL for a Telegram file.
   */
  private async getFileUrl(fileId: string): Promise<string | undefined> {
    try {
      const file = await this.apiCall<{ file_path?: string }>("getFile", { file_id: fileId });
      if (file?.file_path) {
        const token = this.config?.botToken;
        return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      }
    } catch {
      /* non-fatal */
    }
    return undefined;
  }

  /**
   * Send a typing indicator to a chat.
   */
  private async sendTypingIndicator(chatId: number): Promise<void> {
    try {
      await this.apiCall("sendChatAction", {
        chat_id: chatId,
        action: "typing",
      });
    } catch {
      /* non-fatal */
    }
  }

  /**
   * Split a long message into chunks that fit within Telegram's limits.
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

      // Try to split at a line break
      let splitIdx = remaining.lastIndexOf("\n", maxLength);
      if (splitIdx <= 0) {
        // Try to split at a space
        splitIdx = remaining.lastIndexOf(" ", maxLength);
      }
      if (splitIdx <= 0) {
        // Hard split
        splitIdx = maxLength;
      }

      chunks.push(remaining.substring(0, splitIdx));
      remaining = remaining.substring(splitIdx).trimStart();
    }

    return chunks;
  }

  /**
   * Make an API call to the Telegram Bot API.
   */
  private async apiCall<T>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.config?.botToken) {
      throw new Error("[TelegramChannel] Bot token not configured");
    }

    const url = `https://api.telegram.org/bot${this.config.botToken}/${method}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = await res.json() as TelegramApiResponse<T>;

    if (!data.ok) {
      throw new Error(
        `Telegram API error ${data.error_code}: ${data.description ?? "unknown"}`
      );
    }

    return data.result as T;
  }
}
