// ─── RSS Feed Notification Source ───────────────────────────────
// Generic RSS/Atom feed reader. Fetches new items since last check.
// Config: { feeds: Array<{ url: string, name: string }> }
// Poll interval: every 15 minutes.

import type {
  INotificationSource,
  NotificationItem,
  NotificationPriority,
} from "../types.js";

// ─── RSS/Atom Types ────────────────────────────────────────────────

interface RssFeed {
  url: string;
  name: string;
  /** Last processed item ID or timestamp for this feed */
  lastItemTimestamp: number;
  /** ETag from last fetch for conditional requests */
  etag?: string;
  /** Last-Modified header from last fetch */
  lastModified?: string;
}

interface ParsedFeedItem {
  id: string;
  title: string;
  link?: string;
  description: string;
  author?: string;
  publishedAt: number;
  categories: string[];
}

// ─── Implementation ──────────────────────────────────────────────────

export class RssSource implements INotificationSource {
  readonly type = "rss" as const;
  readonly name = "RSS Feeds";
  readonly defaultIntervalMs = 15 * 60_000; // 15 minutes
  readonly icon = "rss";

  private feeds: RssFeed[] = [];
  private seenItemIds = new Set<string>();
  /** Max items to return per fetch across all feeds */
  private maxItemsPerFetch = 50;
  /** Max description length */
  private maxDescLength = 300;
  /** Request timeout in ms */
  private timeoutMs = 15_000;

  async initialize(credentials: Record<string, string>): Promise<void> {
    // RSS feeds are configured via config.filters.feeds
    // but we accept a JSON string in credentials.feeds for convenience
    const feedsJson = credentials.feeds;
    if (feedsJson) {
      try {
        const parsed = JSON.parse(feedsJson);
        if (Array.isArray(parsed)) {
          this.feeds = parsed.map(
            (f: { url: string; name: string; lastItemTimestamp?: number }) => ({
              url: f.url,
              name: f.name || f.url,
              lastItemTimestamp: f.lastItemTimestamp || 0,
            })
          );
        }
      } catch {
        console.error("[RssSource] Failed to parse feeds JSON");
      }
    }

    if (this.feeds.length === 0) {
      console.warn("[RssSource] No feeds configured");
    }
  }

  /**
   * Set feeds programmatically.
   */
  setFeeds(feeds: Array<{ url: string; name: string }>): void {
    const existing = new Map(this.feeds.map((f) => [f.url, f]));
    this.feeds = feeds.map((f) => {
      const prev = existing.get(f.url);
      return {
        url: f.url,
        name: f.name || f.url,
        lastItemTimestamp: prev?.lastItemTimestamp || 0,
        etag: prev?.etag,
        lastModified: prev?.lastModified,
      };
    });
  }

  async fetch(): Promise<NotificationItem[]> {
    const items: NotificationItem[] = [];

    for (const feed of this.feeds) {
      try {
        const newItems = await this.fetchFeed(feed);
        items.push(...newItems);
      } catch (err) {
        console.error(
          `[RssSource] Error fetching feed ${feed.name}:`,
          err
        );
      }
    }

    if (items.length > this.maxItemsPerFetch) {
      items.sort((a, b) => b.timestamp - a.timestamp);
      items.length = this.maxItemsPerFetch;
    }

    // Persist feed state
    this.persistFeedState().catch(() => {});

    return items;
  }

  async shutdown(): Promise<void> {
    this.seenItemIds.clear();
    this.persistFeedState().catch(() => {});
  }

  // ─── Feed Fetching & Parsing ──────────────────────────────────────

  private async fetchFeed(feed: RssFeed): Promise<NotificationItem[]> {
    const headers: Record<string, string> = {
      "User-Agent": "MAI-NotificationAggregator/1.0",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    };

    // Conditional request headers
    if (feed.etag) headers["If-None-Match"] = feed.etag;
    if (feed.lastModified) headers["If-Modified-Since"] = feed.lastModified;

    const resp = await fetch(feed.url, {
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    // Update conditional headers
    const newEtag = resp.headers.get("etag");
    if (newEtag) feed.etag = newEtag;
    const newLastMod = resp.headers.get("last-modified");
    if (newLastMod) feed.lastModified = newLastMod;

    if (resp.status === 304) return []; // Not modified
    if (!resp.ok) {
      console.error(
        `[RssSource] Feed ${feed.name} returned ${resp.status}`
      );
      return [];
    }

    const xml = await resp.text();
    const parsed = this.parseXml(xml);
    if (!parsed) return [];

    // Filter to only new items
    const newItems = parsed.filter(
      (item) => item.publishedAt > feed.lastItemTimestamp
    );

    // Update last seen timestamp
    if (parsed.length > 0) {
      const maxTimestamp = Math.max(...parsed.map((i) => i.publishedAt));
      if (maxTimestamp > feed.lastItemTimestamp) {
        feed.lastItemTimestamp = maxTimestamp;
      }
    }

    return newItems.map((item) => this.feedItemToNotification(item, feed));
  }

  /**
   * Minimal RSS/Atom XML parser using regex.
   * Handles both RSS 2.0 and Atom formats.
   */
  private parseXml(xml: string): ParsedFeedItem[] {
    const items: ParsedFeedItem[] = [];

    // Try RSS 2.0 first
    const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi);
    if (rssItems?.length) {
      for (const itemXml of rssItems) {
        const title = this.extractTag(itemXml, "title");
        const link = this.extractTag(itemXml, "link");
        const description = this.stripHtml(
          this.extractTag(itemXml, "description") ||
            this.extractTag(itemXml, "content:encoded") ||
            ""
        );
        const author =
          this.extractTag(itemXml, "author") ||
          this.extractTag(itemXml, "dc:creator");
        const pubDate = this.extractTag(itemXml, "pubDate");
        const timestamp = pubDate
          ? new Date(pubDate).getTime()
          : Date.now();

        // Extract categories
        const categoryMatches = itemXml.match(
          /<category[^>]*>([^<]*)<\/category>/gi
        );
        const categories = categoryMatches
          ? categoryMatches.map((c) =>
              (c.match(/<category[^>]*>([^<]*)<\/category>/i) || [])[1]?.trim()
            ).filter(Boolean)
          : [];

        // Generate a stable ID from link or title+date
        const id = link || `${title}-${pubDate}`;

        items.push({
          id,
          title: this.decodeEntities(title || "(No Title)"),
          link: link || undefined,
          description: description.slice(0, this.maxDescLength),
          author: this.decodeEntities(author || undefined),
          publishedAt: isNaN(timestamp) ? Date.now() : timestamp,
          categories,
        });
      }
      return items;
    }

    // Try Atom
    const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi);
    if (atomEntries?.length) {
      for (const entryXml of atomEntries) {
        const title = this.extractTag(entryXml, "title");
        const link =
          this.extractAtomLink(entryXml) ||
          this.extractTag(entryXml, "link");
        const content =
          this.stripHtml(
            this.extractTag(entryXml, "content") ||
              this.extractTag(entryXml, "summary") ||
              ""
          );
        const author =
          this.extractTag(entryXml, "name") ||
          this.extractTag(entryXml, "author");
        const updated = this.extractTag(entryXml, "updated") ||
          this.extractTag(entryXml, "published");
        const timestamp = updated
          ? new Date(updated).getTime()
          : Date.now();

        const id = this.extractTag(entryXml, "id") || `${title}-${updated}`;

        const categoryMatches = entryXml.match(
          /<term[^>]*>([^<]*)<\/term>/gi
        );
        const categories = categoryMatches
          ? categoryMatches.map((c) =>
              (c.match(/<term[^>]*>([^<]*)<\/term>/i) || [])[1]?.trim()
            ).filter(Boolean)
          : [];

        items.push({
          id,
          title: this.decodeEntities(title || "(No Title)"),
          link: link || undefined,
          description: content.slice(0, this.maxDescLength),
          author: this.decodeEntities(author || undefined),
          publishedAt: isNaN(timestamp) ? Date.now() : timestamp,
          categories,
        });
      }
    }

    return items;
  }

  /**
   * Extract text content from an XML tag.
   * Handles CDATA sections.
   */
  private extractTag(xml: string, tag: string): string | undefined {
    const regex = new RegExp(
      `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`,
      "i"
    );
    let match = regex.exec(xml);
    if (match) return match[1];

    // Try without CDATA
    const regex2 = new RegExp(
      `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );
    match = regex2.exec(xml);
    return match?.[1]?.trim();
  }

  /**
   * Extract href from Atom <link> elements.
   */
  private extractAtomLink(xml: string): string | undefined {
    // Atom links use href attribute: <link href="..." rel="alternate"/>
    const match = xml.match(
      /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i
    );
    if (match) return match[1];

    // Try href first regardless of rel
    const match2 = xml.match(/<link[^>]*href="([^"]+)"[^>]*>/i);
    return match2?.[1];
  }

  /**
   * Strip HTML tags from a string.
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<p\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  /**
   * Decode common HTML entities.
   */
  private decodeEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  /**
   * Convert a parsed feed item into a notification.
   */
  private feedItemToNotification(
    item: ParsedFeedItem,
    feed: RssFeed
  ): NotificationItem {
    let priority: NotificationPriority = "normal";

    // Heuristic: items with "urgent", "critical", "alert" in title = high
    const titleLower = item.title.toLowerCase();
    if (
      titleLower.includes("urgent") ||
      titleLower.includes("critical") ||
      titleLower.includes("security") ||
      titleLower.includes("outage")
    ) {
      priority = "high";
    }

    const tags = ["rss", feed.name, ...item.categories];

    return {
      id: `rss-${this.hashId(item.id)}`,
      source: "rss",
      title: item.title,
      body: item.author
        ? `By ${item.author}\n\n${item.description}`
        : item.description,
      url: item.link,
      timestamp: item.publishedAt,
      read: false,
      priority,
      tags,
      sourceIcon: "rss",
      dismissed: false,
      archived: false,
      actions: item.link
        ? [{ label: "Read", url: item.link }]
        : undefined,
      raw: {
        feedName: feed.name,
        feedUrl: feed.url,
        author: item.author,
        categories: item.categories,
      },
    };
  }

  /**
   * Create a short hash for deduplication.
   */
  private hashId(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Persist feed last-seen timestamps to allow resuming after restart.
   */
  private async persistFeedState(): Promise<void> {
    // Feed state is persisted as part of the aggregator config
    // via the config.filters mechanism. We store it in-memory here
    // and let the aggregator handle persistence.
    // For now, state is lost on restart (acceptable for RSS).
  }
}
