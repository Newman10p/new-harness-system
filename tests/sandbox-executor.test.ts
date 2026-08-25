// ─── SandboxExecutor Tests ─────────────────────────────────────────────
// Tests for src/security/SandboxExecutor.ts
//
// Run: npx tsx tests/sandbox-executor.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { SandboxExecutor } = require(path.join(__dirname, "..", "src", "security", "SandboxExecutor.js")) as typeof import("../src/security/SandboxExecutor");

describe("SandboxExecutor", () => {
  let executor: InstanceType<typeof SandboxExecutor>;

  // The SandboxExecutor constructor is called once before tests
  // We use a fresh instance per test for isolation

  // ── Simple safe command ─────────────────────────────────────────────────
  describe("execute with a simple safe command", () => {
    it("should execute 'ls -la' and return output", async () => {
      const executor = new SandboxExecutor();
      const result = await executor.execute("ls -la", 5000);

      assert.ok(result.stdout.length > 0, "Expected non-empty stdout");
      assert.equal(result.parsed.blocked, false);
      assert.equal(result.parsed.command, "ls");
    });
  });

  // ── Blocked patterns ────────────────────────────────────────────────────
  describe("blocked patterns", () => {
    it("should block 'rm -rf /' by deny_commands (but sandbox may not catch it as dangerous)", async () => {
      const executor = new SandboxExecutor();
      // The SandboxExecutor's DANGEROUS_PATTERNS does not have rm -rf specifically.
      // The PolicyEngine handles that. But let's verify parseCommand works.
      const parsed = executor.parseCommand("rm -rf /");
      // The sandbox itself should allow rm -rf (it's the policy engine that denies it)
      // But it may detect shell operators or not.
      // Actually, rm -rf / has no shell operators, so shell:false
      assert.equal(parsed.usesShell, false);
      assert.equal(parsed.blocked, false);
    });

    it("should block 'eval' command", async () => {
      const executor = new SandboxExecutor();
      const validation = executor.validateCommand("eval \"rm -rf /\"");
      assert.equal(validation.blocked, true);
      assert.ok(validation.reasons.some(r => r.includes("eval")));
    });

    it("should block 'base64 -d | sh' command", async () => {
      const executor = new SandboxExecutor();
      const validation = executor.validateCommand("echo c2ggLWYgIC9ldGMvcGFzc3dk | base64 -d | sh");
      assert.equal(validation.blocked, true);
      assert.ok(validation.reasons.some(r => r.includes("base64")));
    });

    it("should block '${IFS}' obfuscation", async () => {
      const executor = new SandboxExecutor();
      const validation = executor.validateCommand("cat${IFS}/etc/passwd");
      assert.equal(validation.blocked, true);
      assert.ok(validation.reasons.some(r => r.includes("IFS")));
    });
  });

  // ── Shell operator detection ────────────────────────────────────────────
  describe("shell operator detection", () => {
    it("should detect pipe operator and set usesShell=true", () => {
      const executor = new SandboxExecutor();
      const parsed = executor.parseCommand("ls -la | grep foo");
      assert.equal(parsed.usesShell, true);
      assert.ok(parsed.shellReason?.includes("pipe"));
    });

    it("should set shell=false for a simple command without operators", () => {
      const executor = new SandboxExecutor();
      const parsed = executor.parseCommand("ls -la");
      assert.equal(parsed.usesShell, false);
      assert.equal(parsed.shellReason, undefined);
    });

    it("should detect && operator", () => {
      const executor = new SandboxExecutor();
      const parsed = executor.parseCommand("echo hello && echo world");
      assert.equal(parsed.usesShell, true);
      assert.ok(parsed.shellReason?.includes("&&"));
    });

    it("should detect semicolon operator", () => {
      const executor = new SandboxExecutor();
      const parsed = executor.parseCommand("echo hello; echo world");
      assert.equal(parsed.usesShell, true);
    });
  });

  // ── Missing command ─────────────────────────────────────────────────────
  describe("missing command", () => {
    it("should return error for non-existent command", async () => {
      const executor = new SandboxExecutor();
      try {
        await executor.execute("this-command-definitely-does-not-exist-xyz123", 5000);
        assert.fail("Expected an error to be thrown");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assert.ok(msg.includes("ENOENT") || msg.includes("not found") || msg.includes("exited with code"),
          `Expected ENOENT or similar error, got: ${msg}`);
      }
    });
  });

  // ── Timeout enforcement ─────────────────────────────────────────────────
  describe("timeout enforcement", () => {
    it("should timeout a sleep command that exceeds 1s timeout", async () => {
      const executor = new SandboxExecutor();
      const start = Date.now();
      try {
        // Use a command that sleeps longer than the timeout
        await executor.execute("sleep 10", 1000);
        assert.fail("Expected a timeout error");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assert.ok(msg.includes("timed out"), `Expected timeout message, got: ${msg}`);
        const elapsed = Date.now() - start;
        // Should have timed out well before 10s
        assert.ok(elapsed < 5000, `Timeout took too long: ${elapsed}ms`);
      }
    });
  });

  // ── parseCommand structure ──────────────────────────────────────────────
  describe("parseCommand structure", () => {
    it("should correctly split command and args", () => {
      const executor = new SandboxExecutor();
      const parsed = executor.parseCommand("ls -la /tmp");
      assert.equal(parsed.command, "ls");
      assert.deepEqual(parsed.args, ["-la", "/tmp"]);
      assert.equal(parsed.raw, "ls -la /tmp");
    });

    it("should handle command with no args", () => {
      const executor = new SandboxExecutor();
      const parsed = executor.parseCommand("pwd");
      assert.equal(parsed.command, "pwd");
      assert.deepEqual(parsed.args, []);
    });

    it("should trim whitespace", () => {
      const executor = new SandboxExecutor();
      const parsed = executor.parseCommand("  ls -la  ");
      assert.equal(parsed.command, "ls");
    });
  });
});
