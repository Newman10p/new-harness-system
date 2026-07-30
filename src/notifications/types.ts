// ─── M.A.I. Notification Types ─────────────────────────────────────────────
// Type definitions for the unified notification aggregator.
// Normalizes notifications from Gmail, GitHub, Slack, Calendar, RSS, etc.

// ─── Source Enum ────────────────────────────────────────────────────────────

export type NotificationSource =
  | "gmail"
  | "github"
  | "slack"
  | "calendar"
  | "discord"
  | "rss"
  | "custom";

// ─── Priority ───────────────────────────────────────────────────────────────

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

// ─── Notification Item ──────────────────────────────────────────────────────

/**
 * A single normalized notification from any source.
 */
export interface NotificationItem {
  /** Unique notification ID (UUID) */
  id: string;
  /** Which source this notification came from */
  source: NotificationSource;
  /** Notification title / subject line */
  title: string;
  /** Body text / preview */
  body: string;
  /** URL to open for more details */
  url?: string;
  /** Unix timestamp (ms) when received */
  timestamp: number;
  /** Whether the user has read this notification */
  read: boolean;
  /** Urgency level */
  priority: NotificationPriority;
  /** Tags for categorization and filtering */
  tags: string[];
  /** Icon name or URL for the source (e.g., "gmail", "github") */
  sourceIcon?: string;
  /** Actionable buttons the user can click */
  actions?: Array<{ label: string; url: string }>;
  /** Whether this notification has been dismissed */
  dismissed: boolean;
  /** Whether this notification has been archived */
  archived: boolean;
  /** Raw source-specific data, kept for audit */
  raw?: Record<string, unknown>;
}

// ─── Source Configuration ───────────────────────────────────────────────────

/**
 * Configuration for a single notification source.
 */
export interface NotificationSourceConfig {
  /** Source type */
  type: NotificationSource;
  /** Whether this source is currently active */
  enabled: boolean;
  /** Source-specific credentials and settings */
  credentials: Record<string, string>;
  /** How often to poll this source (ms) */
  refreshIntervalMs: number;
  /** Optional source-specific filters */
  filters?: Record<string, unknown>;
  /** Human-readable label for this source */
  label?: string;
}

// ─── Source Interface ───────────────────────────────────────────────────────

/**
 * Interface that all notification sources must implement.
 */
export interface INotificationSource {
  /** Source type identifier */
  readonly type: NotificationSource;
  /** Display name */
  readonly name: string;
  /** Default poll interval in ms */
  readonly defaultIntervalMs: number;
  /** Default icon identifier */
  readonly icon: string;

  /**
 * Initialize the source with credentials.
 * Throw if credentials are invalid.
 */
  initialize(credentials: Record<string, string>): Promise<void>;

  /**
 * Fetch new/updated notifications from this source.
 * Returns an array of normalized NotificationItems.
 * Must never throw — return empty array on error.
 */
  fetch(): Promise<NotificationItem[]>;

  /**
 * Mark a notification as read in the upstream source.
 * Optional — not all sources support this.
 */
  markRead?(id: string): Promise<void>;

  /**
 * Perform any cleanup when the source is shut down.
 */
  shutdown?(): Promise<void>;
}

// ─── Notification Filters ──────────────────────────────────────────────────

/**
 * Filter parameters for querying notifications.
 */
export interface NotificationFilter {
 /** Only return notifications from these sources */
  sources?: NotificationSource[];
  /** Only return unread notifications */
  unreadOnly?: boolean;
  /** Only return notifications after this timestamp */
  since?: number;
  /** Only return notifications before this timestamp */
  before?: number;
  /** Only return notifications with these priorities */
  priorities?: NotificationPriority[];
  /** Only return notifications with any of these tags */
  tags?: string[];
  /** Only return non-dismissed notifications */
  activeOnly?: boolean;
  /** Search in title and body (case-insensitive substring) */
  search?: string;
  /** Max results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ─── Statistics ──────────────────────────────────────────────────────────────

/**
 * Notification statistics.
 */
export interface NotificationStats {
  /** Total notifications in the store */
  total: number;
  /** Unread count */
  unread: number;
  /** Breakdown by source */
  bySource: Record<string, number>;
  /** Most recent notifications (up to 10) */
  recent: NotificationItem[];
  /** Unread count by source */
  unreadBySource: Record<string, number>;
  /** Average notifications received per hour (rolling 24h) */
  perHourRate: number;
}

// ─── Aggregator Config Persistence ──────────────────────────────────────────

/**
 * Persisted configuration for the notification aggregator.
 */
export interface NotificationAggregatorConfig {
  /** Registered source configurations */
  sources: NotificationSourceConfig[];
  /** Read notification IDs (synced across restarts) */
  readIds: string[];
  /** Dismissed notification IDs */
  dismissedIds: string[];
  /** Archived notification IDs */
  archivedIds: string[];
  /** Max notifications to keep in memory */
  maxNotifications: number;
  /** Last check timestamp per source */
  lastCheckPerSource: Record<string, number>;
}

// ─── Source Factory ──────────────────────────────────────────────────────────

/**
 * Factory function type for creating notification sources.
 */
export type NotificationSourceFactory = (
  config: NotificationSourceConfig
) => INotificationSource;

// ─── Audit Entry ────────────────────────────────────────────────────────────

/**
 * Audit log entry for notification access.
 */
export interface NotificationAuditEntry {
  action: "view" | "read" | "dismiss" | "archive" | "fetch";
  notificationId?: string;
  source?: NotificationSource;
  /** Auto-filled by the audit method */
  timestamp?: number;
  details?: string;
}
