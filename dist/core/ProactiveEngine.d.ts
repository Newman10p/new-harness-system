export type AnomalyType = "cpu_spike" | "memory_leak" | "disk_full" | "network_loss" | "repeated_error";
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
    cpu: number;
    memory: number;
    disk: number;
    networkUp?: boolean;
    errorRate?: number;
    activeConnections?: number;
    uptime?: number;
}
export interface ProactiveActionResult {
    triggered: boolean;
    ruleId?: string;
    anomaly?: Anomaly;
    action?: string;
    skippedReason?: string;
}
interface AnomalyDetectorConfig {
    cpuThreshold: number;
    cpuDurationS: number;
    memoryThreshold: number;
    diskThreshold: number;
    errorRepeatThreshold: number;
    errorWindowMs: number;
    idleWorkHoursStart: number;
    idleWorkHoursEnd: number;
    idleMinutesThreshold: number;
}
export declare class ProactiveEngine {
    private customRules;
    private detectorConfig;
    private recentErrors;
    private highCpuStart;
    private lastInteractionTime;
    private actionCallback;
    private anomalyCallback;
    constructor(config?: Partial<AnomalyDetectorConfig>);
    /**
     * Set the callback that receives proactive actions.
     * The action string will be fed into the AgentLoop as user input.
     * IMPORTANT: Actions still go through the policy engine for safety.
     */
    setActionCallback(cb: (action: string) => Promise<void>): void;
    /**
     * Set a callback for anomaly notifications (for HUD display).
     */
    setAnomalyCallback(cb: (anomaly: Anomaly) => Promise<void>): void;
    /**
     * Called during metrics polling. Checks all proactive conditions.
     * Never throws — returns results array.
     */
    checkProactiveConditions(metrics: SystemMetrics): Promise<ProactiveActionResult[]>;
    /**
     * Detect anomalies from current metrics. Pure analysis, no side effects.
     */
    detectAnomalies(metrics: SystemMetrics): Anomaly[];
    /**
     * Record an error for repeated-error detection.
     */
    recordError(message: string): void;
    /**
     * Update the last interaction time (called on each user message).
     */
    recordInteraction(): void;
    /**
     * Add a custom proactive rule.
     */
    addRule(rule: Omit<ProactiveRule, "id" | "timesTriggered" | "created">): ProactiveRule;
    /**
     * Remove a custom rule by ID.
     */
    removeRule(ruleId: string): boolean;
    /**
     * Enable/disable a rule.
     */
    setRuleEnabled(ruleId: string, enabled: boolean): boolean;
    /**
     * Get all rules (built-in + custom).
     */
    getAllRules(): ProactiveRule[];
    /**
     * Get custom rules only.
     */
    getCustomRules(): ProactiveRule[];
    /**
     * Configure anomaly detector thresholds.
     */
    configureDetectors(config: Partial<AnomalyDetectorConfig>): void;
    private checkConditionsInternal;
    /**
     * Safely evaluate a JavaScript condition expression against metrics.
     * Only allows basic comparisons — no function calls or assignments.
     */
    private evaluateCondition;
    /**
     * Trigger a proactive action via the callback.
     */
    private triggerProactiveAction;
    /**
     * Check if the user has been idle during work hours.
     */
    private checkIdlePattern;
    /**
     * Find a rule by ID across built-in and custom rules.
     */
    private findRule;
    private pruneErrors;
    private getMostFrequentError;
    /**
     * Persist custom rules to memory/proactive-rules.md.
     */
    private persistRules;
    /**
     * Load custom rules from disk.
     */
    private loadRules;
    /**
     * Load engine state (error tracking, etc.) from disk.
     */
    private loadState;
    /**
     * Persist engine state to disk.
     */
    persistState(): Promise<void>;
}
export declare function getProactiveEngine(config?: Partial<AnomalyDetectorConfig>): ProactiveEngine;
export {};
//# sourceMappingURL=ProactiveEngine.d.ts.map