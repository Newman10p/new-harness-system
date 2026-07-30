// ─── M.A.I. Audit Logger ───────────────────────────────────────────────────
// Persistent append-only audit log of all significant system events.
// Written as markdown for human readability + git-trackability.
//
// Log entries are appended to state/audit.log.md with timestamps.
// Capped at 2000 entries to prevent unbounded growth.

import fs from "node:fs/promises";
import path from "node:path";
import { AUDIT_LOG_PATH } from "../core/constants.js";
import type { AuditEntry, AuditLogger } from "../types/index.js";

const MAX_ENTRIES = 2000;
const TRIM_TO = 1500;

let lineCount = 0;

/**
 * Initialize the audit log. Reads existing file to count lines.
 */
export async function initAuditLog(): Promise<AuditLogger> {
  try {
    const content = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    lineCount = content.split("\n").filter((l) => l.trim()).length;
  } catch {
    lineCount = 0;
  }

  return auditLog;
}

/**
 * Write an audit entry to the persistent log.
 * Each entry is a single markdown-formatted line.
 */
async function auditLog(entry: AuditEntry): Promise<void> {
  const typeIcons: Record<string, string> = {
    action_executed: "✓",
    action_blocked: "🚫",
    action_approved: "✓ APPROVED",
    action_denied: "✗ DENIED",
    action_timeout: "⏱ TIMEOUT",
    llm_call: "→",
    llm_error: "⚠ LLM ERROR",
    policy_loaded: "📋",
  };

  const ts = entry.timestamp ?? new Date().toISOString();
  const icon = typeIcons[entry.type] ?? "•";
  const duration = entry.durationMs ? ` (${Math.round(entry.durationMs)}ms)` : "";
  const status = entry.ok === true ? "" : entry.ok === false ? " [FAILED]" : "";
  const actionTag = entry.action ? ` [${entry.action}]` : "";

  const line = `- [${ts}] ${icon}${actionTag}${status} ${entry.detail}${duration}\n`;

  try {
    await fs.mkdir(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    await fs.appendFile(AUDIT_LOG_PATH, line, "utf-8");
    lineCount++;

    // Trim if too long
    if (lineCount > MAX_ENTRIES) {
      const content = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
      const lines = content.split("\n");
      const trimmed = lines.slice(lines.length - TRIM_TO).join("\n");
      await fs.writeFile(AUDIT_LOG_PATH, trimmed, "utf-8");
      lineCount = TRIM_TO;
    }
  } catch {
    // Audit logging should never crash the system
  }
}

/**
 * Read the last N entries from the audit log.
 */
export async function readAuditLog(n: number = 50): Promise<string> {
  try {
    const content = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.trim());
    return lines.slice(-n).join("\n");
  } catch {
    return "(no audit entries)";
  }
}
