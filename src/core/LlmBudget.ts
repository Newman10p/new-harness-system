// ─── LLM Budget Governor ──────────────────────────────────────────────────
// Prevents unbounded LLM spend from autonomous subsystems (ProactiveEngine,
// self-improvement, scheduled tasks, macros, agent loop).
//
// Usage:
//   const budget = new LlmBudget();
//   const check = budget.canCall("normal");
//   if (!check.allowed) { /* skip */ }
//   budget.recordCall("normal");

import fs from "node:fs";
import path from "node:path";

// ─── Types ─────────────────────────────────────────────────────────────────

export type CallPriority = "critical" | "normal" | "low";

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  /** ISO timestamp of when the budget will reset (daily) */
  resetsAt?: string;
  /** Current usage snapshot */
  usage?: {
    dailyTotal: number;
    dailyLimit: number;
    hourlyCurrent: number;
    hourlyLimit: number;
    priority: CallPriority;
  };
}

interface HourlyBucket {
  /** ISO hour string, e.g. "2025-01-15T14" */
  hour: string;
  calls: number;
}

interface BudgetState {
  /** ISO date string, e.g. "2025-01-15" */
  date: string;
  totalCalls: number;
  hourlyBuckets: HourlyBucket[];
  lastCallTime: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentHourKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}`;
}

function isHourStale(hour: string): boolean {
  // An hour key is stale if it's more than 24 hours in the past
  const bucketTime = new Date(hour + ":00:00.000Z").getTime();
  const cutoff = Date.now() - 25 * 60 * 60 * 1000; // 25h for safety margin
  return bucketTime < cutoff;
}

function midnightOfNextDay(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.toISOString();
}

// ─── LlmBudget ─────────────────────────────────────────────────────────────

export class LlmBudget {
  private dailyLimit: number;
  private hourlyLimit: number;
  private statePath: string;
  private state: BudgetState;

  constructor(opts?: { stateDir?: string; dailyLimit?: number; hourlyLimit?: number }) {
    this.dailyLimit = opts?.dailyLimit ?? parseInt(process.env.LLM_DAILY_BUDGET ?? "500", 10);
    this.hourlyLimit = opts?.hourlyLimit ?? parseInt(process.env.LLM_HOURLY_RATE ?? "60", 10);
    this.statePath = path.join(opts?.stateDir ?? path.join(process.cwd(), "state"), "llm-budget.json");
    this.state = this.loadState();
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  private loadState(): BudgetState {
    try {
      const raw = fs.readFileSync(this.statePath, "utf-8");
      const parsed = JSON.parse(raw) as BudgetState;
      // Validate minimal shape
      if (parsed.date && typeof parsed.totalCalls === "number" && Array.isArray(parsed.hourlyBuckets)) {
        return parsed;
      }
    } catch {
      // File missing, corrupt, or unreadable — start fresh
    }
    return this.freshState();
  }

  private freshState(): BudgetState {
    return {
      date: todayDate(),
      totalCalls: 0,
      hourlyBuckets: [],
      lastCallTime: null,
    };
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf-8");
    } catch (err) {
      console.error(`[LlmBudget] Failed to persist state: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ─── Maintenance ─────────────────────────────────────────────────────────

  /** Reset daily counter if the date has rolled over. */
  private maybeResetDaily(): void {
    const today = todayDate();
    if (this.state.date !== today) {
      // Reset daily counter but keep hourly buckets (they'll be pruned by age)
      const oldTotal = this.state.totalCalls;
      this.state.totalCalls = 0;
      this.state.date = today;
      console.log(`[LlmBudget] Daily budget reset (${oldTotal} calls yesterday).`);
      this.persist();
    }
  }

  /** Remove hourly buckets older than 24 hours. */
  private pruneHourlyBuckets(): void {
    const before = this.state.hourlyBuckets.length;
    this.state.hourlyBuckets = this.state.hourlyBuckets.filter((b) => !isHourStale(b.hour));
    if (this.state.hourlyBuckets.length !== before) {
      this.persist();
    }
  }

  // ─── Query ───────────────────────────────────────────────────────────────

  /** Get total calls in the current hour bucket. */
  private currentHourCalls(): number {
    const key = currentHourKey();
    const bucket = this.state.hourlyBuckets.find((b) => b.hour === key);
    return bucket?.calls ?? 0;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Check whether an LLM call is permitted at the given priority level.
   *
   * Priority rules:
   *  - `critical` (user-initiated loop): Always allowed, still counts against budget
   *  - `normal` (proactive, scheduled): Allowed if budget available
   *  - `low` (self-improvement, analytics): Only if under 80% of daily budget
   */
  canCall(priority: CallPriority): BudgetCheckResult {
    // Always run maintenance first
    this.maybeResetDaily();
    this.pruneHourlyBuckets();

    const dailyTotal = this.state.totalCalls;
    const hourlyTotal = this.currentHourCalls();

    // Build usage snapshot (included whether allowed or not)
    const usage = {
      dailyTotal,
      dailyLimit: this.dailyLimit,
      hourlyCurrent: hourlyTotal,
      hourlyLimit: this.hourlyLimit,
      priority,
    };

    // ── Critical priority: always allowed ──
    if (priority === "critical") {
      return { allowed: true, usage };
    }

    // ── Low priority: only if under 80% daily budget ──
    if (priority === "low") {
      const threshold = Math.floor(this.dailyLimit * 0.8);
      if (dailyTotal >= threshold) {
        return {
          allowed: false,
          reason: `Low-priority call blocked: daily usage ${dailyTotal}/${this.dailyLimit} exceeds 80% threshold (${threshold}). Budget resets at ${midnightOfNextDay()}.`,
          resetsAt: midnightOfNextDay(),
          usage,
        };
      }
    }

    // ── Normal + Low: check daily budget ──
    if (dailyTotal >= this.dailyLimit) {
      return {
        allowed: false,
        reason: `Daily budget exhausted: ${dailyTotal}/${this.dailyLimit} calls used. Budget resets at ${midnightOfNextDay()}.`,
        resetsAt: midnightOfNextDay(),
        usage,
      };
    }

    // ── Normal + Low: check hourly rate ──
    if (hourlyTotal >= this.hourlyLimit) {
      const now = new Date();
      const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
      return {
        allowed: false,
        reason: `Hourly rate limit reached: ${hourlyTotal}/${this.hourlyLimit} calls this hour. Limit resets at ${nextHour.toISOString()}.`,
        resetsAt: nextHour.toISOString(),
        usage,
      };
    }

    return { allowed: true, usage };
  }

  /**
   * Record that an LLM call was made. Call this *after* the actual LLM invocation.
   * The priority is recorded for analytics (the call was already approved by canCall).
   */
  recordCall(_priority: CallPriority = "normal"): void {
    this.maybeResetDaily();
    this.pruneHourlyBuckets();

    this.state.totalCalls += 1;
    this.state.lastCallTime = new Date().toISOString();

    // Upsert the current hour bucket
    const key = currentHourKey();
    let bucket = this.state.hourlyBuckets.find((b) => b.hour === key);
    if (!bucket) {
      bucket = { hour: key, calls: 0 };
      this.state.hourlyBuckets.push(bucket);
    }
    bucket.calls += 1;

    this.persist();
  }

  /** Return a snapshot of the current budget state for status displays. */
  getStatus(): {
    date: string;
    totalCalls: number;
    dailyLimit: number;
    hourlyLimit: number;
    currentHourCalls: number;
    lastCallTime: string | null;
    percentUsed: number;
  } {
    this.maybeResetDaily();
    this.pruneHourlyBuckets();

    return {
      date: this.state.date,
      totalCalls: this.state.totalCalls,
      dailyLimit: this.dailyLimit,
      hourlyLimit: this.hourlyLimit,
      currentHourCalls: this.currentHourCalls(),
      lastCallTime: this.state.lastCallTime,
      percentUsed: Math.round((this.state.totalCalls / this.dailyLimit) * 100),
    };
  }
}
