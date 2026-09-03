import { Orchestrator } from "./orchestrator";
import { HarnessConfig } from "../config";
export interface AutonomousGoal {
    description: string;
    steps?: AutonomousStep[];
    status: "pending" | "in_progress" | "completed" | "failed";
    result?: string;
}
export interface AutonomousStep {
    action: string;
    input: Record<string, unknown>;
    rationale: string;
    status: "pending" | "running" | "completed" | "failed";
    output?: unknown;
    error?: string;
}
/**
 * AutonomousAgent - Full free natural language autonomy engine.
 * Takes high-level goals expressed in natural language, breaks them into
 * actionable steps using the model adapter, then executes them through
 * the orchestrator with full policy/security/resource awareness.
 */
export declare class AutonomousAgent {
    private orchestrator;
    private config;
    private goals;
    private isRunning;
    constructor(orchestrator: Orchestrator, config: HarnessConfig);
    /**
     * Submit a natural language goal for autonomous execution.
     */
    submitGoal(description: string): Promise<AutonomousGoal>;
    /**
     * Run autonomous planning: uses the model to decompose a goal into steps.
     */
    plan(goal: AutonomousGoal): Promise<AutonomousStep[]>;
    /**
     * Execute a planned goal step by step.
     */
    execute(goal: AutonomousGoal): Promise<string>;
    /**
     * High-level: submit a natural language goal and autonomously execute it.
     */
    run(goalDescription: string): Promise<string>;
    /**
     * Stop the current execution.
     */
    stop(): void;
    /**
     * Get all goals.
     */
    getGoals(): AutonomousGoal[];
    /**
     * Get the current running state.
     */
    get status(): boolean;
}
//# sourceMappingURL=autonomous.d.ts.map