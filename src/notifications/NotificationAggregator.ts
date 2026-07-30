// ─── M.A.I. Notification Aggregator ───────────────────────────────────
// Unified notification center that collects notifications from multiple
// sources (Gmail, GitHub, Slack, Calendar, RSS) and publishes them
// through the EventMesh for the ProactiveEngine to process.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  NotificationItem,
  NotificationSource,
  NotificationSourceConfig,
  NotificationFilter,
  NotificationStats,
  NotificationAggregatorConfig,
  NotificationAuditEntry,
  INotificationSource,
  NotificationSourceFactory,
} from "./types.js";
import { getEventMesh } from "../events/EventMesh.js";
import { PROJECT_ROOT } from "../core/constants.js";

// ─── Paths ──────────────────────────────────────────────────────────────────

const STATE_DIR = path.join(PROJECT_ROOT, "state");
const CONFIG_PATH = path.join(STATE_DIR, "notifications-config.json");
const AUDIT_LOG_PATH = path.join(STATE_DIR, "notifications-audit.jsonl");

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_NOTIFICATIONS = 5000;
const DEFAULT_CONFIG: NotificationAggregatorConfig = {
  sources: [],
  readIds: [],
  dismissedIds: [],
  archivedIds: [],
  maxNotifications: DEFAULT_MAX_NOTIFICATIONS,
  lastCheckPerSource: {},
};

// ─── Aggregator ────────────────────────────────────────────────────────────

export class NotificationAggregator {
  private config: NotificationAggregatorConfig;
  private notifications: NotificationItem[] = [];
  private sources: Map<string, INotificationSource> = new Map();
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private auditLog: NotificationAuditEntry[] = [];
  private sourceFactories: Map<NotificationSource, NotificationSourceFactory> = new Map();
  private shutdownFlag = false;
  private initialized = false;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Initialize: load persisted config, register built-in sources, start polling.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(STATE_DIR, { recursive: true });
    await this.loadConfig();
    await this.loadAuditLog();

    // Initialize and start all enabled sources
    for (const sourceConfig of this.config.sources) {
      if (sourceConfig.enabled) {
        await this.startSource(sourceConfig);
      }
    }

    this.initialized = true;
  }

  /**
   * Graceful shutdown: stop all polling timers, persist state.
   */
  async shutdown(): Promise<void> {
    this.shutdownFlag = true;

    // Stop all timers
    for (const [sourceType, timer] of this.pollTimers) {
      clearInterval(timer);
      this.pollTimers.delete(sourceType);
    }

    // Shutdown sources
    for (const source of this.sources.values()) {
      try {
        await source.shutdown?.();
      } catch {
        // Non-fatal
      }
    }

    await this.persistConfig();
    await this.persistAuditLog();
  }

  // ─── Source Registration ───────────────────────────────────────────────

  /**
   * Register a factory function for creating notification sources.
   */
  registerSourceFactory(
    type: NotificationSource,
    factory: NotificationSourceFactory
  ): void {
    this.sourceFactories.set(type, factory);
  }

  /**
   * Register and start a notification source.
   */
  async registerSource(config: NotificationSourceConfig): Promise<void> {
    // Remove existing source if re-registering
    await this.removeSource(config.type);

    // Add to config
    const existingIdx = this.config.sources.findIndex(
      (s) => s.type === config.type
    );
    if (existingIdx >= 0) {
      this.config.sources[existingIdx] = config;
    } else {
      this.config.sources.push(config);
    }

    if (config.enabled) {
      await this.startSource(config);
    }

    await this.persistConfig();
  }

  /**
   * Remove a source and stop its polling.
   */
  async removeSource(type: NotificationSource): Promise<void> {
    // Stop polling
    const timer = this.pollTimers.get(type);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(type);
    }

    // Shutdown source
    const source = this.sources.get(type);
    if (source) {
      try {
        await source.shutdown?.();
      } catch {
        // Non-fatal
      }
      this.sources.delete(type);
    }

    // Remove from config
    this.config.sources = this.config.sources.filter((s) => s.type !== type);
    await this.persistConfig();
  }

  /**
   * Force-check all registered sources immediately.
   */
  async checkAllSources(): Promise<number> {
    let total = 0;
    for (const [sourceType, source] of this.sources) {
      try {
        const items = await source.fetch();
        total += this.ingestNotifications(items, sourceType);
      } catch (err) {
        console.error(
          `[NotificationAggregator] Source ${sourceType} check failed:`,
          err
        );
      }
    }
    return total;
  }

  // ─── Query Notifications ───────────────────────────────────────────────

  /**
   * Get notifications matching the given filters.
   */
  getNotifications(filter?: NotificationFilter): NotificationItem[] {
    let results = [...this.notifications];

    if (filter) {
      if (filter.sources?.length) {
        results = results.filter((n) => filter.sources!.includes(n.source));
      }
      if (filter.unreadOnly) {
        results = results.filter((n) => !n.read);
      }
      if (filter.activeOnly) {
        results = results.filter((n) => !n.dismissed && !n.archived);
      }
      if (filter.since) {
        results = results.filter((n) => n.timestamp >= filter.since!);
      }
      if (filter.before) {
        results = results.filter((n) => n.timestamp <= filter.before!);
      }
      if (filter.priorities?.length) {
        results = results.filter((n) =>
          filter.priorities!.includes(n.priority)
        );
      }
      if (filter.tags?.length) {
        results = results.filter((n) =>
          n.tags.some((t) => filter.tags!.includes(t))
        );
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        results = results.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.body.toLowerCase().includes(q)
        );
      }
    }

    // Sort by timestamp descending (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Pagination
    if (filter?.offset) {
      results = results.slice(filter.offset);
    }
    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    // Audit the view
    this.audit({ action: "view", details: `filter: ${JSON.stringify(filter)}` });

    return results;
  }

  /**
   * Get a single notification by ID.
   */
  getNotification(id: string): NotificationItem | undefined {
    const notif = this.notifications.find((n) => n.id === id);
    if (notif) {
      this.audit({ action: "view", notificationId: id, source: notif.source });
    }
    return notif;
  }

  // ─── State Mutation ────────────────────────────────────────────────────

  /**
   * Mark a notification as read.
   */
  async markRead(id: string): Promise<boolean> {
    const notif = this.notifications.find((n) => n.id === id);
    if (!notif || notif.read) return false;

    notif.read = true;
    if (!this.config.readIds.includes(id)) {
      this.config.readIds.push(id);
    }

    // Try upstream mark-read
    const source = this.sources.get(notif.source);
    if (source?.markRead) {
      try {
        await source.markRead(id);
      } catch {
        // Upstream mark-read failure is non-fatal
      }
    }

    this.audit({
      action: "read",
      notificationId: id,
      source: notif.source,
      details: notif.title,
    });

    await this.persistConfig();
    return true;
  }

  /**
   * Dismiss a notification (hide from active view).
   */
  async dismiss(id: string): Promise<boolean> {
    const notif = this.notifications.find((n) => n.id === id);
    if (!notif || notif.dismissed) return false;

    notif.dismissed = true;
    if (!this.config.dismissedIds.includes(id)) {
      this.config.dismissedIds.push(id);
    }

    this.audit({
      action: "dismiss",
      notificationId: id,
      source: notif.source,
      details: notif.title,
    });

    await this.persistConfig();
    return true;
  }

  /**
   * Archive a notification (remove from active + dismissed views).
   */
  async archive(id: string): Promise<boolean> {
    const notif = this.notifications.find((n) => n.id === id);
    if (!notif || notif.archived) return false;

    notif.archived = true;
    notif.dismissed = true;
    if (!this.config.archivedIds.includes(id)) {
      this.config.archivedIds.push(id);
    }

    this.audit({
      action: "archive",
      notificationId: id,
      source: notif.source,
      details: notif.title,
    });

    await this.persistConfig();
    return true;
  }

  // ─── Statistics ────────────────────────────────────────────────────────

  /**
   * Get notification statistics.
   */
  getStats(): NotificationStats {
    const active = this.notifications.filter(
      (n) => !n.dismissed && !n.archived
    );
    const unread = active.filter((n) => !n.read);

    const bySource: Record<string, number> = {};
    const unreadBySource: Record<string, number> = {};

    for (const n of active) {
      bySource[n.source] = (bySource[n.source] || 0) + 1;
      if (!n.read) {
        unreadBySource[n.source] = (unreadBySource[n.source] || 0) + 1;
      }
    }

    // Per-hour rate (rolling 24h)
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    const recentCount = this.notifications.filter(
      (n) => n.timestamp >= cutoff24h
    ).length;
    const perHourRate = Math.round((recentCount / 24) * 100) / 100;

    // Recent notifications (up to 10)
    const recent = [...active]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    return {
      total: active.length,
      unread: unread.length,
      bySource,
      unreadBySource,
      recent,
      perHourRate,
    };
  }

  // ─── Source Management ─────────────────────────────────────────────────

  /**
   * Get all registered source configurations.
   */
  getSourceConfigs(): NotificationSourceConfig[] {
    return [...this.config.sources];
  }

  /**
   * Enable or disable a source.
   */
  async setSourceEnabled(
    type: NotificationSource,
    enabled: boolean
  ): Promise<void> {
    const cfg = this.config.sources.find((s) => s.type === type);
    if (!cfg) return;

    cfg.enabled = enabled;

    if (enabled) {
      await this.startSource(cfg);
    } else {
      const timer = this.pollTimers.get(type);
      if (timer) {
        clearInterval(timer);
        this.pollTimers.delete(type);
      }
    }

    await this.persistConfig();
  }

  // ─── Private: Source Lifecycle ────────────────────────────────────────

  private async startSource(config: NotificationSourceConfig): Promise<void> {
    const factory = this.sourceFactories.get(config.type);
    if (!factory) {
      console.warn(
        `[NotificationAggregator] No factory registered for source type: ${config.type}`
      );
      return;
    }

    try {
      const source = factory(config);
      await source.initialize(config.credentials);
      this.sources.set(config.type, source);

      // Start polling
      const intervalMs =
        config.refreshIntervalMs || source.defaultIntervalMs;
      const timer = setInterval(
        () => this.pollSource(config.type),
        intervalMs
      );
      if (timer.unref) timer.unref();
      this.pollTimers.set(config.type, timer);

      // Immediate first check
      this.pollSource(config.type).catch(() => {});
    } catch (err) {
      console.error(
        `[NotificationAggregator] Failed to initialize source ${config.type}:`,
        err
      );
    }
  }

  private async pollSource(sourceType: string): Promise<void> {
    if (this.shutdownFlag) return;

    const source = this.sources.get(sourceType as NotificationSource);
    if (!source) return;

    try {
      const items = await source.fetch();
      const newCount = this.ingestNotifications(
        items,
        sourceType as NotificationSource
      );
      this.config.lastCheckPerSource[sourceType] = Date.now();

      if (newCount > 0) {
        this.audit({
          action: "fetch",
          source: sourceType as NotificationSource,
          details: `${newCount} new notifications`,
        });
      }
    } catch (err) {
      console.error(
        `[NotificationAggregator] Error polling source ${sourceType}:`,
        err
      );
    }
  }

  /**
   * Ingest new notifications, dedup, and publish to EventMesh.
   */
  private ingestNotifications(
    items: NotificationItem[],
    sourceType: NotificationSource
  ): number {
    const existingIds = new Set(this.notifications.map((n) => n.id));
    let newCount = 0;

    for (const item of items) {
      if (existingIds.has(item.id)) continue;

      // Apply persisted state
      item.read = this.config.readIds.includes(item.id);
      item.dismissed = this.config.dismissedIds.includes(item.id);
      item.archived = this.config.archivedIds.includes(item.id);

      this.notifications.push(item);
      existingIds.add(item.id);
      newCount++;

      // Publish to EventMesh
      const mesh = getEventMesh();
      const priorityMap: Record<
        string,
        "low" | "normal" | "high" | "critical"
      > = {
        low: "low",
        normal: "normal",
        high: "high",
        urgent: "critical",
      };

      mesh.publishSimple(
        "notification.received",
        "notification-aggregator",
        {
          notificationId: item.id,
          source: item.source,
          title: item.title,
          priority: item.priority,
          tags: item.tags,
          url: item.url,
        },
        priorityMap[item.priority] || "normal",
        "local"
      );
    }

    // Trim if over limit
    if (this.notifications.length > this.config.maxNotifications) {
      this.notifications.sort((a, b) => a.timestamp - b.timestamp);
      const excess =
        this.notifications.length - this.config.maxNotifications;
      this.notifications = this.notifications.slice(excess);
    }

    return newCount;
  }

  // ─── Audit ─────────────────────────────────────────────────────────────

  private audit(entry: NotificationAuditEntry): void {
    entry.timestamp = entry.timestamp || Date.now();
    this.auditLog.push(entry);

    // Keep audit log bounded
    if (this.auditLog.length > 10_000) {
      this.auditLog = this.auditLog.slice(-5_000);
    }
  }

  // ─── Persistence ───────────────────────────────────────────────────────

  private async loadConfig(): Promise<void> {
    try {
      const content = await fs.readFile(CONFIG_PATH, "utf-8");
      const data = JSON.parse(content);
      this.config = { ...DEFAULT_CONFIG, ...data };
    } catch {
      // No config yet — use defaults
    }
  }

  private async persistConfig(): Promise<void> {
    try {
      await fs.writeFile(
        CONFIG_PATH,
        JSON.stringify(this.config, null, 2),
        "utf-8"
      );
    } catch {
      // Persistence failure is non-fatal
    }
  }

  private async loadAuditLog(): Promise<void> {
    try {
      const content = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        try {
          this.auditLog.push(JSON.parse(line) as NotificationAuditEntry);
        } catch {
          // Skip malformed
        }
      }
    } catch {
      // No audit log yet
    }
  }

  private async persistAuditLog(): Promise<void> {
    try {
      const lines = this.auditLog.map((e) => JSON.stringify(e)).join("\n");
      await fs.writeFile(
        AUDIT_LOG_PATH,
        lines ? lines + "\n" : "",
        "utf-8"
      );
    } catch {
      // Non-fatal
    }
  }
}

// ─── Singleton Accessor ─────────────────────────────────────────────────────

let _instance: NotificationAggregator | null = null;

export function getNotificationAggregator(): NotificationAggregator {
  if (!_instance) {
    _instance = new NotificationAggregator();
  }
  return _instance;
}
