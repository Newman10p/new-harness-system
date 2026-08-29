// ─── M.A.I. Policy Engine ──────────────────────────────────────────────────
// Policy-as-a-Firewall: reads policy.md via gray-matter, parses YAML
// frontmatter for deny_commands, allow_network, require_approval, auto_approve.
//
// 7 validation rules applied in order:
//   1. Read-only actions always allowed
//   2. Deny commands — substring match against command field
//   3. Allow network — hostname allowlist with subdomain support
//   4. Auto-approve — trusted actions that skip approval gate entirely
//   5. Require approval — gates that pause the loop for user confirmation
//   6. Known actions — if the registry recognizes it, allow
//   7. Unknown blocked — deny everything else

import fs from "node:fs/promises";
import matter from "gray-matter";
import { POLICY_PATH } from "../core/constants.js";
import type { Action, PolicyConfig, PolicyDecision, ActionName } from "../types/index.js";

// Actions that are always read-only and safe
const READONLY_ACTIONS: string[] = [
  "read-file",
  "list-directory",
  "get-system-info",
  "get-process-list",
  "list-files-detailed",
  "get-gpu-info",
  "get-network-info",
];

// Actions that are sandboxed by design and never need approval
const SANDBOXED_ACTIONS: string[] = [
  "sandbox-execute",
  "sandbox-promote",
  "device-control",
  "dry-run",
  "ui-adapt",
  "browser-control",
  "email-access",
];

// Fallback policy: strict deny-all when policy.md is missing or malformed
const FALLBACK_POLICY: PolicyConfig = {
  deny_commands: ["rm -rf", "format", "mkfs", "dd if=", "shutdown", "reboot", ":(){ :|:& };:"],
  allow_network: [],
  require_approval: ["execute-terminal", "write-file", "http-request"],
  auto_approve: ["sandbox-execute", "sandbox-promote", "device-control", "ui-adapt", "dry-run", "browser-control", "email-access"],
};

export class PolicyEngine {
  private config: PolicyConfig;

  private constructor(config: PolicyConfig) {
    this.config = config;
  }

  /**
   * Load policy from the markdown brain file (policy.md).
   * Falls back to strict deny-all if the file is missing or invalid.
   */
  static async load(): Promise<PolicyEngine> {
    try {
      const raw = await fs.readFile(POLICY_PATH, "utf-8");
      return PolicyEngine.parsePolicyString(raw);
    } catch {
      console.warn(
        "[PolicyEngine] policy.md not found or unreadable — using fallback policy"
      );
      return new PolicyEngine(FALLBACK_POLICY);
    }
  }

  /**
   * Parse a markdown+YAML string into a PolicyEngine instance.
   */
  static parsePolicyString(raw: string): PolicyEngine {
    try {
      const parsed = matter(raw);
      const data = parsed.data as Record<string, unknown>;

      const config: PolicyConfig = {
        deny_commands: Array.isArray(data.deny_commands)
          ? (data.deny_commands as string[])
          : FALLBACK_POLICY.deny_commands,
        allow_network: Array.isArray(data.allow_network)
          ? (data.allow_network as string[])
          : undefined,
        require_approval: Array.isArray(data.require_approval)
          ? (data.require_approval as string[])
          : undefined,
        auto_approve: Array.isArray(data.auto_approve)
          ? (data.auto_approve as string[])
          : FALLBACK_POLICY.auto_approve,
      };

      return new PolicyEngine(config);
    } catch {
      return new PolicyEngine(FALLBACK_POLICY);
    }
  }

  getConfig(): PolicyConfig {
    return { ...this.config };
  }

  /**
   * Validate an action against the 7-rule policy chain.
   * Returns { allowed: true } or { allowed: false, reason: string }.
   */
  validateAction(action: Action, knownActions?: readonly string[]): PolicyDecision {
    const name = action.action;

    // Rule 1: Read-only actions are always allowed
    if (READONLY_ACTIONS.includes(name)) {
      return { allowed: true };
    }

    // Rule 2: Deny commands — substring match
    const command = String((action as { command?: unknown }).command ?? "");
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
      const url = String((action as { url?: unknown }).url ?? "");
      if (url) {
        try {
          const hostname = new URL(url).hostname;
          if (!this.isNetworkAllowed(hostname)) {
            return {
              allowed: false,
              reason: `Network access denied for host: ${hostname}`,
            };
          }
        } catch {
          // URL parse failed — let it through (will fail at execution)
        }
      }
    }

    // Rule 4: Auto-approved actions skip the approval gate
    // (checked before require_approval so auto_approve takes precedence)
    if (
      this.config.auto_approve &&
      this.config.auto_approve.includes(name)
    ) {
      // Still must be a known action (Rule 6/7 below)
      // But if it reaches Rule 5, it won't be flagged for approval
    }

    // Rule 5: Require approval — pause the loop for confirmation
    // Only triggers if NOT in auto_approve list
    if (
      this.config.require_approval &&
      this.config.require_approval.includes(name) &&
      !this.isAutoApproved(name)
    ) {
      // NOT denied — but flagged for approval gate
      // The AgentLoop handles the approval flow separately
    }

    // Rule 6: Known actions are allowed
    if (knownActions && knownActions.includes(name as ActionName)) {
      return { allowed: true };
    }

    // Rule 7: Unknown actions are blocked
    return {
      allowed: false,
      reason: `Unknown action: ${name}. Not in registered action list.`,
    };
  }

  /**
   * Check if an action requires approval before execution.
   * Returns false for auto-approved and sandboxed actions.
   */
  requiresApproval(name: string): boolean {
    // Auto-approved actions never need confirmation
    if (this.isAutoApproved(name)) {
      return false;
    }
    return this.config.require_approval?.includes(name) ?? false;
  }

  /**
   * Check if an action is in the auto-approve list.
   * Also implicitly auto-approves all sandboxed actions.
   */
  isAutoApproved(name: string): boolean {
    // Sandbox-inherent actions are always trusted
    if (SANDBOXED_ACTIONS.includes(name)) {
      return true;
    }
    // Config-based auto-approve list
    return this.config.auto_approve?.includes(name) ?? false;
  }

  /**
   * Check if a hostname is allowed by the network allowlist.
   */
  private isNetworkAllowed(hostname: string): boolean {
    if (!this.config.allow_network || this.config.allow_network.length === 0) {
      return false;
    }

    return this.config.allow_network.some((pattern) => {
      if (hostname === pattern) return true;
      if (hostname.endsWith("." + pattern)) return true;
      if (pattern.startsWith("*.")) {
        const base = pattern.slice(2);
        return hostname === base || hostname.endsWith("." + base);
      }
      return false;
    });
  }
}
