// ─── self-modify ───────────────────────────────────────────────────────────
// Allows M.A.I. to modify its own brain files (identity, context, inbox,
// memory, skills, catalog). Enforces a strict whitelist, creates backups
// before every modification, and logs every change to the audit trail.
// Now includes diff generation for pre-approval review.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const ROOT = process.cwd();

// Allowed target prefixes (relative to project root)
const ALLOWED_PREFIXES = [
  "agent/identity.md",
  "memory/context.md",
  "state/inbox.md",
  "state/",
  "memory/",
  "skills/",
  "agent/tools/catalog.md",
];

// Never allow modification of these paths
const FORBIDDEN_PATHS = [
  "agent/policy.md",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
  "node_modules/",
];

const VALID_OPERATIONS = ["append", "replace", "insert_before", "insert_after", "remove_section"] as const;
type ValidOperation = (typeof VALID_OPERATIONS)[number];

// Operations that modify existing file content (require diff)
const MODIFYING_OPERATIONS = new Set<ValidOperation>([
  "append",
  "replace",
  "insert_before",
  "insert_after",
  "remove_section",
]);

function isAllowed(target: string): boolean {
  const normalized = target.replace(/\\/g, "/");

  // Check forbidden paths first
  for (const forbidden of FORBIDDEN_PATHS) {
    if (normalized === forbidden || normalized.startsWith(forbidden + "/")) {
      return false;
    }
  }

  // Check if target matches any allowed prefix
  for (const prefix of ALLOWED_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

async function createBackup(filePath: string): Promise<string | null> {
  try {
    const backupDir = path.join(ROOT, "state", "backups");
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const relativePath = path.relative(ROOT, filePath);
    const backupName = `${timestamp}--${relativePath.replace(/\//g, "_")}`;
    const backupPath = path.join(backupDir, backupName);

    const content = await fs.readFile(filePath, "utf-8");
    await fs.writeFile(backupPath, content, "utf-8");
    return backupPath;
  } catch {
    return null;
  }
}

function findSectionMarker(content: string, marker: string): number {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Match markdown headings (## or ###) containing the marker text
    if (/^#{1,4}\s+/.test(trimmed) && trimmed.toLowerCase().includes(marker.toLowerCase())) {
      return i;
    }
  }
  return -1;
}

function findSectionEnd(content: string, startLine: number): number {
  const lines = content.split("\n");
  const startLevel = (lines[startLine].match(/^#+/) || [""])[0].length;

  for (let i = startLine + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#+)\s+/);
    if (match && match[1].length <= startLevel) {
      return i;
    }
  }
  return lines.length;
}

// ── Unified diff generation ─────────────────────────────────────────────────

function generateDiff(original: string, modified: string, filename: string): string {
  const oldLines = original.split("\n");
  const newLines = modified.split("\n");
  const header = [
    `--- a/${filename}`,
    `+++ b/${filename}`,
  ];

  // Simple LCS-based diff for unified output
  const diffLines = computeUnifiedDiff(oldLines, newLines);
  return header.join("\n") + "\n" + diffLines.join("\n");
}

function computeUnifiedDiff(oldLines: string[], newLines: string[]): string[] {
  // Build a simple Myers-like diff using LCS on lines
  const n = oldLines.length;
  const m = newLines.length;

  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to get the diff
  const result: string[] = [];
  let i = n;
  let j = m;
  const operations: Array<{ type: "keep" | "remove" | "add"; oldIdx?: number; newIdx?: number; line: string }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      operations.push({ type: "keep", oldIdx: i - 1, newIdx: j - 1, line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      operations.push({ type: "add", newIdx: j - 1, line: newLines[j - 1] });
      j--;
    } else {
      operations.push({ type: "remove", oldIdx: i - 1, line: oldLines[i - 1] });
      i--;
    }
  }

  operations.reverse();

  // Generate unified diff hunks
  let contextStart = 0;
  let inHunk = false;
  let hunkOldStart = 0;
  let hunkOldCount = 0;
  let hunkNewStart = 0;
  let hunkNewCount = 0;
  let hunkLines: string[] = [];
  const CONTEXT = 3;

  function flushHunk(): void {
    if (hunkLines.length > 0) {
      result.push(`@@ -${hunkOldStart},${hunkOldCount} +${hunkNewStart},${hunkNewCount} @@`);
      result.push(...hunkLines);
      hunkLines = [];
    }
  }

  for (let idx = 0; idx < operations.length; idx++) {
    const op = operations[idx];
    const isChange = op.type === "remove" || op.type === "add";

    if (isChange && !inHunk) {
      // Start a new hunk with trailing context
      flushHunk();
      inHunk = true;
      const ctxBefore = Math.max(0, idx - CONTEXT);
      hunkOldStart = (op.oldIdx ?? op.newIdx ?? 0) - (idx - ctxBefore) + 1;
      hunkNewStart = (op.newIdx ?? op.oldIdx ?? 0) - (idx - ctxBefore) + 1;
      hunkOldCount = 0;
      hunkNewCount = 0;
      // Add context lines before the change
      for (let c = ctxBefore; c < idx; c++) {
        hunkLines.push(` ${operations[c].line}`);
        hunkOldCount++;
        hunkNewCount++;
      }
    }

    if (inHunk) {
      if (op.type === "keep") {
        hunkLines.push(` ${op.line}`);
        hunkOldCount++;
        hunkNewCount++;
      } else if (op.type === "remove") {
        hunkLines.push(`-${op.line}`);
        hunkOldCount++;
      } else if (op.type === "add") {
        hunkLines.push(`+${op.line}`);
        hunkNewCount++;
      }

      // Check if we need to close the hunk (trailing context reached)
      let changesAhead = false;
      for (let k = idx + 1; k < Math.min(operations.length, idx + CONTEXT + 1); k++) {
        if (operations[k].type !== "keep") {
          changesAhead = true;
          break;
        }
      }
      if (!changesAhead) {
        // Add trailing context
        let ctxAdded = 0;
        for (let k = idx + 1; k < operations.length && ctxAdded < CONTEXT; k++) {
          if (operations[k].type === "keep") {
            hunkLines.push(` ${operations[k].line}`);
            hunkOldCount++;
            hunkNewCount++;
            ctxAdded++;
            idx = k; // advance the outer loop
          } else {
            break;
          }
        }
        flushHunk();
        inHunk = false;
      }
    }
  }

  flushHunk();
  return result;
}

// ── Main self-modify function ───────────────────────────────────────────────

export async function selfModify(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const target = String(action.target ?? "").trim();
  const operation = String(action.operation ?? "").trim() as ValidOperation;
  const content = String(action.content ?? "");
  const sectionMarker = String(action.section_marker ?? "").trim();

  if (!target) {
    return { ok: false, error: "Missing required field: target" };
  }
  if (!operation || !VALID_OPERATIONS.includes(operation)) {
    return { ok: false, error: `Invalid operation: ${operation}. Valid: ${VALID_OPERATIONS.join(", ")}` };
  }

  const normalizedTarget = target.replace(/\\/g, "/");

  if (!isAllowed(normalizedTarget)) {
    return {
      ok: false,
      error: `Target not in allowed list: ${target}. Allowed prefixes: ${ALLOWED_PREFIXES.join(", ")}`,
    };
  }

  const fullPath = path.resolve(ROOT, normalizedTarget);

  try {
    // Create backup if file exists
    let backupPath: string | null = null;
    let originalContent = "";
    try {
      originalContent = await fs.readFile(fullPath, "utf-8");
      backupPath = await createBackup(fullPath);
    } catch {
      // File doesn't exist — no backup needed for new files
    }

    // Ensure parent directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Execute the operation
    let result: string;

    switch (operation) {
      case "append": {
        const existing = await fs.readFile(fullPath, "utf-8").catch(() => "");
        result = existing + (existing.endsWith("\n") ? "" : "\n") + content;
        await fs.writeFile(fullPath, result, "utf-8");
        break;
      }
      case "replace": {
        if (!content && operation === "replace") {
          return { ok: false, error: "replace operation requires content" };
        }
        await fs.writeFile(fullPath, content, "utf-8");
        result = content;
        break;
      }
      case "insert_before": {
        if (!sectionMarker) {
          return { ok: false, error: "insert_before requires section_marker" };
        }
        const existing = await fs.readFile(fullPath, "utf-8").catch(() => "");
        const lineIdx = findSectionMarker(existing, sectionMarker);
        if (lineIdx === -1) {
          return { ok: false, error: `Section marker not found: ${sectionMarker}` };
        }
        const lines = existing.split("\n");
        lines.splice(lineIdx, 0, content);
        result = lines.join("\n");
        await fs.writeFile(fullPath, result, "utf-8");
        break;
      }
      case "insert_after": {
        if (!sectionMarker) {
          return { ok: false, error: "insert_after requires section_marker" };
        }
        const existing = await fs.readFile(fullPath, "utf-8").catch(() => "");
        const lineIdx = findSectionMarker(existing, sectionMarker);
        if (lineIdx === -1) {
          return { ok: false, error: `Section marker not found: ${sectionMarker}` };
        }
        // Find end of section so we insert after it
        const sectionEnd = findSectionEnd(existing, lineIdx);
        const lines = existing.split("\n");
        lines.splice(sectionEnd, 0, content);
        result = lines.join("\n");
        await fs.writeFile(fullPath, result, "utf-8");
        break;
      }
      case "remove_section": {
        if (!sectionMarker) {
          return { ok: false, error: "remove_section requires section_marker" };
        }
        const existing = await fs.readFile(fullPath, "utf-8").catch(() => "");
        const lineIdx = findSectionMarker(existing, sectionMarker);
        if (lineIdx === -1) {
          return { ok: false, error: `Section marker not found: ${sectionMarker}` };
        }
        const sectionEnd = findSectionEnd(existing, lineIdx);
        const lines = existing.split("\n");
        lines.splice(lineIdx, sectionEnd - lineIdx);
        result = lines.join("\n");
        await fs.writeFile(fullPath, result, "utf-8");
        break;
      }
      default:
        return { ok: false, error: `Unhandled operation: ${operation}` };
    }

    // Generate diff for modifying operations on existing files
    let diff: string | undefined;
    if (MODIFYING_OPERATIONS.has(operation) && originalContent !== "") {
      diff = generateDiff(originalContent, result, normalizedTarget);

      // Emit bg_activity event with diff preview
      ctx.emitHud("bg_activity", {
        id: `self-modify-${Date.now()}`,
        action: "self-modify-preview",
        status: "completed",
        detail: `Modified ${normalizedTarget} (${operation})`,
        result: diff.length > 2000 ? diff.slice(0, 2000) + "\n... (truncated)" : diff,
      });
    }

    // Emit HUD event
    ctx.emitHud("activity_log", {
      message: `Self-modified ${normalizedTarget} (${operation})`,
      level: "info",
    });

    await ctx.audit({
      type: "action_executed",
      action: "self-modify",
      detail: `Modified ${normalizedTarget} with operation=${operation}, section_marker=${sectionMarker || "(none)"}, backup=${backupPath || "(new file)"}`,
      ok: true,
    });

    const responseData: Record<string, unknown> = {
      target: normalizedTarget,
      operation,
      section_marker: sectionMarker || null,
      backup: backupPath,
      new_size: result.length,
    };

    // Include diff in response data if generated
    if (diff !== undefined) {
      responseData.diff = diff;
    }

    return {
      ok: true,
      data: responseData,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.audit({
      type: "action_executed",
      action: "self-modify",
      detail: `Failed to modify ${normalizedTarget}: ${message}`,
      ok: false,
    });
    return { ok: false, error: `Self-modify failed: ${message}` };
  }
}
