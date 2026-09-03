"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityMonitor = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
class SecurityMonitor {
    alerts = [];
    actionLog = [];
    config;
    alertLogPath;
    terminalCallWindow = [];
    resourceCheckInterval = null;
    constructor(config) {
        this.config = config;
        this.alertLogPath = node_path_1.default.resolve(process.cwd(), "security-alerts.log");
    }
    start() {
        if (!this.config.security?.monitorEnabled)
            return;
        this.resourceCheckInterval = setInterval(() => this.checkResourceUsage(), 60000);
        console.log("[SecurityMonitor] Started");
    }
    stop() {
        if (this.resourceCheckInterval)
            clearInterval(this.resourceCheckInterval);
    }
    logAction(actionLog) {
        this.actionLog.push(actionLog);
        if (this.actionLog.length > 1000)
            this.actionLog = this.actionLog.slice(-500);
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
    addAlert(alert) {
        const fullAlert = {
            id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date(),
            ...alert
        };
        this.alerts.push(fullAlert);
        this.persistAlert(fullAlert);
        const prefix = fullAlert.severity === "critical" ? "🔴" : fullAlert.severity === "warning" ? "🟡" : "🔵";
        console.log(`[SecurityMonitor] ${prefix} [${fullAlert.category}] ${fullAlert.message}`);
    }
    getAlerts(severity) {
        if (severity)
            return this.alerts.filter((a) => a.severity === severity);
        return [...this.alerts];
    }
    getRecentAlerts(count = 10) {
        return this.alerts.slice(-count).reverse();
    }
    getStatus() {
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const recentCalls = this.terminalCallWindow.filter((t) => t > fiveMinAgo);
        return {
            totalAlerts: this.alerts.length,
            totalActions: this.actionLog.length,
            terminalCallRate: recentCalls.length / 5
        };
    }
    checkResourceUsage() {
        if (!this.config.security?.alertOnHighResourceUsage)
            return;
        const freeMem = node_os_1.default.freemem();
        const totalMem = node_os_1.default.totalmem();
        const usedPercent = (1 - freeMem / totalMem) * 100;
        if (usedPercent > 90) {
            this.addAlert({
                severity: "warning",
                category: "high_memory",
                message: `Memory usage critically high: ${usedPercent.toFixed(1)}%`,
                details: { usedPercent, freeGb: (freeMem / 1e9).toFixed(2) }
            });
        }
        const loadAvg = node_os_1.default.loadavg();
        const cores = node_os_1.default.cpus().length;
        if (loadAvg[0] > cores * 2) {
            this.addAlert({
                severity: "info", category: "high_cpu",
                message: `CPU load average high: ${loadAvg[0].toFixed(1)} (${cores} cores)`,
                details: { loadAvg: loadAvg[0], cores }
            });
        }
    }
    persistAlert(alert) {
        try {
            node_fs_1.default.appendFileSync(this.alertLogPath, JSON.stringify(alert) + "\n", "utf8");
        }
        catch { /* fail silently */ }
    }
}
exports.SecurityMonitor = SecurityMonitor;
//# sourceMappingURL=SecurityMonitor.js.map