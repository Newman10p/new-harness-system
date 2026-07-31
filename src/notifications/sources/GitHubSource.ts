// ─── GitHub Notification Source ────────────────────────────────────────
// Fetches GitHub notifications (issues, PRs, commits) using a personal
// access token.  Config: { token, repos?: string[], eventType?: string[] }
// Poll interval: every 30 seconds.

import type {
  INotificationSource,
  NotificationItem,
  NotificationPriority,
} from "../types.js";

// ─── GitHub API Types ─────────────────────────────────────────────────────

interface GitHubNotification {
  id: string;
  unread: boolean;
  reason:
    | "mention"
    | "team_mention"
    | "review_requested"
    | "review_dismissed"
    | "subscribed"
    | "comment"
    | "author"
    | "state_change"
    | "assign"
    | "security_alert";
  repository: {
    full_name: string;
    html_url: string;
    owner: { login: string };
  };
  subject: {
    title: string;
    url: string;
    type: "Issue" | "PullRequest" | "Commit" | "Release" | string;
    latest_comment_url?: string;
  };
  updated_at: string;
  last_read_at?: string;
  url: string;
}

// ─── Implementation ────────────────────────────────────────────────────────

export class GitHubSource implements INotificationSource {
  readonly type = "github" as const;
  readonly name = "GitHub";
  readonly defaultIntervalMs = 30_000;
  readonly icon = "github";

  private token = "";
  private repos?: string[];
  private eventTypes?: string[];
  private seenIds = new Set<string>();
  private baseUrl = "https://api.github.com";
  private since: string | null = null;

  async initialize(credentials: Record<string, string>): Promise<void> {
    this.token = credentials.token;
    if (!this.token) {
      throw new Error("GitHubSource requires a 'token' credential");
    }
  }

  /**
   * Set repo and event-type filters (call after initialize or via config.filters).
   */
  configure(filters?: {
    repos?: string[];
    eventType?: string[];
  }): void {
    if (filters?.repos) this.repos = filters.repos;
    if (filters?.eventType) this.eventTypes = filters.eventType;
  }

  async fetch(): Promise<NotificationItem[]> {
    const items: NotificationItem[] = [];

    try {
 // Use 'since' header for incremental fetches
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MAI-NotificationAggregator",
      };
      if (this.since) {
        headers["If-Modified-Since"] = this.since;
      }

      let url = `${this.baseUrl}/notifications?per_page=50&participating=true`;
      const resp = await fetch(url, { headers });

      if (resp.status === 304) return []; // Not modified
      if (!resp.ok) {
        console.error(
          `[GitHubSource] Fetch failed: ${resp.status} ${resp.statusText}`
        );
        return [];
      }

      const notifications = (await resp.json()) as GitHubNotification[];

      // Update 'since' from the Last-Modified header
      const lastModified = resp.headers.get("last-modified");
      if (lastModified) {
        this.since = lastModified;
      }

      for (const n of notifications) {
        if (!n.unread) continue;
        if (this.seenIds.has(n.id)) continue;

        // Filter by repos if configured
        if (this.repos?.length) {
          if (!this.repos.includes(n.repository.full_name)) continue;
        }

        // Filter by subject type if configured
        if (this.eventTypes?.length) {
          if (!this.eventTypes.includes(n.subject.type)) continue;
        }

        this.seenIds.add(n.id);
        const item = this.normalizeNotification(n);
        if (item) items.push(item);
      }
    } catch (err) {
      console.error("[GitHubSource] Fetch error:", err);
    }

    // Bound seen-set
    if (this.seenIds.size > 2000) {
      const arr = [...this.seenIds];
      this.seenIds = new Set(arr.slice(-1000));
    }

    return items;
  }

  async markRead(id: string): Promise<void> {
    // GitHub uses a notification-specific ID in the URL
    const ghId = id.replace("github-", "");
    try {
      const url = `${this.baseUrl}/notifications/threads/${ghId}`;
      await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    } catch {
      // Non-fatal
    }
  }

  async shutdown(): Promise<void> {
    this.seenIds.clear();
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private normalizeNotification(
    n: GitHubNotification
  ): NotificationItem | null {
    const timestamp = new Date(n.updated_at).getTime();

    let priority: NotificationPriority = "normal";
    let reason = n.reason;
    if (reason === "security_alert") priority = "urgent";
    else if (
      reason === "mention" ||
      reason === "review_requested"
    )
      priority = "high";
    else if (reason === "subscribed") priority = "low";

    // Build action URL from the subject URL
    let url: string | undefined;
    try {
      const subjectUrl = new URL(n.subject.url);
      // Convert API URL to web URL
      url = `https://github.com${subjectUrl.pathname}`;
    } catch {
      url = n.repository.html_url;
    }

    const subjectType = n.subject.type.toLowerCase();
    const repoName = n.repository.full_name;

    return {
      id: `github-${n.id}`,
      source: "github",
      title: `[${repoName}] ${n.subject.title}`,
      body: `${subjectType} · ${reason} · updated ${n.updated_at}`,
      url,
      timestamp,
      read: false,
      priority,
      tags: ["github", repoName, subjectType, reason],
      sourceIcon: "github",
      dismissed: false,
      archived: false,
      actions: [
        { label: "Open", url: url ?? "" },
        {
          label: "Repository",
          url: n.repository.html_url,
        },
      ],
      raw: {
        notificationId: n.id,
        reason,
        subjectType: n.subject.type,
        repo: n.repository.full_name,
        actor: n.repository.owner.login,
      },
    };
  }
}
