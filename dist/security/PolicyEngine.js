"use strict";
// ─── M.A.I. Policy Engine ──────────────────────────────────────────────────
// Policy-as-a-Firewall: reads policy.md via gray-matter, parses YAML
// frontmatter for deny_commands, allow_network, require_approval.
//
// 6 validation rules applied in order:
//   1. Read-only actions always allowed
//   2. Deny commands — substring match against command field
//   3. Allow network — hostname allowlist with subdomain support
//   4. Require approval — gates that pause the loop for user confirmation
//   5. Known actions — if the registry recognizes it, allow
//   6. Unknown blocked — deny everything else
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyEngine = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const constants_js_1 = require("../core/constants.js");
// Actions that are always read-only and safe
const READONLY_ACTIONS = [
    "read-file",
    "list-directory",
    "get-system-info",
    "get-process-list",
];
// Fallback policy: strict deny-all when policy.md is missing or malformed
const FALLBACK_POLICY = {
    deny_commands: ["rm -rf", "format", "mkfs", "dd if=", "shutdown", "reboot", ":(){ :|:& };:"],
    allow_network: [],
    require_approval: ["execute-terminal", "write-file", "http-request"],
};
class PolicyEngine {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Load policy from the markdown brain file (policy.md).
     * Falls back to strict deny-all if the file is missing or invalid.
     */
    static async load() {
        try {
            const raw = await promises_1.default.readFile(constants_js_1.POLICY_PATH, "utf-8");
            return PolicyEngine.parsePolicyString(raw);
        }
        catch {
            console.warn("[PolicyEngine] policy.md not found or unreadable — using fallback policy (strict deny-all)");
            return new PolicyEngine(FALLBACK_POLICY);
        }
    }
    /**
     * Parse a markdown+YAML string into a PolicyEngine instance.
     * Extracts YAML frontmatter via gray-matter for deny/allow/approval rules.
     */
    static parsePolicyString(raw) {
        try {
            const parsed = (0, gray_matter_1.default)(raw);
            const data = parsed.data;
            const config = {
                deny_commands: Array.isArray(data.deny_commands)
                    ? data.deny_commands
                    : FALLBACK_POLICY.deny_commands,
                allow_network: Array.isArray(data.allow_network)
                    ? data.allow_network
                    : undefined,
                require_approval: Array.isArray(data.require_approval)
                    ? data.require_approval
                    : undefined,
            };
            return new PolicyEngine(config);
        }
        catch {
            return new PolicyEngine(FALLBACK_POLICY);
        }
    }
    getConfig() {
        return { ...this.config };
    }
    /**
     * Validate an action against the 6-rule policy chain.
     * Returns { allowed: true } or { allowed: false, reason: string }.
     */
    validateAction(action, knownActions) {
        const name = action.action;
        // Rule 1: Read-only actions are always allowed
        if (READONLY_ACTIONS.includes(name)) {
            return { allowed: true };
        }
        // Rule 2: Deny commands — substring match
        const command = String(action.command ?? "");
        if (command && this.config.deny_commands) {
            for (const deny of this.config.deny_commands) {
                if (command.includes(deny)) {
                    return {
                        allowed: false,
                        reason: `Command contains denied pattern: "${deny}"`,
                    };
                }
            }
        }
        // Rule 3: Network allowlist — hostname check with subdomain support
        if (name === "http-request" || name === "open-url") {
            const url = String(action.url ?? "");
            if (url) {
                try {
                    const hostname = new URL(url).hostname;
                    if (!this.isNetworkAllowed(hostname)) {
                        return {
                            allowed: false,
                            reason: `Network access denied for host: ${hostname}`,
                        };
                    }
                }
                catch {
                    // URL parse failed — let it through (will fail at execution)
                }
            }
        }
        // Rule 4: Require approval — pause the loop for confirmation
        if (this.config.require_approval &&
            this.config.require_approval.includes(name)) {
            // NOT denied — but flagged for approval gate
            // The AgentLoop handles the approval flow separately
            // This just means the action isn't auto-denied by policy
        }
        // Rule 5: Known actions are allowed
        if (knownActions && knownActions.includes(name)) {
            return { allowed: true };
        }
        // Rule 6: Unknown actions are blocked
        return {
            allowed: false,
            reason: `Unknown action: ${name}. Not in registered action list.`,
        };
    }
    /**
     * Check if an action requires approval before execution.
     */
    requiresApproval(name) {
        return this.config.require_approval?.includes(name) ?? false;
    }
    /**
     * Check if a hostname is allowed by the network allowlist.
     * Supports exact match and subdomain matching (e.g., "api.github.com"
     * matches allowlist entry "github.com").
     */
    isNetworkAllowed(hostname) {
        // Empty/undefined allow_network = deny all network access
        if (!this.config.allow_network || this.config.allow_network.length === 0) {
            return false;
        }
        return this.config.allow_network.some((pattern) => {
            // Exact match
            if (hostname === pattern)
                return true;
            // Subdomain match: hostname ends with .pattern
            if (hostname.endsWith("." + pattern))
                return true;
            // Wildcard match: pattern starts with *. (e.g., "*.github.com")
            if (pattern.startsWith("*.")) {
                const base = pattern.slice(2);
                return hostname === base || hostname.endsWith("." + base);
            }
            return false;
        });
    }
}
exports.PolicyEngine = PolicyEngine;
//# sourceMappingURL=PolicyEngine.js.map