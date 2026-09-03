import type { Action, PolicyConfig, PolicyDecision } from "../types/index.js";
export declare class PolicyEngine {
    private config;
    private constructor();
    /**
     * Load policy from the markdown brain file (policy.md).
     * Falls back to strict deny-all if the file is missing or invalid.
     */
    static load(): Promise<PolicyEngine>;
    /**
     * Parse a markdown+YAML string into a PolicyEngine instance.
     * Extracts YAML frontmatter via gray-matter for deny/allow/approval rules.
     */
    static parsePolicyString(raw: string): PolicyEngine;
    getConfig(): PolicyConfig;
    /**
     * Validate an action against the 6-rule policy chain.
     * Returns { allowed: true } or { allowed: false, reason: string }.
     */
    validateAction(action: Action, knownActions?: readonly string[]): PolicyDecision;
    /**
     * Check if an action requires approval before execution.
     */
    requiresApproval(name: string): boolean;
    /**
     * Check if a hostname is allowed by the network allowlist.
     * Supports exact match and subdomain matching (e.g., "api.github.com"
     * matches allowlist entry "github.com").
     */
    private isNetworkAllowed;
}
//# sourceMappingURL=PolicyEngine.d.ts.map