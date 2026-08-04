// ─── ResponseParser Tests ──────────────────────────────────────────────────
// Tests for src/core/ResponseParser.ts
//
// Run: npx tsx tests/response-parser.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { ResponseParser } = require(path.join(__dirname, "..", "src", "core", "ResponseParser.js")) as typeof import("../src/core/ResponseParser");

// Helper: build a fenced code block (backtick × 3)
const F = "\x60\x60\x60";

function actionBlock(json: string): string {
  return `${F}action\n${json}\n${F}`;
}

function codeBlock(lang: string, code: string): string {
  return `${F}${lang}\n${code}\n${F}`;
}

describe("ResponseParser", () => {
  // ── Single action block ─────────────────────────────────────────────────
  describe("parseResponse with a single action block", () => {
    it("should extract the action correctly", () => {
      const raw = `Here is my response.\n\n${actionBlock('{"action": "read-file", "path": "/tmp/test.txt"}')}\n\nDone.`;

      const result = ResponseParser.parseResponse(raw);

      assert.equal(result.actions.length, 1);
      assert.equal(result.actions[0].action, "read-file");
      assert.equal((result.actions[0] as { path?: string }).path, "/tmp/test.txt");
      assert.equal(result.malformedCount, 0);
      assert.ok(result.text.includes("Here is my response"));
      assert.ok(result.text.includes("Done."));
      assert.ok(!result.text.includes("read-file"));
    });
  });

  // ── Multiple action blocks ───────────────────────────────────────────────
  describe("parseResponse with multiple action blocks", () => {
    it("should extract all actions", () => {
      const raw = `I will read a file and then list a directory.\n\n${actionBlock('{"action": "read-file", "path": "/tmp/a.txt"}')}\n\nNow listing:\n\n${actionBlock('{"action": "list-directory", "path": "/tmp"}')}\n\nAll done.`;

      const result = ResponseParser.parseResponse(raw);

      assert.equal(result.actions.length, 2);
      assert.equal(result.actions[0].action, "read-file");
      assert.equal(result.actions[1].action, "list-directory");
      assert.equal(result.malformedCount, 0);
    });
  });

  // ── No action blocks ────────────────────────────────────────────────────
  describe("parseResponse with no action blocks", () => {
    it("should return text only with empty actions array", () => {
      const raw = "Just some plain text with no actions at all.";

      const result = ResponseParser.parseResponse(raw);

      assert.equal(result.text, raw);
      assert.equal(result.actions.length, 0);
      assert.equal(result.malformedCount, 0);
    });
  });

  // ── Malformed JSON inside action block ──────────────────────────────────
  describe("parseResponse with malformed JSON inside action block", () => {
    it("should increment malformedCount", () => {
      const raw = `Some text\n\n${actionBlock("{this is not valid json at all}")}\n\nMore text`;

      const result = ResponseParser.parseResponse(raw);

      assert.equal(result.actions.length, 0);
      assert.equal(result.malformedCount, 1);
    });
  });

  // ── Unknown action name ─────────────────────────────────────────────────
  describe("parseResponse with unknown action name", () => {
    it("should increment malformedCount", () => {
      const raw = actionBlock('{"action": "destroy-everything", "target": "/"}');

      const result = ResponseParser.parseResponse(raw);

      assert.equal(result.actions.length, 0);
      assert.equal(result.malformedCount, 1);
    });
  });

  // ── Nested / malformed fences ────────────────────────────────────────────
  describe("parseResponse with nested or malformed fences", () => {
    it("should handle gracefully (no crash)", () => {
      // Unclosed fence — regex won't match
      const raw1 = `${F}action\n{"action": "read-file", "path": "/tmp/x.txt"}`;
      const result1 = ResponseParser.parseResponse(raw1);
      assert.equal(result1.actions.length, 0);

      // Nested fences (non-greedy regex means inner fences don't interfere)
      const raw2 = `${actionBlock('{"action": "read-file", "path": "/tmp/y.txt"}')} more stuff\n${F}`;
      const result2 = ResponseParser.parseResponse(raw2);
      assert.ok(result2.text !== undefined);

      // Empty action block
      const raw3 = `${F}action\n\n${F}`;
      const result3 = ResponseParser.parseResponse(raw3);
      assert.equal(result3.actions.length, 0);
      assert.equal(result3.malformedCount, 1);
    });
  });

  // ── Code blocks that are NOT action blocks ───────────────────────────────
  describe("parseResponse with non-action code blocks", () => {
    it("should strip code blocks from text", () => {
      const raw = `Here is some code:\n\n${codeBlock("javascript", 'console.log("hello");')}\n\nAnd some more text.`;

      const result = ResponseParser.parseResponse(raw);

      assert.equal(result.actions.length, 0);
      assert.equal(result.malformedCount, 0);
      assert.ok(!result.text.includes("console.log"));
      assert.ok(!result.text.includes("javascript"));
      assert.ok(result.text.includes("Here is some code:"));
      assert.ok(result.text.includes("And some more text."));
    });
  });

  // ── formatActionResult ────────────────────────────────────────────────────
  describe("formatActionResult", () => {
    it("should truncate data strings longer than 2000 characters", () => {
      const action = { action: "read-file" as const, path: "/tmp/large.txt" };
      const longData = "x".repeat(3000);
      const result = { ok: true as const, data: longData };

      const formatted = ResponseParser.formatActionResult(action, result);

      assert.ok(formatted.includes("... (truncated)"));
      assert.ok(formatted.length < 2500);
    });

    it("should not truncate data shorter than 2000 characters", () => {
      const action = { action: "read-file" as const, path: "/tmp/small.txt" };
      const shortData = "hello world";
      const result = { ok: true as const, data: shortData };

      const formatted = ResponseParser.formatActionResult(action, result);

      assert.ok(!formatted.includes("... (truncated)"));
      assert.ok(formatted.includes("hello world"));
    });

    it("should format ok=true with Success label", () => {
      const action = { action: "list-directory" as const, path: "/tmp" };
      const result = { ok: true as const, data: "file1.txt\nfile2.txt" };

      const formatted = ResponseParser.formatActionResult(action, result);

      assert.ok(formatted.startsWith("[list-directory]"));
      assert.ok(formatted.includes("Success:"));
      assert.ok(formatted.includes("file1.txt"));
    });

    it("should format ok=false with Error label", () => {
      const action = { action: "write-file" as const, path: "/tmp/x.txt" };
      const result = { ok: false as const, error: "Permission denied" };

      const formatted = ResponseParser.formatActionResult(action, result);

      assert.ok(formatted.startsWith("[write-file]"));
      assert.ok(formatted.includes("Error:"));
      assert.ok(formatted.includes("Permission denied"));
    });

    it("should stringify object data", () => {
      const action = { action: "get-system-info" as const };
      const result = { ok: true as const, data: { cpu: "Intel", cores: 8 } };

      const formatted = ResponseParser.formatActionResult(action, result);

      assert.ok(formatted.includes("Intel"));
      assert.ok(formatted.includes("8"));
    });

    it("should handle error with no message", () => {
      const action = { action: "read-file" as const };
      const result = { ok: false as const };

      const formatted = ResponseParser.formatActionResult(action, result);

      assert.ok(formatted.includes("Unknown error"));
    });
  });
});
