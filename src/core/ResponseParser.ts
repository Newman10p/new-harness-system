// ─── M.A.I. Response Parser ──────────────────────────────────────────────────
// Extracts ```action fenced code blocks from LLM responses.
// Each block contains a JSON object with an `action` discriminator field.
//
// Architecture: The LLM communicates actions through markdown fences.
// Everything else is treated as conversational text and streamed to the HUD.

import type { Action, ActionName, ParsedResponse, ActionResult } from "../types/index.js";
import type { NativeToolCall } from "./MultiProvider.js";
import { getToolSchemaNames } from "./ToolSchema.js";

// Import all valid action names from the type system (single source of truth)
const VALID_ACTIONS: ActionName[] = [
  "execute-terminal", "read-file", "write-file", "append-file",
  "list-directory", "watch-directory", "get-system-info", "get-process-list",
  "open-url", "http-request", "emit-hud-update", "compact-memory",
  "run-skill", "schedule-task", "screenshot-capture", "clipboard-read",
  "clipboard-write", "open-application", "search-files", "get-gpu-info",
  "get-network-info", "manage-processes", "voice-call", "list-files-detailed",
  "semantic-recall", "self-modify", "self-evaluate", "self-diagnose",
  "self-repair", "adaptive-config", "remember", "recall", "forget",
  "profile-update", "learn-pattern", "create-skill", "optimize-skill",
  "rollback", "control-window", "input-inject", "system-setting",
  "media-control", "screen-arrange", "notification-send", "dry-run",
  "run-macro", "search-conversations",
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

  /**
   * Parse native OpenAI tool_calls into structured Actions.
   *
   * Each tool_call has a `function.name` (matching the action name) and
   * `function.arguments` (raw JSON string of the action parameters).
   *
   * - Parses the arguments JSON for each tool call
   * - Validates the action name against VALID_ACTIONS and the tool schema set
   * - Injects the `action` discriminator field so the result matches the
   *   standard Action interface expected by the rest of the pipeline
   * - Returns a ParsedResponse with the actions array (text is empty — any
   *   accompanying text from the LLM is handled separately in the loop)
   */
  static parseToolCalls(toolCalls: NativeToolCall[]): ParsedResponse {
    const actions: Action[] = [];
    let malformedCount = 0;

    const schemaNames = getToolSchemaNames();

    for (const tc of toolCalls) {
      // Validate that the tool name is a known action
      if (!VALID_ACTIONS.includes(tc.name as ActionName)) {
        console.warn(
          `[ResponseParser] Native tool_call references unknown action: "${tc.name}". Skipping.`
        );
        malformedCount++;
        continue;
      }

      // Also validate it's one of our tool-schematized actions
      // (Non-schematized actions could come from the LLM hallucinating extra tools)
      if (!schemaNames.has(tc.name)) {
        console.warn(
          `[ResponseParser] Native tool_call "${tc.name}" has no tool schema. Skipping (will be handled via regex if needed).`
        );
        malformedCount++;
        continue;
      }

      // Parse the arguments JSON
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(tc.arguments) as Record<string, unknown>;
      } catch (err) {
        console.warn(
          `[ResponseParser] Failed to parse arguments for tool_call "${tc.name}": ${err instanceof Error ? err.message : String(err)}`
        );
        malformedCount++;
        continue;
      }

      // Build a standard Action by merging the `action` discriminator with params
      const action: Action = {
        action: tc.name as ActionName,
        ...parsedArgs,
      };

      actions.push(action);
    }

    return {
      text: "",
      actions,
      malformedCount,
    };
  }
}
