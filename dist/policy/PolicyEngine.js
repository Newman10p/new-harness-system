"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyEngine = void 0;
const DEFAULT_OBJECTIVES = [
    "Serve as a personal operator for code, files, tools, and automation.",
    "Preserve system stability, privacy, and resource health.",
    "Adapt skills within sandboxed, reviewable workflows.",
    "Coordinate across devices only when configured and authorized."
];
const DEFAULT_RULES = [
    "Do not execute destructive actions without explicit confirmation.",
    "Respect resource limits and avoid heavy tasks when constrained.",
    "Log significant actions and tool calls for audit.",
    "Limit security tools to defensive and authorized analysis.",
    "Do not assist with unauthorized intrusion, exploitation, or attacks."
];
/**
 * Policy engine that enforces objectives and rules.
 * Makes policy available to the orchestrator and model as system prompts.
 */
class PolicyEngine {
    config;
    constructor(config) {
        this.config = config.policy ?? {
            objectives: DEFAULT_OBJECTIVES,
            rules: DEFAULT_RULES
        };
    }
    getObjectives() {
        return [...(this.config.objectives ?? DEFAULT_OBJECTIVES)];
    }
    getRules() {
        return [...(this.config.rules ?? DEFAULT_RULES)];
    }
    getPolicy() {
        return { ...this.config };
    }
    /**
     * Returns the policy as a system prompt string for injection into model prompts.
     */
    toSystemPrompt() {
        const objectives = this.config.objectives ?? DEFAULT_OBJECTIVES;
        const rules = this.config.rules ?? DEFAULT_RULES;
        return [
            "=== Jarvis Harness Policy ===",
            "",
            "Objectives:",
            ...objectives.map((o) => `  - ${o}`),
            "",
            "Rules:",
            ...rules.map((r) => `  - ${r}`),
            ""
        ].join("\n");
    }
    /**
     * Check if an action is permitted under the current policy.
     */
    checkAction(action, safetyLevel) {
        const destructiveActions = ["fs.delete", "fs.write", "terminal.exec"];
        const networkActions = ["net.fetch", "device.remote.call"];
        if (destructiveActions.includes(action) && safetyLevel === "conservative") {
            return { allowed: false, reason: "Destructive actions disabled in conservative mode" };
        }
        if (networkActions.includes(action) && safetyLevel === "conservative") {
            return { allowed: false, reason: "Network actions disabled in conservative mode" };
        }
        return { allowed: true };
    }
}
exports.PolicyEngine = PolicyEngine;
//# sourceMappingURL=PolicyEngine.js.map