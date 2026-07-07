import { HarnessConfig, PolicyConfig } from "../config";

/**
 * Policy engine that enforces objectives and rules.
 * Makes policy available to the orchestrator and model as system prompts.
 */
export class PolicyEngine {
  private config: PolicyConfig;

  constructor(config: HarnessConfig) {
    this.config = config.policy ?? {
      objectives: [
        "Serve as a personal operator for code, files, tools, and automation.",
        "Preserve system stability, privacy, and resource health.",
        "Adapt skills within sandboxed, reviewable workflows.",
        "Coordinate across devices only when configured and authorized."
      ],
      rules: [
        "Do not execute destructive actions without explicit confirmation.",
        "Respect resource limits and avoid heavy tasks when constrained.",
        "Log significant actions and tool calls for audit.",
        "Limit security tools to defensive and authorized analysis.",
        "Do not assist with unauthorized intrusion, exploitation, or attacks."
      ]
    };
  }

  getObjectives(): string[] {
    return [...this.config.objectives];
  }

  getRules(): string[] {
    return [...this.config.rules];
  }

  getPolicy(): PolicyConfig {
    return { ...this.config };
  }

  /**
   * Returns the policy as a system prompt string for injection into model prompts.
   */
  toSystemPrompt(): string {
    return [
      "=== Jarvis Harness Policy ===",
      "",
      "Objectives:",
      ...this.config.objectives.map((o) => `  - ${o}`),
      "",
      "Rules:",
      ...this.config.rules.map((r) => `  - ${r}`),
      ""
    ].join("\n");
  }

  /**
   * Check if an action is permitted under the current policy.
   */
  checkAction(action: string, safetyLevel: string): { allowed: boolean; reason?: string } {
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