import { HarnessConfig, PolicyConfig } from "../config";
/**
 * Policy engine that enforces objectives and rules.
 * Makes policy available to the orchestrator and model as system prompts.
 */
export declare class PolicyEngine {
    private config;
    constructor(config: HarnessConfig);
    getObjectives(): string[];
    getRules(): string[];
    getPolicy(): PolicyConfig;
    /**
     * Returns the policy as a system prompt string for injection into model prompts.
     */
    toSystemPrompt(): string;
    /**
     * Check if an action is permitted under the current policy.
     */
    checkAction(action: string, safetyLevel: string): {
        allowed: boolean;
        reason?: string;
    };
}
//# sourceMappingURL=PolicyEngine.d.ts.map