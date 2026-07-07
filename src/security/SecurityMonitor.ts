import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { HarnessConfig } from "../config";

export interface SecurityAlert {
  id: string;
  timestamp: Date;
  severity: "info" | "warning" | "critical";
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SecurityActionLog {
  timestamp: Date;
  action: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

export class SecurityMonitor {
  private alerts: SecurityAlert[] = [];
  private actionLog: SecurityActionLog[] = [];
  private config: HarnessConfig;
  private alertLogPath: string;
  private terminalCallWindow: number[] = [];
  private resourceCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: HarnessConfig) {
    this.config = config;
    this.alertLogPath = path.resolve(process.cwd(), "security-alerts.log");
  }

  start(): void {
    if (!this.config.security?.monitorEnabled) return;
    this.resourceCheckInterval = setInterval(() => this.checkResourceUsage(), 60000);
    console.log("[SecurityMonitor] Started");
  }

  stop(): void {
    if (this.resourceCheckInterval) clearInterval(this.resourceCheckInterval);
  }

  logAction(actionLog: SecurityActionLog): void {
    this.actionLog.push(actionLog);
    if (this.actionLog.length > 1000) this.actionLog = this.actionLog.slice(-500);

    if (actionLog.action === "terminal.exec") {
      this.terminalCallWindow.push(Date.now());
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      this.terminalCallWindow = this.terminalCallWindow.filter((t) => t > fiveMinAgo);

      if (this.terminalCallWindow.length > 10 && this.config.security?.alertOnFrequentTerminal) {
        this.addAlert({
          severity: "warning",
          category: "frequent_terminal",
          message: `High frequency of terminal commands: ${this.terminalCallWindow.length} in last 5 minutes`,
          details: { count: this.terminalCallWindow.length, windowSeconds: 300 }
        });
      }
    }
  }

  addAlert(alert: Omit<SecurityAlert, "id" | "timestamp">): void {
    const fullAlert: SecurityAlert = {
      id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(),
      ...alert
    };
    this.alerts.push(fullAlert);
    this.persistAlert(fullAlert);
    const prefix = fullAlert.severity === "critical" ? "🔴" : fullAlert.severity === "warning" ? "🟡" : "🔵";
    console.log(`[SecurityMonitor] ${prefix} [${fullAlert.category}] ${fullAlert.message}`);
  }

  getAlerts(severity?: "info" | "warning" | "critical"): SecurityAlert[] {
    if (severity) return this.alerts.filter((a) => a.severity === severity);
    return [...this.alerts];
  }

  getRecentAlerts(count = 10): SecurityAlert[] {
    return this.alerts.slice(-count).reverse();
  }

  getStatus(): { totalAlerts: number; totalActions: number; terminalCallRate: number } {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentCalls = this.terminalCallWindow.filter((t) => t > fiveMinAgo);
    return {
      totalAlerts: this.alerts.length,
      totalActions: this.actionLog.length,
      terminalCallRate: recentCalls.length / 5
    };
  }

  private checkResourceUsage(): void {
    if (!this.config.security?.alertOnHighResourceUsage) return;
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const usedPercent = (1 - freeMem / totalMem) * 100;
    if (usedPercent > 90) {
      this.addAlert({
        severity: "warning",
        category: "high_memory",
        message: `Memory usage critically high: ${usedPercent.toFixed(1)}%`,
        details: { usedPercent, freeGb: (freeMem / 1e9).toFixed(2) }
      });
    }
    const loadAvg = os.loadavg();
    const cores = os.cpus().length;
    if (loadAvg[0] > cores * 2) {
      this.addAlert({
        severity: "info", category: "high_cpu",
        message: `CPU load average high: ${loadAvg[0].toFixed(1)} (${cores} cores)`,
        details: { loadAvg: loadAvg[0], cores }
      });
    }
  }

  private persistAlert(alert: SecurityAlert): void {
    try {
      fs.appendFileSync(this.alertLogPath, JSON.stringify(alert) + "\n", "utf8");
    } catch { /* fail silently */ }
  }
}