// ─── Web Search Smoke Tests ──────────────────────────────────────────
// Smoke test for the DuckDuckGo search backend (src/actions/primitives/web-search.ts)
//
// Run: npx tsx tests/web-search-smoke.test.ts
//
// IMPORTANT: This is a smoke test against live DuckDuckGo. It may fail if
// DDG is down, rate-limited, or the HTML structure changes. That's OK.
// Marked with { skip: false } so it runs by default but is clearly labeled.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { webSearch } from "../src/actions/primitives/web-search.ts";
import type { Action, ActionContext, ActionResult } from "../src/types/index.ts";

// Minimal action context
function makeTestCtx(): ActionContext {
  return {
    emitHud: () => {},
    appendInbox: async () => {},
    audit: async () => {},
  };
}

describe("Web Search (DuckDuckGo smoke test)", { skip: false }, () => {
  // ── Search for "TypeScript 5.0" ────────────────────────────────────────
  describe("search for 'TypeScript 5.0'", () => {
    let result: ActionResult;

    it("should return ok: true", async () => {
      const action: Action = { action: "web-search", query: "TypeScript 5.0" };
      result = await webSearch(action, makeTestCtx());

      assert.equal(result.ok, true, `Expected ok:true, got: ${result.error}`);
    });

    it("results should contain title, url, snippet fields", () => {
      assert.ok(result.ok, "Previous test should have passed");
      const data = result.data as {
        results: Array<{ title: string; url: string; snippet: string }>;
      };

      assert.ok(Array.isArray(data.results), "Expected results to be an array");
      if (data.results.length > 0) {
        const first = data.results[0];
        assert.ok("title" in first, "First result should have title");
        assert.ok("url" in first, "First result should have url");
        assert.ok("snippet" in first, "First result should have snippet");
      }
    });

    it("should have at least 1 result", () => {
      assert.ok(result.ok, "Previous test should have passed");
      const data = result.data as { total: number; results: unknown[] };
      assert.ok(data.total >= 1, `Expected at least 1 result, got ${data.total}`);
      assert.ok(data.results.length >= 1, `Expected results array length >= 1, got ${data.results.length}`);
    });

    it("engine should be 'duckduckgo'", () => {
      assert.ok(result.ok, "Previous test should have passed");
      const data = result.data as { engine: string };
      assert.equal(data.engine, "duckduckgo", `Expected engine 'duckduckgo', got '${data.engine}'`);
    });
  });

  // ── Timeout: nonsensical query ──────────────────────────────────────────
  describe("nonsensical query should complete within timeout", () => {
    it("should complete without timing out (30s)", async () => {
      const action: Action = {
        action: "web-search",
        query: "zzzzzxyxyzxyznonexistentquery123456789",
      };

      const start = Date.now();
      const result = await webSearch(action, makeTestCtx());
      const elapsed = Date.now() - start;

      // Should complete within 30 seconds
      assert.ok(elapsed < 30_000, `Search took too long: ${elapsed}ms`);

      // Even with a nonsensical query, the search should not crash
      // It may return ok:false with no results, which is acceptable
      assert.ok(result !== undefined, "Result should be defined");
      assert.ok("ok" in result, "Result should have 'ok' field");
    });
  });
});
