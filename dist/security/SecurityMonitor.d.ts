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
export declare class SecurityMonitor {
    private alerts;
    private actionLog;
    private config;
    private alertLogPath;
    private terminalCallWindow;
    private resourceCheckInterval;
    constructor(config: HarnessConfig);
    start(): void;
    stop(): void;
    logAction(actionLog: SecurityActionLog): void;
    addAlert(alert: Omit<SecurityAlert, "id" | "timestamp">): void;
    getAlerts(severity?: "info" | "warning" | "critical"): SecurityAlert[];
    getRecentAlerts(count?: number): SecurityAlert[];
    getStatus(): {
        totalAlerts: number;
        totalActions: number;
        terminalCallRate: number;
    };
    private checkResourceUsage;
    private persistAlert;
}
//# sourceMappingURL=SecurityMonitor.d.ts.map