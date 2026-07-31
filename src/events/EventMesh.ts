// ─── M.A.I. Event Mesh ─────────────────────────────────────────────────────
// Core publish-subscribe event bus. Singleton — all modules use the same
// instance via `getEventMesh()`.
//
// Features:
//   - Glob-pattern subscriptions
//   - Priority/scope/source filtering
//   - TTL-based expiration
//   - Disk persistence for crash recovery
//   - Event replay from time ranges
//   - Dead letter queue for failed deliveries
//   - Rate limiting (1000 events/sec)
//   - Rolling-window metrics

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  MeshEvent,
  Subscription,
  DeadLetterEntry,
  EventStats,
  EventPriority,
  EventScope,
} from "./types.js";
import { PRIORITY_WEIGHT } from "./types.js";
import { PROJECT_ROOT } from "../core/constants.js";

// ─── Paths ──────────────────────────────────────────────────────────────────

const STATE_DIR = path.join(PROJECT_ROOT, "state");
const EVENTS_DIR = path.join(STATE_DIR, "events");
const PERSIST_PATH = path.join(EVENTS_DIR, "events.jsonl");
const DEAD_LETTER_PATH = path.join(EVENTS_DIR, "dead-letter.jsonl");
const SUBS_PATH = path.join(EVENTS_DIR, "subscriptions.json");

// ─── Configuration ──────────────────────────────────────────────────────────

interface EventMeshConfig {
  /** Max events published per second (default 1000) */
  maxRatePerSecond: number;
  /** Max events kept in the in-memory buffer (default 10 000) */
  maxBufferedEvents: number;
  /** Max delivery retries before dead-lettering (default 3) */
  maxRetries: number;
  /** Retry delay base in ms (exponential backoff, default 500) */
  retryBaseMs: number;
  /** Persistence flush interval in ms (default 5000) */
  flushIntervalMs: number;
  /** Max events in the dead letter queue (default 500) */
  maxDeadLetterSize: number;
  /** Max events persisted on disk (LIFO eviction, default 50 000) */
  maxPersistedEvents: number;
}

const DEFAULT_CONFIG: EventMeshConfig = {
  maxRatePerSecond: 1000,
  maxBufferedEvents: 10_000,
  maxRetries: 3,
  retryBaseMs: 500,
  flushIntervalMs: 5000,
  maxDeadLetterSize: 500,
  maxPersistedEvents: 50_000,
};

// ─── Rate Limiter ───────────────────────────────────────────────────────────

/** Sliding-window rate limiter */
class RateLimiter {
  private timestamps: number[] = [];
  private maxPerSecond: number;

  constructor(maxPerSecond: number) {
    this.maxPerSecond = maxPerSecond;
  }

  /** Returns true if the event should be allowed */
  allow(): boolean {
    const now = Date.now();
    const windowStart = now - 1000;
    // Prune old timestamps
    while (this.timestamps.length > 0 && this.timestamps[0] < windowStart) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= this.maxPerSecond) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }

  /** Get current rate (events in the last second) */
  getRate(): number {
    const now = Date.now();
    const windowStart = now - 1000;
    return this.timestamps.filter((t) => t >= windowStart).length;
  }
}

// ─── Rolling Metrics ────────────────────────────────────────────────────────

/** Tracks per-second rates over a rolling window */
class RollingCounter {
  private timestamps: number[] = [];
  private windowMs: number;

  constructor(windowMs: number = 60_000) {
    this.windowMs = windowMs;
  }

  record(): void {
    this.timestamps.push(Date.now());
  }

  getRate(): number {
    const cutoff = Date.now() - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
    return this.windowMs > 0
      ? this.timestamps.length / (this.windowMs / 1000)
      : 0;
  }

  reset(): void {
    this.timestamps = [];
  }
}

// ─── EventMesh Implementation ───────────────────────────────────────────────

export class EventMesh {
  private config: EventMeshConfig;
  private subscriptions: Map<string, Subscription> = new Map();
  private eventBuffer: MeshEvent[] = [];
  private deadLetterQueue: DeadLetterEntry[] = [];
  private pendingDelivery: Array<{
    event: MeshEvent;
    subscription: Subscription;
    attempts: number;
    nextRetry: number;
  }> = [];

  // Metrics
  private totalPublished = 0;
  private totalDelivered = 0;
  private totalExpired = 0;
  private totalDropped = 0;
  private totalDeadLettered = 0;
  private byType: Record<string, number> = {};
  private bySource: Record<string, number> = {};
  private publishCounter = new RollingCounter();
  private deliveryCounter = new RollingCounter();
  private rateLimiter: RateLimiter;

  // Persistence
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private persistBuffer: MeshEvent[] = [];
  private shutdownFlag = false;
  private initialized = false;

  constructor(config?: Partial<EventMeshConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rateLimiter = new RateLimiter(this.config.maxRatePerSecond);
  }

  // ─── Initialization / Shutdown ──────────────────────────────────────────

  /**
   * Initialize the event mesh: ensure directories exist, load persisted
   * events into the buffer, start the flush timer, and begin delivery loop.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(EVENTS_DIR, { recursive: true });
    await this.loadPersistedEvents();
    await this.loadSubscriptions();
    await this.loadDeadLetterQueue();

    // Start periodic flush
    this.flushTimer = setInterval(
      () => this.flushPersistBuffer(),
      this.config.flushIntervalMs
    );
    if (this.flushTimer.unref) this.flushTimer.unref();

    // Start delivery retry loop
    this.startDeliveryLoop();

    this.initialized = true;
  }

  /**
   * Graceful shutdown: flush pending events, stop timers.
   */
  async shutdown(): Promise<void> {
    this.shutdownFlag = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flushPersistBuffer();
    await this.persistSubscriptions();
    await this.persistDeadLetterQueue();
  }

  // ─── Publish ────────────────────────────────────────────────────────────

  /**
   * Publish an event to the mesh.
   * Returns the event ID, or undefined if rate-limited.
   */
  publish(event: MeshEvent): string | undefined {
    if (this.shutdownFlag) return undefined;

    // Rate limiting
    if (!this.rateLimiter.allow()) {
      this.totalDropped++;
      return undefined;
    }

    // Stamp the event with an ID and timestamp if not set
    const stampedEvent: MeshEvent = {
      ...event,
      id: event.id || crypto.randomUUID(),
      timestamp: event.timestamp || Date.now(),
    };

    // Update metrics
    this.totalPublished++;
    this.publishCounter.record();
    this.byType[stampedEvent.type] = (this.byType[stampedEvent.type] || 0) + 1;
    this.bySource[stampedEvent.source] = (this.bySource[stampedEvent.source] || 0) + 1;

    // Buffer the event (for replay)
    this.eventBuffer.push(stampedEvent);
    if (this.eventBuffer.length > this.config.maxBufferedEvents) {
      this.eventBuffer.shift();
    }

    // Queue for persistence
    this.persistBuffer.push(stampedEvent);

    // Deliver to matching subscriptions
    this.deliverToSubscribers(stampedEvent);

    return stampedEvent.id;
  }

  /**
   * Convenience: publish with minimal params.
   */
  publishSimple(
    type: string,
    source: string,
    payload: Record<string, unknown>,
    priority: EventPriority = "normal",
    scope: EventScope = "local"
  ): string | undefined {
    return this.publish({
      id: "",
      type,
      source,
      priority,
      scope,
      payload,
      timestamp: Date.now(),
    });
  }

  // ─── Subscribe ──────────────────────────────────────────────────────────

  /**
   * Subscribe to events matching a glob pattern.
   * Returns the subscription ID.
   */
  subscribe(
    pattern: string,
    handler: (event: MeshEvent) => Promise<void>,
    filter?: Subscription["filter"]
  ): string {
    const id = crypto.randomUUID();
    const subscription: Subscription = {
      id,
      pattern,
      handler,
      filter,
      active: true,
      createdAt: Date.now(),
    };
    this.subscriptions.set(id, subscription);
    this.persistSubscriptions().catch(() => {});
    return id;
  }

  /**
   * Remove a subscription by ID.
   * Returns true if the subscription existed and was removed.
   */
  unsubscribe(subscriptionId: string): boolean {
    const removed = this.subscriptions.delete(subscriptionId);
    if (removed) {
      // Remove any pending deliveries for this subscription
      this.pendingDelivery = this.pendingDelivery.filter(
        (p) => p.subscription.id !== subscriptionId
      );
      this.persistSubscriptions().catch(() => {});
    }
    return removed;
  }

  /**
   * Pause a subscription without removing it.
   */
  pauseSubscription(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;
    sub.active = false;
    return true;
  }

  /**
   * Resume a paused subscription.
   */
  resumeSubscription(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;
    sub.active = true;
    return true;
  }

  // ─── Replay ─────────────────────────────────────────────────────────────

  /**
   * Replay historical events matching an optional pattern from a time range.
   * Events are delivered to currently active subscriptions.
   */
  async replay(
    from: number,
    to: number,
    pattern?: string
  ): Promise<number> {
    let events = this.eventBuffer.filter(
      (e) => e.timestamp >= from && e.timestamp <= to
    );

    if (pattern) {
      events = events.filter((e) => this.matchPattern(e.type, pattern));
    }

    // Sort by timestamp ascending
    events.sort((a, b) => a.timestamp - b.timestamp);

    let count = 0;
    for (const event of events) {
      this.deliverToSubscribers(event, true);
      count++;
    }

    return count;
  }

  // ─── Stats ──────────────────────────────────────────────────────────────

  /**
   * Get current event mesh statistics.
   */
  getStats(): EventStats {
    const activeSubs = Array.from(this.subscriptions.values()).filter(
      (s) => s.active
    ).length;

    return {
      totalPublished: this.totalPublished,
      totalDelivered: this.totalDelivered,
      totalExpired: this.totalExpired,
      totalDropped: this.totalDropped,
      totalDeadLettered: this.totalDeadLettered,
      activeSubscriptions: activeSubs,
      pendingEvents: this.pendingDelivery.length,
      deadLetterCount: this.deadLetterQueue.length,
      publishRate: Math.round(this.publishCounter.getRate() * 100) / 100,
      deliveryRate: Math.round(this.deliveryCounter.getRate() * 100) / 100,
      byType: { ...this.byType },
      bySource: { ...this.bySource },
    };
  }

  // ─── Flush / Clear ──────────────────────────────────────────────────────

  /**
   * Clear all buffered events and reset metrics.
   * Does NOT remove subscriptions.
   */
  async flush(): Promise<void> {
    this.eventBuffer = [];
    this.persistBuffer = [];
    this.pendingDelivery = [];
    this.deadLetterQueue = [];
    this.totalPublished = 0;
    this.totalDelivered = 0;
    this.totalExpired = 0;
    this.totalDropped = 0;
    this.totalDeadLettered = 0;
    this.byType = {};
    this.bySource = {};
    this.publishCounter.reset();
    this.deliveryCounter.reset();

    // Clear persisted files
    try {
      await fs.unlink(PERSIST_PATH).catch(() => {});
      await fs.unlink(DEAD_LETTER_PATH).catch(() => {});
    } catch {
      // Ignore
    }
  }

  /**
   * Get the dead letter queue contents (read-only copy).
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Retry all events in the dead letter queue.
   */
  async retryDeadLetter(): Promise<number> {
    const entries = [...this.deadLetterQueue];
    this.deadLetterQueue = [];

    let retried = 0;
    for (const entry of entries) {
      // Reset attempts so it gets fresh retries
      this.pendingDelivery.push({
        event: entry.event,
        subscription: {
          id: entry.subscriptionId,
          pattern: "*",
          handler: async () => {}, // No-op — won't actually match
          active: true,
          createdAt: entry.deadAt,
        },
        attempts: 0,
        nextRetry: Date.now(),
      });
      retried++;
    }

    await this.persistDeadLetterQueue();
    return retried;
  }

  // ─── Private: Pattern Matching ──────────────────────────────────────────

  /**
   * Simple glob matching for event types.
   * Supports: "*" (single segment), "**" (any depth), "?" (single char).
   * Examples:
   *   "device.*"     matches "device.connected" but not "device.sub.type"
   *   "device.**"    matches any event under "device."
   *   "*"            matches any single-segment type
   *   "**"           matches everything
   */
  private matchPattern(eventType: string, pattern: string): boolean {
    if (pattern === "**") return true;

    // Convert glob to regex
    const segments = pattern.split(".");
    const eventSegments = eventType.split(".");

    return this.matchSegments(eventSegments, 0, segments, 0);
  }

  private matchSegments(
    eventSegs: string[],
    ei: number,
    patSegs: string[],
    pi: number
  ): boolean {
    // Both exhausted
    if (ei === eventSegs.length && pi === patSegs.length) return true;
    // Pattern exhausted but event remains
    if (pi === patSegs.length) return false;
    // Double-star: match zero or more segments
    if (patSegs[pi] === "**") {
      // Try matching 0..N event segments
      for (let skip = ei; skip <= eventSegs.length; skip++) {
        if (this.matchSegments(eventSegs, skip, patSegs, pi + 1)) return true;
      }
      return false;
    }
    // Event exhausted but pattern remains
    if (ei === eventSegs.length) return false;
    // Single-star or literal match
    const seg = patSegs[pi];
    if (seg === "*" || seg === eventSegs[ei]) {
      return this.matchSegments(eventSegs, ei + 1, patSegs, pi + 1);
    }
    return false;
  }

  // ─── Private: Delivery ──────────────────────────────────────────────────

  /**
   * Deliver an event to all matching, active subscriptions.
   */
  private deliverToSubscribers(event: MeshEvent, isReplay = false): void {
    // Check TTL
    if (event.ttl && event.ttl > 0) {
      const age = Date.now() - event.timestamp;
      if (age > event.ttl) {
        this.totalExpired++;
        return;
      }
    }

    for (const sub of Array.from(this.subscriptions.values())) {
      if (!sub.active) continue;
      if (isReplay && !sub.active) continue;

      // Pattern match
      if (!this.matchPattern(event.type, sub.pattern)) continue;

      // Filter match
      if (sub.filter) {
        if (
          sub.filter.priority?.length &&
          !sub.filter.priority.includes(event.priority)
        )
          continue;
        if (
          sub.filter.scope?.length &&
          !sub.filter.scope.includes(event.scope)
        )
          continue;
        if (
          sub.filter.source?.length &&
          !sub.filter.source.includes(event.source)
        )
          continue;
      }

      // Queue for async delivery
      this.pendingDelivery.push({
        event,
        subscription: sub,
        attempts: 0,
        nextRetry: Date.now(),
      });
    }
  }

  /**
   * Process the pending delivery queue with retries and backoff.
   */
  private async processDeliveryQueue(): Promise<void> {
    const now = Date.now();
    const ready = this.pendingDelivery.filter((p) => p.nextRetry <= now);
    const stillPending: typeof this.pendingDelivery = [];

    for (const item of ready) {
      try {
        await item.subscription.handler(item.event);
        this.totalDelivered++;
        this.deliveryCounter.record();
      } catch (err) {
        item.attempts++;
        if (item.attempts >= this.config.maxRetries) {
          // Dead letter
          this.moveToDeadLetter(item);
          this.totalDeadLettered++;
        } else {
          // Exponential backoff
          item.nextRetry =
            now + this.config.retryBaseMs * Math.pow(2, item.attempts);
          stillPending.push(item);
        }
      }
    }

    // Keep items that weren't ready
    for (const item of this.pendingDelivery) {
      if (item.nextRetry > now) {
        stillPending.push(item);
      }
    }

    this.pendingDelivery = stillPending;
  }

  private moveToDeadLetter(item: {
    event: MeshEvent;
    subscription: Subscription;
    attempts: number;
  }): void {
    const entry: DeadLetterEntry = {
      event: item.event,
      subscriptionId: item.subscription.id,
      error: `Failed after ${item.attempts} attempts`,
      attempts: item.attempts,
      deadAt: Date.now(),
    };

    this.deadLetterQueue.push(entry);
    if (this.deadLetterQueue.length > this.config.maxDeadLetterSize) {
      this.deadLetterQueue.shift();
    }

    this.persistDeadLetterQueue().catch(() => {});
  }

  private startDeliveryLoop(): void {
    const loop = async () => {
      if (this.shutdownFlag) return;
      try {
        await this.processDeliveryQueue();
      } catch {
        // Delivery loop errors are non-fatal
      }
      setTimeout(loop, 100); // Process every 100ms
    };
    loop();
  }

  // ─── Private: Persistence ───────────────────────────────────────────────

  /**
   * Flush the persist buffer to disk.
   */
  private async flushPersistBuffer(): Promise<void> {
    if (this.persistBuffer.length === 0) return;

    const toWrite = [...this.persistBuffer];
    this.persistBuffer = [];

    try {
      const lines = toWrite.map((e) => JSON.stringify(e)).join("\n") + "\n";
      await fs.appendFile(PERSIST_PATH, lines, "utf-8");

      // Trim file if too large (keep last N lines)
      await this.trimPersistFile();
    } catch {
      // Put events back if flush fails
      this.persistBuffer.unshift(...toWrite);
    }
  }

  private async trimPersistFile(): Promise<void> {
    try {
      const content = await fs.readFile(PERSIST_PATH, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      if (lines.length <= this.config.maxPersistedEvents) return;

      const trimmed = lines.slice(-this.config.maxPersistedEvents);
      await fs.writeFile(PERSIST_PATH, trimmed.join("\n") + "\n", "utf-8");
    } catch {
      // Ignore trim failures
    }
  }

  private async loadPersistedEvents(): Promise<void> {
    try {
      const content = await fs.readFile(PERSIST_PATH, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as MeshEvent;
          this.eventBuffer.push(event);
        } catch {
          // Skip malformed lines
        }
      }

      // Trim buffer if over limit
      if (this.eventBuffer.length > this.config.maxBufferedEvents) {
        this.eventBuffer = this.eventBuffer.slice(-this.config.maxBufferedEvents);
      }
    } catch {
      // No persisted events yet
    }
  }

  private async loadSubscriptions(): Promise<void> {
    try {
      const content = await fs.readFile(SUBS_PATH, "utf-8");
      // Note: handlers can't be serialized, so we load metadata only
      // and mark them as inactive — they need to be re-registered
      const data = JSON.parse(content) as Array<{
        id: string;
        pattern: string;
        active: boolean;
        createdAt: number;
        filter?: Subscription["filter"];
      }>;

      for (const entry of data) {
        this.subscriptions.set(entry.id, {
          ...entry,
          handler: async () => {}, // No-op placeholder
          active: false, // Must be re-registered
        });
      }
    } catch {
      // No subscriptions persisted yet
    }
  }

  private async persistSubscriptions(): Promise<void> {
    try {
      const data = Array.from(this.subscriptions.values()).map((s) => ({
        id: s.id,
        pattern: s.pattern,
        active: s.active,
        createdAt: s.createdAt,
        filter: s.filter,
      }));
      await fs.writeFile(SUBS_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // Persistence failure is non-fatal
    }
  }

  private async loadDeadLetterQueue(): Promise<void> {
    try {
      const content = await fs.readFile(DEAD_LETTER_PATH, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as DeadLetterEntry;
          this.deadLetterQueue.push(entry);
        } catch {
          // Skip malformed
        }
      }
    } catch {
      // No dead letter queue yet
    }
  }

  private async persistDeadLetterQueue(): Promise<void> {
    try {
      const lines = this.deadLetterQueue
        .map((e) => JSON.stringify(e))
        .join("\n");
      await fs.writeFile(
        DEAD_LETTER_PATH,
        lines ? lines + "\n" : "",
        "utf-8"
      );
    } catch {
      // Persistence failure is non-fatal
    }
  }
}

// ─── Singleton Accessor ─────────────────────────────────────────────────────

let _instance: EventMesh | null = null;

/**
 * Get the singleton EventMesh instance.
 * Call `initialize()` on the returned instance before use.
 */
export function getEventMesh(config?: Partial<EventMeshConfig>): EventMesh {
  if (!_instance) {
    _instance = new EventMesh(config);
  }
  return _instance;
}
