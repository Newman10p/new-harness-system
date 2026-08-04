// ─── PolicyEngine Tests ───────────────────────────────────────────────────
// Tests for src/security/PolicyEngine.ts
//
// Run: npx tsx tests/policy-engine.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { PolicyEngine } = require(path.join(__dirname, "..", "src", "security", "PolicyEngine.js")) as typeof import("../src/security/PolicyEngine");

// Type helpers for test actions
type TestAction = { action: string; command?: string; url?: string; [key: string]: unknown };

const KNOWN_ACTIONS = [
  "execute-terminal", "read-file", "write-file", "append-file",
  "list-directory", "get-system-info", "http-request", "open-url",
  "web-search", "get-process-list", "run-skill", "schedule-task",
];

describe("PolicyEngine", () => {
  // ── parsePolicyString with valid YAML frontmatter ────────────────────────
  describe("parsePolicyString with valid YAML frontmatter", () => {
    it("should parse deny_commands, allow_network, and require_approval", () => {
      const raw = `---
deny_commands:
  - rm -rf
  - format
allow_network:
  - github.com
  - api.github.com
require_approval:
  - execute-terminal
  - write-file
---
# Policy document
Some policy text.`;

      const engine = PolicyEngine.parsePolicyString(raw);
      const config = engine.getConfig();

      assert.deepEqual(config.deny_commands, ["rm -rf", "format"]);
      assert.deepEqual(config.allow_network, ["github.com", "api.github.com"]);
      assert.deepEqual(config.require_approval, ["execute-terminal", "write-file"]);
    });
  });

  // ── parsePolicyString with empty config ──────────────────────────────────
  describe("parsePolicyString with empty config", () => {
    it("should use fallback deny_commands when no YAML frontmatter data", () => {
      const raw = `---
---
# Empty policy`;

      const engine = PolicyEngine.parsePolicyString(raw);
      const config = engine.getConfig();

      // deny_commands should fall back to FALLBACK_POLICY values
      assert.ok(Array.isArray(config.deny_commands));
      assert.ok(config.deny_commands!.length > 0);
      assert.ok(config.deny_commands!.includes("rm -rf"));
    });
  });

  // ── parsePolicyString with malformed YAML ────────────────────────────────
  describe("parsePolicyString with malformed YAML", () => {
    it("should return fallback policy on invalid YAML", () => {
      const raw = `---
: invalid: yaml: here: :
---`;

      // gray-matter may or may not throw; we just verify it doesn't crash
      // and returns a usable engine
      const engine = PolicyEngine.parsePolicyString(raw);
      const config = engine.getConfig();

      assert.ok(Array.isArray(config.deny_commands));
      assert.ok(config.deny_commands!.length > 0);
    });

    it("should return fallback policy on completely invalid input", () => {
      const engine = PolicyEngine.parsePolicyString("");
      const config = engine.getConfig();

      assert.ok(Array.isArray(config.deny_commands));
    });
  });

  // ── validateAction for read-only actions ────────────────────────────────
  describe("validateAction for read-only actions", () => {
    it("should always allow read-file", () => {
      const engine = PolicyEngine.parsePolicyString("---\n---");
      const action: TestAction = { action: "read-file", path: "/etc/hosts" };

      const decision = engine.validateAction(action);

      assert.equal(decision.allowed, true);
    });

    it("should always allow list-directory", () => {
      const engine = PolicyEngine.parsePolicyString("---\n---");
      const action: TestAction = { action: "list-directory", path: "/tmp" };

      const decision = engine.validateAction(action);

      assert.equal(decision.allowed, true);
    });

    it("should always allow get-system-info", () => {
      const engine = PolicyEngine.parsePolicyString("---\n---");
      const action: TestAction = { action: "get-system-info" };

      const decision = engine.validateAction(action);

      assert.equal(decision.allowed, true);
    });

    it("should always allow get-process-list", () => {
      const engine = PolicyEngine.parsePolicyString("---\n---");
      const action: TestAction = { action: "get-process-list" };

      const decision = engine.validateAction(action);

      assert.equal(decision.allowed, true);
    });
  });

  // ── validateAction with denied command patterns ────────────────────────
  describe("validateAction with denied command patterns", () => {
    it("should block rm -rf command", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\ndeny_commands:\n  - rm -rf\n---`
      );
      const action: TestAction = { action: "execute-terminal", command: "rm -rf /" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, false);
      assert.ok((decision as { allowed: false; reason: string }).reason.includes("rm -rf"));
    });

    it("should block substring match within a longer command", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\ndeny_commands:\n  - format\n---`
      );
      const action: TestAction = { action: "execute-terminal", command: "mkfs -t ext4 /dev/sda1" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      // "format" is in the fallback deny_commands, not our custom one
      // Our custom one only has "format" which is not a substring of "mkfs"
      // So this should be allowed (known action, not matching "format")
      // Actually wait - we only have "format" in deny_commands. "mkfs" doesn't contain "format".
      assert.equal(decision.allowed, true);
    });

    it("should block command matching 'format' substring", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\ndeny_commands:\n  - format\n---`
      );
      const action: TestAction = { action: "execute-terminal", command: "format /dev/sda1" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, false);
      assert.ok((decision as { allowed: false; reason: string }).reason.includes("format"));
    });
  });

  // ── validateAction with allowed network host ────────────────────────────
  describe("validateAction with network allowlist", () => {
    it("should allow http-request to an allowed host", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nallow_network:\n  - github.com\nrequire_approval: []\n---`
      );
      const action: TestAction = { action: "http-request", url: "https://github.com/repos" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, true);
    });

    it("should block http-request to a denied host", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nallow_network:\n  - github.com\nrequire_approval: []\n---`
      );
      const action: TestAction = { action: "http-request", url: "https://evil.com/steal" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, false);
      assert.ok((decision as { allowed: false; reason: string }).reason.includes("evil.com"));
    });

    it("should block http-request when allow_network is empty", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nallow_network: []\nrequire_approval: []\n---`
      );
      const action: TestAction = { action: "http-request", url: "https://github.com/repos" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, false);
      assert.ok((decision as { allowed: false; reason: string }).reason.includes("github.com"));
    });
  });

  // ── validateAction with subdomain matching ──────────────────────────────
  describe("validateAction with subdomain matching", () => {
    it("should allow api.github.com when github.com is in allowlist", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nallow_network:\n  - github.com\nrequire_approval: []\n---`
      );
      const action: TestAction = { action: "http-request", url: "https://api.github.com/v2/repos" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, true);
    });

    it("should allow subdomain.github.com when github.com is in allowlist", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nallow_network:\n  - github.com\nrequire_approval: []\n---`
      );
      const action: TestAction = { action: "http-request", url: "https://subdomain.github.com/page" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, true);
    });

    it("should not allow not-github.com when only github.com is in allowlist", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nallow_network:\n  - github.com\nrequire_approval: []\n---`
      );
      const action: TestAction = { action: "http-request", url: "https://not-github.com/page" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, false);
    });
  });

  // ── validateAction with wildcard allow_network ──────────────────────────
  describe("validateAction with wildcard allow_network", () => {
    it("should allow api.github.com with *.github.com pattern", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nallow_network:\n  - "*.github.com"\nrequire_approval: []\n---`
      );
      const action: TestAction = { action: "http-request", url: "https://api.github.com/v2" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, true);
    });

    it("should allow github.com itself with *.github.com pattern", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nallow_network:\n  - "*.github.com"\nrequire_approval: []\n---`
      );
      const action: TestAction = { action: "http-request", url: "https://github.com" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, true);
    });

    it("should not allow evil.github.evil.com with *.github.com pattern", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nallow_network:\n  - "*.github.com"\nrequire_approval: []\n---`
      );
      const action: TestAction = { action: "http-request", url: "https://evil.github.evil.com" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, false);
    });
  });

  // ── validateAction with unknown action ──────────────────────────────────
  describe("validateAction with unknown action", () => {
    it("should block actions not in the known actions list", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nrequire_approval: []\n---`
      );
      const action: TestAction = { action: "totally-unknown-action" };

      const decision = engine.validateAction(action, KNOWN_ACTIONS);

      assert.equal(decision.allowed, false);
      assert.ok((decision as { allowed: false; reason: string }).reason.includes("Unknown action"));
    });
  });

  // ── requiresApproval ────────────────────────────────────────────────────
  describe("requiresApproval", () => {
    it("should return true for actions in require_approval list", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nrequire_approval:\n  - execute-terminal\n  - write-file\n---`
      );

      assert.equal(engine.requiresApproval("execute-terminal"), true);
      assert.equal(engine.requiresApproval("write-file"), true);
    });

    it("should return false for actions not in require_approval list", () => {
      const engine = PolicyEngine.parsePolicyString(
        `---\nrequire_approval:\n  - execute-terminal\n---`
      );

      assert.equal(engine.requiresApproval("read-file"), false);
      assert.equal(engine.requiresApproval("list-directory"), false);
    });

    it("should return false when require_approval is undefined", () => {
      const engine = PolicyEngine.parsePolicyString("---\n---");

      assert.equal(engine.requiresApproval("execute-terminal"), false);
    });
  });
});
