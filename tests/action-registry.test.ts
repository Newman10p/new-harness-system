// ─── ActionRegistry Tests ────────────────────────────────────────────────
// Tests for src/actions/index.ts
//
// Run: npx tsx tests/action-registry.test.ts
//
// NOTE: This test uses direct ESM imports because ActionRegistry internally
// uses createRequire(import.meta.url) for lazy primitives, which doesn't
// work when the module itself is loaded via require().

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ActionRegistry } from "../src/actions/index.ts";

// Minimal action context for tests
function makeTestCtx() {
  return {
    emitHud: () => {},
    appendInbox: async () => {},
    audit: async () => {},
  };
}

describe("ActionRegistry", () => {
  let registry: InstanceType<typeof ActionRegistry>;

  beforeEach(() => {
    registry = new ActionRegistry();
  });

  // ── Constructor registers expected core actions ─────────────────────────
  describe("constructor registers expected core actions", () => {
    it("should register at least 25 core actions", () => {
      const actions = registry.listActions();
      assert.ok(actions.length >= 25, `Expected at least 25 actions, got ${actions.length}`);
    });

    it("should include essential core primitives", () => {
      const actions = registry.listActions();

      const essential = [
        "execute-terminal",
        "read-file",
        "write-file",
        "list-directory",
        "get-system-info",
        "get-process-list",
        "http-request",
        "open-url",
        "search-files",
      ];

      for (const name of essential) {
        assert.ok(actions.includes(name), `Missing essential action: ${name}`);
      }
    });

    it("should include web-search and web-scrape", () => {
      const actions = registry.listActions();
      assert.ok(actions.includes("web-search"), "Missing web-search");
      assert.ok(actions.includes("web-scrape"), "Missing web-scrape");
    });
  });

  // ── listActions returns sorted array ─────────────────────────────────────
  describe("listActions()", () => {
    it("should return a sorted array", () => {
      const actions = registry.listActions();
      const sorted = [...actions].sort();
      assert.deepEqual(Array.from(actions), sorted);
    });

    it("should return consistent results across calls", () => {
      const actions = registry.listActions();
      const actions2 = registry.listActions();
      assert.deepEqual(Array.from(actions), Array.from(actions2));
    });
  });

  // ── has() for known and unknown actions ──────────────────────────────────
  describe("has()", () => {
    it("should return true for a known action", () => {
      assert.ok(registry.has("read-file"));
      assert.ok(registry.has("write-file"));
      assert.ok(registry.has("get-system-info"));
    });

    it("should return false for an unknown action", () => {
      assert.ok(!registry.has("nonexistent-action"));
      assert.ok(!registry.has(""));
      assert.ok(!registry.has("destroy-everything"));
    });
  });

  // ── execute() unknown action ─────────────────────────────────────────────
  describe("execute() with unknown action", () => {
    it("should return {ok: false, error: 'Unknown action: ...'}", async () => {
      const ctx = makeTestCtx();
      const result = await registry.execute(
        { action: "absolutely-not-a-real-action-xyz" },
        ctx as never
      );

      assert.equal(result.ok, false);
      assert.ok(result.error?.includes("Unknown action"),
        `Expected 'Unknown action' in error, got: ${result.error}`);
    });
  });

  // ── execute() with read-only action (get-system-info) ────────────────────
  describe("execute() with get-system-info", () => {
    it("should return ok: true with system data", async () => {
      const ctx = makeTestCtx();
      const result = await registry.execute(
        { action: "get-system-info" },
        ctx as never
      );

      assert.equal(result.ok, true, `Expected ok:true, got error: ${result.error}`);
      assert.ok(result.data !== undefined, "Expected data to be defined");

      // Verify the data has expected fields
      const data = result.data as Record<string, unknown>;
      assert.ok("hostname" in data || "platform" in data || "cpu" in data,
        "Expected system info fields in data");
    });
  });
});
