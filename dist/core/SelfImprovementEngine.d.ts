export type PatternType = "repeated_failure" | "slow_operation" | "user_correction" | "policy_violation" | "provider_error";
export interface Pattern {
    type: PatternType;
    description: string;
    frequency: number;
    severity: "low" | "medium" | "high";
    suggestedAction: string;
}
export type ImprovementActionType = "update_memory" | "update_config" | "create_skill" | "update_policy" | "update_identity";
export interface ImprovementAction {
    type: ImprovementActionType;
    target: string;
    change: string;
    content?: string;
}
export type PlanStatus = "planned" | "applying" | "applied" | "verified" | "rolled_back";
export interface ImprovementPlan {
    id: string;
    patterns: Pattern[];
    actions: ImprovementAction[];
    priority: number;
    status: PlanStatus;
    created: string;
}
export declare class SelfImprovementEngine {
    private interactionCount;
    private reflectInterval;
    private history;
    private autoReflectTimer;
    private audit;
    constructor(opts?: {
        reflectInterval?: number;
        audit?: (entry: {
            type: string;
            detail: string;
            ok?: boolean;
        }) => Promise<void>;
    });
    /**
     * Called by AgentLoop after each interaction completes.
     * Increments counter and triggers reflection if interval reached.
     */
    recordInteraction(): Promise<void>;
    /**
     * External trigger — can be called by AgentLoop or other systems.
     */
    triggerReflection(): Promise<{
        reflected: boolean;
        plans: number;
    }>;
    /**
     * Main reflection loop: read audit log, identify patterns, plan & apply.
     */
    reflect(interval?: number): Promise<ImprovementPlan[]>;
    /**
     * Start the automatic reflection timer.
     */
    startAutoReflect(checkIntervalMs?: number): void;
    /**
     * Stop the automatic reflection timer.
     */
    stopAutoReflect(): void;
    /**
     * Get the full improvement history.
     */
    getHistory(): ImprovementPlan[];
    /**
     * Analyze audit log text for patterns using regex matching.
     */
    identifyPatterns(log: string): Pattern[];
    /**
     * Generate an improvement plan from identified patterns.
     */
    planImprovements(patterns: Pattern[]): ImprovementPlan;
    /**
     * Execute an improvement plan. Backs up files before modifying.
     */
    applyImprovement(plan: ImprovementPlan): Promise<void>;
    /**
     * Apply a single improvement action safely.
     */
    private applyAction;
    /**
     * Append content to a file, creating directories and backing up as needed.
     */
    private appendToFile;
    /**
     * Create a new skill file.
     */
    private createSkillFile;
    /**
     * Backup a file to state/backups/ before modifying.
     */
    private backupFile;
    /**
     * Persist improvement history and learned lessons to self-improvements.md.
     */
    persistState(): Promise<void>;
    /**
     * Build a markdown section summarizing the latest improvements.
     */
    private buildImprovementSection;
    /**
     * Load previous state from disk.
     */
    private loadState;
    /**
     * Read the audit log (last N entries).
     */
    private readAuditLog;
}
export declare function getSelfImprovementEngine(opts?: ConstructorParameters<typeof SelfImprovementEngine>[0]): SelfImprovementEngine;
//# sourceMappingURL=SelfImprovementEngine.d.ts.map