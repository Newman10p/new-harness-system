// ─── Calendar Notification Source ─────────────────────────────────
// Fetches upcoming Google Calendar events within the next hour.
// Config: { clientId, clientSecret, refreshToken }
// Poll interval: every 5 minutes.

import type {
  INotificationSource,
  NotificationItem,
  NotificationPriority,
} from "../types.js";

// ─── Google Calendar API Types ────────────────────────────────────────

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  htmlLink?: string;
  attendees?: Array<
    { email: string; responseStatus: string; self?: boolean }
  >;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
  status?: string;
}

interface CalendarEventsListResponse {
  items?: CalendarEvent[];
  nextPageToken?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// ─── Implementation ─────────────────────────────────────────────────────

export class CalendarSource implements INotificationSource {
  readonly type = "calendar" as const;
  readonly name = "Google Calendar";
  readonly defaultIntervalMs = 5 * 60_000; // 5 minutes
  readonly icon = "calendar";

  private clientId = "";
  private clientSecret = "";
  private refreshToken = "";
  private accessToken = "";
  private tokenExpiry = 0;
  private seenEventIds = new Set<string>();
  /** Track events we've already notified about */
  private notifiedEventIds = new Set<string>();
  /** Look-ahead window: how far ahead to check for events (ms) */
  private lookAheadMs = 60 * 60 * 1000; // 1 hour

  async initialize(credentials: Record<string, string>): Promise<void> {
    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
    this.refreshToken = credentials.refreshToken;

    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error(
        "CalendarSource requires clientId, clientSecret, and refreshToken"
      );
    }

    await this.ensureAccessToken();
  }

  async fetch(): Promise<NotificationItem[]> {
    const items: NotificationItem[] = [];

    try {
      await this.ensureAccessToken();

      const now = new Date().toISOString();
      const future = new Date(Date.now() + this.lookAheadMs).toISOString();

      const url =
        `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
        `?timeMin=${encodeURIComponent(now)}` +
        `&timeMax=${encodeURIComponent(future)}` +
        `&singleEvents=true&orderBy=startTime&maxResults=25`;

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!resp.ok) {
        console.error(
          `[CalendarSource] Fetch failed: ${resp.status} ${resp.statusText}`
        );
        return [];
      }

      const data = (await resp.json()) as CalendarEventsListResponse;
      if (!data.items) return [];

      for (const event of data.items) {
        if (!event.start) continue;
        if (event.status === "cancelled") continue;
        if (this.notifiedEventIds.has(event.id)) continue;

        const startTime = this.parseEventTime(event.start);
        const timeUntilStart = startTime - Date.now();

        // Only notify if the event starts within the look-ahead window
        if (timeUntilStart > this.lookAheadMs || timeUntilStart < -60_000) {
          continue;
        }

        // Skip events that are too far out (> 1 hour) unless it's starting soon
        // (we notify at most once per event)
        const item = this.normalizeEvent(event, timeUntilStart);
        if (item) {
          items.push(item);
          this.notifiedEventIds.add(event.id);
        }
      }
    } catch (err) {
      console.error("[CalendarSource] Fetch error:", err);
    }

    // Bound notified set
    if (this.notifiedEventIds.size > 2000) {
      const arr = [...this.notifiedEventIds];
      this.notifiedEventIds = new Set(arr.slice(-1000));
    }

    return items;
  }

  async shutdown(): Promise<void> {
    this.seenEventIds.clear();
    this.notifiedEventIds.clear();
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

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
        `Calendar token refresh failed: ${resp.status} ${resp.statusText}`
      );
    }

    const data = (await resp.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  }

  private parseEventTime(start: {
    dateTime?: string;
    date?: string;
  }): number {
    if (start.dateTime) {
      return new Date(start.dateTime).getTime();
    }
    if (start.date) {
      // All-day event: start of day
      const d = new Date(start.date + "T00:00:00");
      return d.getTime();
    }
    return Date.now();
  }

  private formatTimeUntil(ms: number): string {
    if (ms <= 0) return "starting now";
    const mins = Math.floor(ms / 60_000);
    if (mins < 60) return `in ${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainMin = mins % 60;
    return `in ${hours}h ${remainMin}m`;
  }

  private normalizeEvent(
    event: CalendarEvent,
    timeUntilStart: number
  ): NotificationItem | null {
    const title = event.summary || "(No Title)";
    const description = event.description || "";
    const location = event.location || "";
    const startTime = this.parseEventTime(event.start!);
    const timeStr = this.formatTimeUntil(timeUntilStart);

    let priority: NotificationPriority = "normal";
    // Upcoming within 15 minutes = high
    if (timeUntilStart <= 15 * 60_000 && timeUntilStart >= 0) {
      priority = "high";
    }
    // Starting now or overdue = urgent
    if (timeUntilStart <= 0) {
      priority = "urgent";
    }

    // Build body text
    const bodyParts: string[] = [timeStr];
    if (location) bodyParts.push(`📍 ${location}`);
    if (description) bodyParts.push(description.slice(0, 200));

    // Check for video call links
    const hasMeetLink =
      description.includes("meet.google.com") ||
      description.includes("zoom.us");
    if (hasMeetLink) bodyParts.push("📹 Video call available");

    const tags = ["calendar", "event"];
    if (hasMeetLink) tags.push("video-call");
    if (location) tags.push("in-person");

    const actions = [
      { label: "Open in Calendar", url: event.htmlLink ?? "" },
    ];

    // Try to extract a meeting URL for quick join
    const meetMatch = description.match(/https:\/\/(meet\.google\.com\/[^\s<>"]+)/);
    const zoomMatch = description.match(/https:\/\/(zoom\.us\/j\/[^\s<>"]+)/);
    const joinUrl = meetMatch?.[1] || zoomMatch?.[1];
    if (joinUrl) {
      actions.push({ label: "Join Meeting", url: joinUrl });
    }

    return {
      id: `calendar-${event.id}`,
      source: "calendar",
      title: `📅 ${title} ${timeStr}`,
      body: bodyParts.join("\n"),
      url: event.htmlLink,
      timestamp: Date.now(),
      read: false,
      priority,
      tags,
      sourceIcon: "calendar",
      dismissed: false,
      archived: false,
      actions,
      raw: {
        eventId: event.id,
        summary: event.summary,
        startTime: new Date(startTime).toISOString(),
        location,
        attendees: event.attendees?.length ?? 0,
      },
    };
  }
}
