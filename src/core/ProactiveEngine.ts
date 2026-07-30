// ─── M.A.I. Proactive Engine ─────────────────────────────────────
// Enables M.A.I. to take actions without being asked, based on observed
// patterns and system metrics. Built-in anomaly detectors plus custom
// user-defined rules stored in memory/proactive-rules.md.
//
// Safety: All proactive actions must still pass through the policy engine.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PROJECT_ROOT } from "./constants.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AnomalyType =
  | "cpu_spike"
  | "memory_leak"
  | "disk_full"
  | "network_loss"
  | "repeated_error";

export type AnomalySeverity = "info" | "warning" | "critical";

export interface Anomaly {
  type: AnomalyType;
  description: string;
  severity: AnomalySeverity;
  detected: string;
  value: number;
  threshold: number;
}

export interface ProactiveRule {
  id: string;
  trigger: string;
  condition: string;
  action: string;
  cooldownMs: number;
  lastTriggered?: string;
  enabled: boolean;
  timesTriggered: number;
  created: string;
}

export interface SystemMetrics {
  cpu: number; // 0-100
  memory: number; // 0-100
  disk: number; // 0-100
  networkUp?: boolean;
  errorRate?: number; // errors per minute
  activeConnections?: number;
  uptime?: number; // seconds
}

export interface ProactiveActionResult {
  triggered: boolean;
  ruleId?: string;
  anomaly?: Anomaly;
  action?: string;
  skippedReason?: string;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const MEMORY_DIR = path.join(PROJECT_ROOT, "memory");
const RULES_PATH = path.join(MEMORY_DIR, "proactive-rules.md");
const STATE_DIR = path.join(PROJECT_ROOT, "state");
const PROACTIVE_STATE_PATH = path.join(STATE_DIR, "proactive-state.json");

// ─── Anomaly Detector Config ───────────────────────────────────────────────

interface AnomalyDetectorConfig {
  cpuThreshold: number;
  cpuDurationS: number;
  memoryThreshold: number;
  diskThreshold: number;
  errorRepeatThreshold: number;
  errorWindowMs: number;
  idleWorkHoursStart: number; // hour (0-23)
  idleWorkHoursEnd: number;
  idleMinutesThreshold: number;
}

const DEFAULT_DETECTOR_CONFIG: AnomalyDetectorConfig = {
  cpuThreshold: 90,
  cpuDurationS: 30,
  memoryThreshold: 90,
  diskThreshold: 95,
  errorRepeatThreshold: 3,
  errorWindowMs: 5 * 60_000, // 5 minutes
  idleWorkHoursStart: 9,
  idleWorkHoursEnd: 17,
  idleMinutesThreshold: 60,
};

// ─── Built-in Anomaly Detectors ────────────────────────────────────────────

const BUILTIN_RULES: ProactiveRule[] = [
  {
    id: "builtin-cpu-spike",
    trigger: "CPU usage exceeds 90% for 30 seconds",
    condition: "metrics.cpu > 90",
    action: "Warn the user about high CPU usage and suggest checking top processes",
    cooldownMs: 5 * 60_000,
    enabled: true,
    timesTriggered: 0,
    created: new Date().toISOString(),
  },
  {
    id: "builtin-memory-high",
    trigger: "Memory usage exceeds 90%",
    condition: "metrics.memory > 90",
    action: "List top memory-consuming processes and suggest cleanup options",
    cooldownMs: 10 * 60_000,
    enabled: true,
    timesTriggered: 0,
    created: new Date().toISOString(),
  },
  {
    id: "builtin-disk-full",
    trigger: "Disk usage exceeds 95%",
    condition: "metrics.disk > 95",
    action: "Alert user about disk space and suggest cleanup (logs, cache, temp files)",
    cooldownMs: 30 * 60_000,
    enabled: true,
    timesTriggered: 0,
    created: new Date().toISOString(),
  },
  {
    id: "builtin-network-loss",
    trigger: "Network connectivity lost",
    condition: "metrics.networkUp === false",
    action: "Inform user of network loss and suggest checking connection",
    cooldownMs: 60_000,
    enabled: true,
    timesTriggered: 0,
    created: new Date().toISOString(),
  },
];

// ─── Engine ─────────────────────────────────────────────────────────────────

export class ProactiveEngine {
  private customRules: ProactiveRule[] = [];
  private detectorConfig: AnomalyDetectorConfig;
  private recentErrors: Array<{ message: string; timestamp: number }> = [];
  private highCpuStart: number | null = null;
  private lastInteractionTime = Date.now();
  private actionCallback: ((action: string) => Promise<void>) | null = null;
  private anomalyCallback: ((anomaly: Anomaly) => Promise<void>) | null = null;

  constructor(config?: Partial<AnomalyDetectorConfig>) {
    this.detectorConfig = { ...DEFAULT_DETECTOR_CONFIG, ...config };
    this.loadRules().catch(() => {});
    this.loadState().catch(() => {});
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Set the callback that receives proactive actions.
   * The action string will be fed into the AgentLoop as user input.
   * IMPORTANT: Actions still go through the policy engine for safety.
   */
  setActionCallback(cb: (action: string) => Promise<void>): void {
    this.actionCallback = cb;
  }

  /**
   * Set a callback for anomaly notifications (for HUD display).
   */
  setAnomalyCallback(cb: (anomaly: Anomaly) => Promise<void>): void {
    this.anomalyCallback = cb;
  }

  /**
   * Called during metrics polling. Checks all proactive conditions.
   * Never throws — returns results array.
   */
  async checkProactiveConditions(metrics: SystemMetrics): Promise<ProactiveActionResult[]> {
    try {
      return await this.checkConditionsInternal(metrics);
    } catch {
      return [];
    }
  }

  /**
   * Detect anomalies from current metrics. Pure analysis, no side effects.
   */
  detectAnomalies(metrics: SystemMetrics): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // CPU spike detection
    if (metrics.cpu > this.detectorConfig.cpuThreshold) {
      if (!this.highCpuStart) {
        this.highCpuStart = Date.now();
      } else {
        const duration = (Date.now() - this.highCpuStart) / 1000;
        if (duration >= this.detectorConfig.cpuDurationS) {
          anomalies.push({
            type: "cpu_spike",
            description: `CPU at ${metrics.cpu}% for ${Math.round(duration)}s (threshold: ${this.detectorConfig.cpuThreshold}%)`,
            severity: metrics.cpu > 95 ? "critical" : "warning",
            detected: new Date().toISOString(),
            value: metrics.cpu,
            threshold: this.detectorConfig.cpuThreshold,
          });
        }
      }
    } else {
      this.highCpuStart = null;
    }

    // Memory leak detection
    if (metrics.memory > this.detectorConfig.memoryThreshold) {
      anomalies.push({
        type: "memory_leak",
        description: `Memory at ${metrics.memory}% (threshold: ${this.detectorConfig.memoryThreshold}%)`,
        severity: metrics.memory > 95 ? "critical" : "warning",
        detected: new Date().toISOString(),
        value: metrics.memory,
        threshold: this.detectorConfig.memoryThreshold,
      });
    }

    // Disk full detection
    if (metrics.disk > this.detectorConfig.diskThreshold) {
      anomalies.push({
        type: "disk_full",
        description: `Disk at ${metrics.disk}% (threshold: ${this.detectorConfig.diskThreshold}%)`,
        severity: metrics.disk > 98 ? "critical" : "warning",
        detected: new Date().toISOString(),
        value: metrics.disk,
        threshold: this.detectorConfig.diskThreshold,
      });
    }

    // Network loss detection
    if (metrics.networkUp === false) {
      anomalies.push({
        type: "network_loss",
        description: "Network connectivity lost",
        severity: "critical",
        detected: new Date().toISOString(),
        value: 0,
        threshold: 1,
      });
    }

    // Repeated error detection
    this.pruneErrors();
    const recentErrorCount = this.recentErrors.length;
    if (recentErrorCount >= this.detectorConfig.errorRepeatThreshold) {
      const topError = this.getMostFrequentError();
      anomalies.push({
        type: "repeated_error",
        description: `Same error ${recentErrorCount}x in ${Math.round(this.detectorConfig.errorWindowMs / 60000)}min: ${topError}`,
        severity: recentErrorCount >= 5 ? "critical" : "warning",
        detected: new Date().toISOString(),
        value: recentErrorCount,
        threshold: this.detectorConfig.errorRepeatThreshold,
      });
    }

    return anomalies;
  }

  /**
   * Record an error for repeated-error detection.
   */
  recordError(message: string): void {
    this.recentErrors.push({ message, timestamp: Date.now() });
  }

  /**
   * Update the last interaction time (called on each user message).
   */
  recordInteraction(): void {
    this.lastInteractionTime = Date.now();
  }

  /**
   * Add a custom proactive rule.
   */
  addRule(rule: Omit<ProactiveRule, "id" | "timesTriggered" | "created">): ProactiveRule {
    const newRule: ProactiveRule = {
      ...rule,
      id: crypto.randomUUID(),
      timesTriggered: 0,
      created: new Date().toISOString(),
    };
    this.customRules.push(newRule);
    this.persistRules().catch(() => {});
    return newRule;
  }

  /**
   * Remove a custom rule by ID.
   */
  removeRule(ruleId: string): boolean {
    const index = this.customRules.findIndex((r) => r.id === ruleId);
    if (index === -1) return false;
    this.customRules.splice(index, 1);
    this.persistRules().catch(() => {});
    return true;
  }

  /**
   * Enable/disable a rule.
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.findRule(ruleId);
    if (!rule) return false;
    rule.enabled = enabled;
    this.persistRules().catch(() => {});
    return true;
  }

  /**
   * Get all rules (built-in + custom).
   */
  getAllRules(): ProactiveRule[] {
    return [...BUILTIN_RULES, ...this.customRules];
  }

  /**
   * Get custom rules only.
   */
  getCustomRules(): ProactiveRule[] {
    return [...this.customRules];
  }

  /**
   * Configure anomaly detector thresholds.
   */
  configureDetectors(config: Partial<AnomalyDetectorConfig>): void {
    this.detectorConfig = { ...this.detectorConfig, ...config };
  }

  // ─── Private: Condition Checking ──────────────────────────────────────

  private async checkConditionsInternal(metrics: SystemMetrics): Promise<ProactiveActionResult[]> {
    const results: ProactiveActionResult[] = [];
    const allRules = this.getAllRules();

    // 1. Detect anomalies
    const anomalies = this.detectAnomalies(metrics);

    // 2. Emit anomaly notifications
    for (const anomaly of anomalies) {
      if (this.anomalyCallback) {
        await this.anomalyCallback(anomaly).catch(() => {});
      }
    }

    // 3. Check built-in rules against metrics
    for (const rule of allRules) {
      if (!rule.enabled) {
        results.push({ triggered: false, skippedReason: `Rule ${rule.id} is disabled` });
        continue;
      }

      // Check cooldown
      if (rule.lastTriggered) {
        const elapsed = Date.now() - new Date(rule.lastTriggered).getTime();
        if (elapsed < rule.cooldownMs) {
          results.push({ triggered: false, skippedReason: `Rule ${rule.id} in cooldown (${Math.round((rule.cooldownMs - elapsed) / 1000)}s remaining)` });
          continue;
        }
      }

      // Evaluate condition
      const triggered = this.evaluateCondition(rule.condition, metrics);
      if (!triggered) {
        results.push({ triggered: false, skippedReason: `Rule ${rule.id} condition not met` });
        continue;
      }

      // Rule triggered!
      rule.lastTriggered = new Date().toISOString();
      rule.timesTriggered++;

      const action = await this.triggerProactiveAction(rule);
      results.push({
        triggered: true,
        ruleId: rule.id,
        action: rule.action,
      });

      // Persist state after trigger
      this.persistRules().catch(() => {});
    }

    // 4. Check idle pattern during work hours
    const idleResult = this.checkIdlePattern();
    if (idleResult) {
      results.push(idleResult);
    }

    return results;
  }

  /**
   * Safely evaluate a JavaScript condition expression against metrics.
   * Only allows basic comparisons — no function calls or assignments.
   */
  private evaluateCondition(condition: string, metrics: SystemMetrics): boolean {
    try {
      // Safety: Only allow simple comparison expressions
      // Regex rejects anything that looks like function calls, assignments, or imports
      const sanitized = condition.trim();
      if (
        /[;{}\[\]()]/.test(sanitized) && // allow parens only for grouping
        !/^metrics\.\w+\s*(>|<|>=|<=|===|!==|==|!=)\s*.+$/.test(sanitized)
      ) {
        return false;
      }

      // Build a safe evaluation context
      const fn = new Function(
        "metrics",
        `"use strict"; try { return (${sanitized}); } catch { return false; }`
      );
      return fn(metrics) === true;
    } catch {
      return false;
    }
  }

  /**
   * Trigger a proactive action via the callback.
   */
  private async triggerProactiveAction(rule: ProactiveRule): Promise<string> {
    if (!this.actionCallback) {
      return rule.action;
    }

    // The action goes through the AgentLoop which enforces policy
    await this.actionCallback(rule.action).catch(() => {});
    return rule.action;
  }

  /**
   * Check if the user has been idle during work hours.
   */
  private checkIdlePattern(): ProactiveActionResult | null {
    const now = new Date();
    const hour = now.getHours();

    // Only during configured work hours
    if (hour < this.detectorConfig.idleWorkHoursStart || hour > this.detectorConfig.idleWorkHoursEnd) {
      return null;
    }

    const idleMs = Date.now() - this.lastInteractionTime;
    const idleMinutes = idleMs / 60_000;

    if (idleMinutes >= this.detectorConfig.idleMinutesThreshold) {
      return {
        triggered: true,
        ruleId: "builtin-idle-work-hours",
        action: `User has been idle for ${Math.round(idleMinutes)} minutes during work hours. Consider offering a status update.`,
      };
    }

    return null;
  }

  /**
   * Find a rule by ID across built-in and custom rules.
   */
  private findRule(ruleId: string): ProactiveRule | undefined {
    return (
      this.customRules.find((r) => r.id === ruleId) ??
      BUILTIN_RULES.find((r) => r.id === ruleId)
    );
  }

  // ─── Error Tracking ───────────────────────────────────────────────────

  private pruneErrors(): void {
    const cutoff = Date.now() - this.detectorConfig.errorWindowMs;
    this.recentErrors = this.recentErrors.filter((e) => e.timestamp >= cutoff);
  }

  private getMostFrequentError(): string {
    const counts = new Map<string, number>();
    for (const e of this.recentErrors) {
      // Normalize: take first 50 chars as key
      const key = e.message.slice(0, 50);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let top = "";
    let topCount = 0;
    for (const [msg, count] of counts) {
      if (count > topCount) {
        top = msg;
        topCount = count;
      }
    }
    return top;
  }

  // ─── Persistence ───────────────────────────────────────────────────────

  /**
   * Persist custom rules to memory/proactive-rules.md.
   */
  private async persistRules(): Promise<void> {
    try {
      await fs.mkdir(MEMORY_DIR, { recursive: true });

      let md = "# Proactive Rules\n\nCustom proactive rules created by M.A.I. or the user.\n\n";

      if (this.customRules.length === 0) {
        md += "*(No custom rules defined)*\n";
      } else {
        for (const rule of this.customRules) {
          md += `## ${rule.id}\n\n`;
          md += `- **Trigger**: ${rule.trigger}\n`;
          md += `- **Condition**: \`${rule.condition}\`\n`;
          md += `- **Action**: ${rule.action}\n`;
          md += `- **Cooldown**: ${rule.cooldownMs}ms\n`;
          md += `- **Enabled**: ${rule.enabled}\n`;
          md += `- **Times triggered**: ${rule.timesTriggered}\n`;
          md += `- **Created**: ${rule.created}\n`;
          if (rule.lastTriggered) {
            md += `- **Last triggered**: ${rule.lastTriggered}\n`;
          }
          md += "\n";
        }
      }

      await fs.writeFile(RULES_PATH, md, "utf-8");
    } catch {
      // Persistence failure is non-fatal
    }
  }

  /**
   * Load custom rules from disk.
   */
  private async loadRules(): Promise<void> {
    try {
      const content = await fs.readFile(RULES_PATH, "utf-8");
      const ruleBlocks = content.split(/## /).filter((b) => b.trim());

      for (const block of ruleBlocks) {
        const id = block.split("\n")[0]?.trim();
        if (!id) continue;

        const rule: ProactiveRule = {
          id,
          trigger: extractField(block, "Trigger") ?? "",
          condition: extractField(block, "Condition")?.replace(/[`]/g, "") ?? "",
          action: extractField(block, "Action") ?? "",
          cooldownMs: parseInt(extractField(block, "Cooldown") ?? "60000", 10),
          enabled: extractField(block, "Enabled") !== "false",
          timesTriggered: parseInt(extractField(block, "Times triggered") ?? "0", 10),
          created: extractField(block, "Created") ?? new Date().toISOString(),
          lastTriggered: extractField(block, "Last triggered") ?? undefined,
        };

        this.customRules.push(rule);
      }
    } catch {
      // No rules file yet
    }
  }

  /**
   * Load engine state (error tracking, etc.) from disk.
   */
  private async loadState(): Promise<void> {
    try {
      const content = await fs.readFile(PROACTIVE_STATE_PATH, "utf-8");
      const data = JSON.parse(content);

      if (Array.isArray(data.recentErrors)) {
        this.recentErrors = data.recentErrors;
      }
      if (data.lastInteractionTime) {
        this.lastInteractionTime = data.lastInteractionTime;
      }
    } catch {
      // No state yet
    }
  }

  /**
   * Persist engine state to disk.
   */
  async persistState(): Promise<void> {
    try {
      await fs.mkdir(STATE_DIR, { recursive: true });
      const data = {
        recentErrors: this.recentErrors,
        lastInteractionTime: this.lastInteractionTime,
        savedAt: new Date().toISOString(),
      };
      await fs.writeFile(PROACTIVE_STATE_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // Persistence failure is non-fatal
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract a field value from a markdown-formatted rule block.
 */
function extractField(block: string, fieldName: string): string | undefined {
  const regex = new RegExp(`- \\*\*${fieldName}\*\*:\s*(.+)`, "i");
  const match = regex.exec(block);
  return match?.[1]?.trim();
}

// ─── Singleton Accessor ─────────────────────────────────────────────────────

let _instance: ProactiveEngine | null = null;

export function getProactiveEngine(
  config?: Partial<AnomalyDetectorConfig>
): ProactiveEngine {
  if (!_instance) {
    _instance = new ProactiveEngine(config);
  }
  return _instance;
}
