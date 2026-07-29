// ─── M.A.I. Response Parser ──────────────────────────────────────────────────
// Extracts ```action fenced code blocks from LLM responses.
// Each block contains a JSON object with an `action` discriminator field.
//
// Architecture: The LLM communicates actions through markdown fences.
// Everything else is treated as conversational text and streamed to the HUD.

import type { Action, ActionName, ParsedResponse, ActionResult } from "../types/index.js";

const VALID_ACTIONS: ActionName[] = [
  "execute-terminal",
  "read-file",
  "write-file",
  "append-file",
  "list-directory",
  "watch-directory",
  "get-system-info",
  "get-process-list",
  "open-url",
  "http-request",
  "emit-hud-update",
  "compact-memory",
];

// Regex: match ```action ... ``` blocks (greedy content capture)
const ACTION_BLOCK_REGEX = /```action\s*([\s\S]*?)```/g;

export class ResponseParser {
  /**
   * Parse a raw LLM response string into structured text + actions.
   *
   * - Extracts all ```action blocks as JSON actions
   * - Strips ALL code fences from the remaining text (reduces noise)
   * - Counts malformed blocks for debugging
   */
  static parseResponse(raw: string): ParsedResponse {
    const actions: Action[] = [];
    let malformedCount = 0;

    // Clone regex for reset
    const regex = new RegExp(ACTION_BLOCK_REGEX.source, ACTION_BLOCK_REGEX.flags);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw)) !== null) {
      const jsonStr = match[1].trim();

      if (!jsonStr) {
        malformedCount++;
        continue;
      }

      try {
        const parsed = JSON.parse(jsonStr);

        // Validate that it has an action discriminator
        if (typeof parsed.action === "string" && VALID_ACTIONS.includes(parsed.action as ActionName)) {
          actions.push(parsed as Action);
        } else {
          malformedCount++;
        }
      } catch {
        malformedCount++;
      }
    }

    // Strip all code blocks from the text portion (not just action blocks)
    const text = raw
      .replace(/```[\s\S]*?```/g, "")
      .replace(/```[\s\S]*$/g, "") // handle unclosed fence
      .trim();

    return { text, actions, malformedCount };
  }

  /**
   * Format an action result into a compact string suitable for
   * injecting back into the conversation as assistant context.
   * Truncates to 2000 characters to prevent context bloat.
   */
  static formatActionResult(action: Action, result: ActionResult): string {
    const label = `[${action.action}]`;
    if (result.ok) {
      const dataStr = typeof result.data === "string"
        ? result.data
        : JSON.stringify(result.data, null, 2);
      const truncated = dataStr.length > 2000
        ? dataStr.slice(0, 2000) + "... (truncated)"
        : dataStr;
      return `${label} Success:\n${truncated}`;
    } else {
      return `${label} Error: ${result.error || "Unknown error"}`;
    }
  }
}
