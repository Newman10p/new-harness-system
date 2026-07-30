// ─── M.A.I. Analytics Engine ───────────────────────────────────────────
// Records interaction events, generates reports, and feeds insights
// into the self-improvement loop.
//
// Storage: JSONL (append-only) for high-performance event recording.
// Retention: 90 days by default; older data is compacted into summaries.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PROJECT_ROOT } from "../core/constants.js";
import type {
  InteractionEvent,
  AnalyticsReport,
  TimeSeriesPoint,
  RealtimeStats,
  ExportFormat,
  SessionRecord,
} from "./types.js";

// ─── Constants ─────────────────────────────────────────────────────────────

const EVENTS_PATH = path.join(PROJECT_ROOT, "state", "analytics-events.jsonl");
const COMPACTED_PATH = path.join(PROJECT_ROOT, "state", "analytics-compacted.json");
const RETENTION_DAYS = 90;
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 50;

// ─── Analytics Engine ──────────────────────────────────────────────────────

export class AnalyticsEngine {
  private events: InteractionEvent[] = [];
  private sessions: Map<string, SessionRecord> = new Map();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private currentSessionId: string;
  private sessionStartTime: number;
  private initialized = false;
  private pendingWrite = 0;

  constructor() {
    this.currentSessionId = crypto.randomUUID();
    this.sessionStartTime = Date.now();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Initialize the analytics engine: load existing data, start flush timer.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.loadData();
    this.startFlushTimer();
    this.initialized = true;

    // Record session start
    this.recordEvent({
      type: "session_start",
      sessionId: this.currentSessionId,
      data: { version: 1 },
    });

    console.log(`[Analytics] Initialized. ${this.events.length} historical events loaded.`);
  }

  /**
   * Record an interaction event.
   */
  recordEvent(partial: Omit<InteractionEvent, "id" | "timestamp">): InteractionEvent {
    const event: InteractionEvent = {
      ...partial,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    this.events.push(event);
    this.updateSessionState(event);

    // Immediate flush for important events
    if (event.type === "session_end" || this.events.length >= FLUSH_BATCH_SIZE) {
      this.flushToDisk().catch(() => {});
    }

    return event;
  }

  /**
   * Generate an analytics report for the given time range.
   */
  generateReport(from: number, to?: number): AnalyticsReport {
    const endTime = to ?? Date.now();
    const filtered = this.events.filter(e => e.timestamp >= from && e.timestamp <= endTime);

    const messagesSent = filtered.filter(e => e.type === "message_sent").length;
    const actionsExecuted = filtered.filter(e => e.type === "action_executed").length;
    const actionsBlocked = filtered.filter(e => e.type === "action_blocked").length;
    const macrosRun = filtered.filter(e => e.type === "macro_run").length;

    // Top commands (from message_sent events)
    const commandMap = new Map<string, number>();
    for (const event of filtered.filter(e => e.type === "message_sent")) {
      const cmd = (event.data.command as string) || event.data.text as string || "(unknown)";
      commandMap.set(cmd, (commandMap.get(cmd) ?? 0) + 1);
    }
    const topCommands = [...commandMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([command, count]) => ({ command, count }));

    // Top actions (from action_executed events)
    const actionMap = new Map<string, { count: number; success: number }>();
    for (const event of filtered.filter(e => e.type === "action_executed")) {
      const name = (event.data.action as string) || "(unknown)";
      const existing = actionMap.get(name) ?? { count: 0, success: 0 };
      existing.count++;
      if (event.data.success === true) existing.success++;
      actionMap.set(name, existing);
    }
    const topActions = [...actionMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([action, data]) => ({
        action,
        count: data.count,
        successRate: data.count > 0 ? data.success / data.count : 0,
      }));

    // Usage by hour
    const usageByHour = this.buildTimeSeries(filtered, 3_600_000);

    // Usage by day
    const usageByDay = this.buildTimeSeries(filtered, 86_400_000);

    // Device usage
    const deviceMap = new Map<string, number>();
    for (const event of filtered.filter(e => e.type === "message_sent" && e.deviceId)) {
      deviceMap.set(event.deviceId!, (deviceMap.get(event.deviceId!) ?? 0) + 1);
    }
    const deviceUsage = [...deviceMap.entries()]
      .map(([device, messageCount]) => ({ device, messageCount }))
      .sort((a, b) => b.messageCount - a.messageCount);

    // Average response time
    const responseTimes = filtered
      .filter(e => e.type === "action_executed" && typeof e.data.durationMs === "number")
      .map(e => e.data.durationMs as number);
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
      : 0;

    // Error rate
    const totalActions = actionsExecuted + actionsBlocked;
    const errorRate = totalActions > 0 ? actionsBlocked / totalActions : 0;

    // Session durations
    const durations = [...this.sessions.values()]
      .filter(s => s.endTime !== undefined)
      .map(s => (s.endTime ?? s.startTime) - s.startTime);
    const sessionDuration = {
      min: durations.length > 0 ? Math.min(...durations) : 0,
      max: durations.length > 0 ? Math.max(...durations) : 0,
      average: durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0,
    };

    return {
      period: { from, to: endTime },
      totalInteractions: filtered.length,
      messagesSent,
      actionsExecuted,
      actionsBlocked,
      macrosRun,
      topCommands,
      topActions,
      usageByHour,
      usageByDay,
      deviceUsage,
      averageResponseTime: Math.round(averageResponseTime),
      errorRate: Math.round(errorRate * 1000) / 1000,
      sessionDuration,
    };
  }

  /**
   * Get real-time statistics for the current session.
   */
  getRealtimeStats(): RealtimeStats {
    const sessionEvents = this.events.filter(
      e => e.sessionId === this.currentSessionId
    );

    const now = Date.now();
    const messagesThisSession = sessionEvents.filter(e => e.type === "message_sent").length;
    const actionsThisSession = sessionEvents.filter(e => e.type === "action_executed").length;
    const blockedThisSession = sessionEvents.filter(e => e.type === "action_blocked").length;

    // Active devices (connected minus disconnected in current session)
    const connected = new Set(sessionEvents.filter(e => e.type === "device_connected").map(e => e.deviceId));
    const disconnected = new Set(sessionEvents.filter(e => e.type === "device_disconnected").map(e => e.deviceId));
    const activeDevices = connected.size - disconnected.size;

    // Messages per minute (last 5 minutes)
    const fiveMinAgo = now - 300_000;
    const recentMessages = sessionEvents.filter(
      e => e.type === "message_sent" && e.timestamp >= fiveMinAgo
    ).length;
    const messagesPerMinute = recentMessages / 5;

    return {
      currentSessionId: this.currentSessionId,
      sessionStartTime: this.sessionStartTime,
      sessionDurationMs: now - this.sessionStartTime,
      messagesThisSession,
      actionsThisSession,
      blockedThisSession,
      activeDevices: Math.max(0, activeDevices),
      messagesPerMinute: Math.round(messagesPerMinute * 100) / 100,
    };
  }

  /**
   * Get the most used commands.
   */
  getTopCommands(limit: number = 10, from?: number, to?: number): Array<{ command: string; count: number }> {
    const report = this.generateReport(from ?? 0, to);
    return report.topCommands.slice(0, limit);
  }

  /**
   * Get the most executed actions.
   */
  getTopActions(limit: number = 10, from?: number, to?: number): Array<{ action: string; count: number; successRate: number }> {
    const report = this.generateReport(from ?? 0, to);
    return report.topActions.slice(0, limit);
  }

  /**
   * Get usage pattern data (hourly and daily breakdowns).
   */
  getUsagePattern(from?: number, to?: number): { byHour: TimeSeriesPoint[]; byDay: TimeSeriesPoint[] } {
    const report = this.generateReport(from ?? 0, to);
    return { byHour: report.usageByHour, byDay: report.usageByDay };
  }

  /**
   * Export analytics data in the specified format.
   */
  exportData(format: ExportFormat = "json"): string {
    if (format === "csv") {
      return this.exportCsv();
    }
    return JSON.stringify(this.events, null, 2);
  }

  /**
   * Compact old data: summarize events older than RETENTION_DAYS into aggregates.
   */
  async compact(): Promise<{ eventsCompacted: number; kept: number }> {
    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    const oldEvents = this.events.filter(e => e.timestamp < cutoff);
    const recentEvents = this.events.filter(e => e.timestamp >= cutoff);

    if (oldEvents.length === 0) {
      return { eventsCompacted: 0, kept: this.events.length };
    }

    // Generate summary of old data
    const summary = this.generateReport(Math.min(...oldEvents.map(e => e.timestamp)), cutoff);

    // Load existing compacted data
    let compacted: Array<{ period: { from: number; to: number }; summary: AnalyticsReport }> = [];
    try {
      const content = await fs.readFile(COMPACTED_PATH, "utf-8");
      compacted = JSON.parse(content);
    } catch { /* first compaction */ }

    // Add new compaction entry
    compacted.push({ period: summary.period, summary });

    // Save compacted data
    await fs.mkdir(path.dirname(COMPACTED_PATH), { recursive: true });
    await fs.writeFile(COMPACTED_PATH, JSON.stringify(compacted, null, 2), "utf-8");

    // Replace in-memory events with only recent ones
    this.events = recentEvents;

    // Rewrite the events file with only recent events
    await this.rewriteEventsFile();

    console.log(
      `[Analytics] Compacted ${oldEvents.length} old events, kept ${recentEvents.length} recent`
    );

    return { eventsCompacted: oldEvents.length, kept: recentEvents.length };
  }

  /**
   * Flush all pending events to disk and shut down.
   */
  async shutdown(): Promise<void> {
    this.recordEvent({
      type: "session_end",
      sessionId: this.currentSessionId,
      data: { durationMs: Date.now() - this.sessionStartTime },
    });

    this.stopFlushTimer();
    await this.flushToDisk();
    console.log("[Analytics] Shut down. Events flushed to disk.");
  }

  // ─── Data Loading ────────────────────────────────────────────────────────

  /**
   * Load existing events from the JSONL file.
   */
  private async loadData(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(EVENTS_PATH), { recursive: true });
      const content = await fs.readFile(EVENTS_PATH, "utf-8");
      const lines = content.trim().split("\n").filter(l => l.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as InteractionEvent;
          this.events.push(event);
          this.updateSessionState(event);
        } catch { /* skip malformed lines */ }
      }
    } catch { /* no events file yet */ }
  }

  // ─── Session Tracking ────────────────────────────────────────────────────

  /**
   * Update in-memory session state from an event.
   */
  private updateSessionState(event: InteractionEvent): void {
    const sid = event.sessionId;

    if (event.type === "session_start") {
      this.sessions.set(sid, {
        sessionId: sid,
        startTime: event.timestamp,
        userId: event.userId,
        deviceId: event.deviceId,
        messageCount: 0,
        actionCount: 0,
        blockedCount: 0,
      });
      return;
    }

    if (event.type === "session_end") {
      const session = this.sessions.get(sid);
      if (session) {
        session.endTime = event.timestamp;
      }
      return;
    }

    const session = this.sessions.get(sid);
    if (!session) return;

    switch (event.type) {
      case "message_sent":
        session.messageCount++;
        break;
      case "action_executed":
        session.actionCount++;
        break;
      case "action_blocked":
        session.blockedCount++;
        break;
    }
  }

  // ─── Time Series ─────────────────────────────────────────────────────────

  /**
   * Build a time series from events, bucketed by the given interval.
   */
  private buildTimeSeries(events: InteractionEvent[], intervalMs: number): TimeSeriesPoint[] {
    if (events.length === 0) return [];

    const minTs = Math.min(...events.map(e => e.timestamp));
    const maxTs = Math.max(...events.map(e => e.timestamp));
    const buckets = new Map<number, number>();

    for (const event of events) {
      const bucketStart = Math.floor((event.timestamp - minTs) / intervalMs) * intervalMs + minTs;
      buckets.set(bucketStart, (buckets.get(bucketStart) ?? 0) + 1);
    }

    return [...buckets.entries()]
      .map(([timestamp, value]) => ({ timestamp, value }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  /**
   * Append new events to the JSONL file.
   */
  private async flushToDisk(): Promise<void> {
    if (this.pendingWrite === 0) return;

    const toWrite = this.pendingWrite;
    const startIdx = this.events.length - toWrite;
    const lines = this.events
      .slice(startIdx)
      .map(e => JSON.stringify(e))
      .join("\n") + "\n";

    try {
      await fs.mkdir(path.dirname(EVENTS_PATH), { recursive: true });
      await fs.appendFile(EVENTS_PATH, lines, "utf-8");
      this.pendingWrite = 0;
    } catch (err) {
      console.error(`[Analytics] Flush failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Rewrite the entire events file (used after compaction).
   */
  private async rewriteEventsFile(): Promise<void> {
    try {
      const content = this.events.map(e => JSON.stringify(e)).join("\n") + "\n";
      await fs.writeFile(EVENTS_PATH, content, "utf-8");
    } catch (err) {
      console.error(`[Analytics] Rewrite failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ─── Timers ──────────────────────────────────────────────────────────────

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushToDisk().catch(() => {});
    }, FLUSH_INTERVAL_MS);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ─── CSV Export ───────────────────────────────────────────────────────────

  private exportCsv(): string {
    const headers = ["id", "type", "userId", "sessionId", "deviceId", "timestamp", "data"];
    const rows = this.events.map(e => [
      e.id,
      e.type,
      e.userId ?? "",
      e.sessionId,
      e.deviceId ?? "",
      e.timestamp,
      JSON.stringify(e.data).replace(/,/g, ";").replace(/\n/g, " "),
    ]);
    return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: AnalyticsEngine | null = null;

export function getAnalyticsEngine(): AnalyticsEngine {
  if (!_instance) {
    _instance = new AnalyticsEngine();
  }
  return _instance;
}
