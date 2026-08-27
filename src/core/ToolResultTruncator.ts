// ─── M.A.I. Tool Result Truncator ──────────────────────────────────────────
// Adapted from Pi: Every tool that returns text has output truncation.
//
//   - Head truncation: keeps the LAST N lines (most useful for LLM context)
//   - Configurable limits: max lines and max bytes
//   - Full output saved to temp file, path included in truncated result

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { AgentLoopConfig } from "../types/index.js";
import { DEFAULT_LOOP_CONFIG } from "../types/index.js";

const TEMP_DIR = path.join(os.tmpdir(), "mai-tool-results");

export interface TruncationResult {
  /** The (possibly truncated) text to send to the LLM. */
  text: string;
  /** Whether truncation occurred. */
  truncated: boolean;
  /** Path to the full output file, if saved. */
  fullPath?: string;
  /** Original length before truncation. */
  originalLength: number;
}

/**
 * Truncate a tool result to fit within context limits.
 * Keeps the HEAD (first lines) plus a note about how much was cut,
 * AND saves the full output to a temp file for reference.
 */
export function truncateToolResult(
  text: string,
  config: AgentLoopConfig = DEFAULT_LOOP_CONFIG
): TruncationResult {
  const originalLength = text.length;

  // Check byte limit
  if (text.length <= config.maxToolResultChars) {
    // Still check line limit
    const lines = text.split("\n");
    if (lines.length <= config.maxToolResultLines) {
      return { text, truncated: false, originalLength };
    }
  }

  // Need truncation — keep head lines
  const lines = text.split("\n");
  const headLines = Math.max(10, Math.floor(config.maxToolResultLines * 0.7));
  const tailLines = Math.floor(config.maxToolResultLines * 0.3);

  let truncatedText: string;
  const cutCount = lines.length - headLines - tailLines;

  if (tailLines > 0 && lines.length > headLines + tailLines) {
    truncatedText = [
      ...lines.slice(0, headLines),
      `\n... [${cutCount} lines truncated — full output saved to temp file] ...\n`,
      ...lines.slice(-tailLines),
    ].join("\n");
  } else {
    truncatedText = lines.slice(0, headLines).join("\n");
    if (lines.length > headLines) {
      truncatedText += `\n... [${lines.length - headLines} lines truncated]`;
    }
  }

  // Also enforce char limit
  if (truncatedText.length > config.maxToolResultChars) {
    truncatedText = truncatedText.slice(0, config.maxToolResultChars) +
      "\n... [output exceeds " + config.maxToolResultChars + " char limit]";
  }

  return { text: truncatedText, truncated: true, originalLength };
}

/**
 * Save full tool output to a temp file and return the path.
 * Used alongside truncation so the agent can reference the full output.
 */
export async function saveFullToolResult(
  toolName: string,
  fullText: string
): Promise<string> {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    const id = crypto.randomBytes(8).toString("hex");
    const filePath = path.join(TEMP_DIR, `${toolName}_${id}.txt`);
    await fs.writeFile(filePath, fullText, "utf-8");
    return filePath;
  } catch {
    return ""; // Non-fatal
  }
}

/**
 * Format a tool result for the LLM context, with truncation applied.
 */
export async function formatToolResult(
  toolName: string,
  result: string,
  config: AgentLoopConfig = DEFAULT_LOOP_CONFIG
): Promise<string> {
  const truncation = truncateToolResult(result, config);

  let output = `[${toolName}]`;
  if (truncation.truncated) {
    const savedPath = await saveFullToolResult(toolName, result);
    output += ` (truncated: ${truncation.originalLength} chars → ${truncation.text.length} chars)`;
    if (savedPath) {
      output += ` [full output: ${savedPath}]`;
    }
  }
  output += `\n${truncation.text}`;

  return output;
}
