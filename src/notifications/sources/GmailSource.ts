// ─── Gmail Notification Source ──────────────────────────────────────────
// Fetches unread emails via Gmail API using OAuth2 credentials.
// Config: { clientId, clientSecret, refreshToken }
// Poll interval: every 60 seconds.

import crypto from "node:crypto";
import type {
  INotificationSource,
  NotificationItem,
  NotificationPriority,
} from "../types.js";

// ─── Gmail API Types ─────────────────────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    parts?: GmailPart[];
    body?: { data?: string };
  };
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  resultSizeEstimate?: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// ─── Implementation ────────────────────────────────────────────────────────

export class GmailSource implements INotificationSource {
  readonly type = "gmail" as const;
  readonly name = "Gmail";
  readonly defaultIntervalMs = 60_000;
  readonly icon = "gmail";

  private clientId = "";
  private clientSecret = "";
  private refreshToken = "";
  private accessToken = "";
  private tokenExpiry = 0;
  private seenMessageIds = new Set<string>();
  private maxResults = 20;

  async initialize(credentials: Record<string, string>): Promise<void> {
    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
    this.refreshToken = credentials.refreshToken;

    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error(
        "GmailSource requires clientId, clientSecret, and refreshToken"
      );
    }

    // Pre-fetch an access token to validate credentials
    await this.ensureAccessToken();
  }

  async fetch(): Promise<NotificationItem[]> {
    const items: NotificationItem[] = [];

    try {
      await this.ensureAccessToken();

      // List unread messages
      const listUrl =
        `https://gmail.googleapis.com/gmail/v1/users/me/messages` +
        `?maxResults=${this.maxResults}&q=is:unread&labelIds=INBOX`;

      const listResp = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!listResp.ok) {
        console.error(
          `[GmailSource] List failed: ${listResp.status} ${listResp.statusText}`
        );
        return [];
      }

      const listData = (await listResp.json()) as GmailListResponse;
      if (!listData.messages) return [];

      // Fetch full details for each message
      for (const msg of listData.messages) {
        if (this.seenMessageIds.has(msg.id)) continue;

        const detail = await this.fetchMessage(msg.id);
        if (!detail) continue;

        this.seenMessageIds.add(msg.id);
        const item = this.normalizeMessage(detail);
        if (item) items.push(item);
      }
    } catch (err) {
      console.error("[GmailSource] Fetch error:", err);
    }

    // Bound the seen-set
    if (this.seenMessageIds.size > 1000) {
      const arr = [...this.seenMessageIds];
      this.seenMessageIds = new Set(arr.slice(-500));
    }

    return items;
  }

  async markRead(id: string): Promise<void> {
    try {
      await this.ensureAccessToken();
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`;
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          removeLabelIds: ["UNREAD"],
        }),
      });
    } catch {
      // Non-fatal
    }
  }

  async shutdown(): Promise<void> {
    this.seenMessageIds.clear();
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return;

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!resp.ok) {
      throw new Error(
        `Gmail token refresh failed: ${resp.status} ${resp.statusText}`
      );
    }

    const data = (await resp.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // 60s buffer
  }

  private async fetchMessage(
    messageId: string
  ): Promise<GmailMessage | null> {
    try {
      const url =
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}` +
        `?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!resp.ok) return null;
      return (await resp.json()) as GmailMessage;
    } catch {
      return null;
    }
  }

  private normalizeMessage(msg: GmailMessage): NotificationItem | null {
    const headers = msg.payload?.headers ?? [];
    const subject =
      headers.find((h) => h.name.toLowerCase() === "subject")?.value ??
      "(No Subject)";
    const from =
      headers.find((h) => h.name.toLowerCase() === "from")?.value ??
      "Unknown";
    const dateStr =
      headers.find((h) => h.name.toLowerCase() === "date")?.value ?? "";

    const timestamp = dateStr ? new Date(dateStr).getTime() : Date.now();
    const body = msg.snippet ?? "";

    // Determine priority based on labels and sender
    let priority: NotificationPriority = "normal";
    if (msg.labelIds?.includes("IMPORTANT")) priority = "high";
    if (from.toLowerCase().includes("noreply")) priority = "low";

    // Extract sender name for tags
    const senderName = from.replace(/<.*>/, "").trim();

    return {
      id: `gmail-${msg.id}`,
      source: "gmail",
      title: subject,
      body,
      url: `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
      timestamp,
      read: false,
      priority,
      tags: ["email", senderName],
      sourceIcon: "gmail",
      dismissed: false,
      archived: false,
      raw: { messageId: msg.id, threadId: msg.threadId, from },
    };
  }
}
