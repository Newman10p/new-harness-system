// ─── rollback ───────────────────────────────────────────
// Reverts a file to a previous state using backups in state/backups/.
// Supports dry-run mode, listing available backups, auto-selection
// of the most recent backup, backup rotation (max 50 per target),
// diff_from_current in listings, and compare operation.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, "state", "backups");
const MAX_BACKUPS_PER_TARGET = 50;
const DIFF_TRUNCATE_LENGTH = 1000;

interface BackupEntry {
  id: string;
  filename: string;
  target: string;
  created: string;
  size: number;
  diff_from_current?: string;
}

// ── Unified diff (shared logic) ─────────────────────────────────────────────

function generateUnifiedDiff(oldLines: string[], newLines: string[]): string {
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

  // Backtrack
  const operations: Array<{ type: "keep" | "remove" | "add"; line: string }> = [];
  let ii = n;
  let jj = m;
  while (ii > 0 || jj > 0) {
    if (ii > 0 && jj > 0 && oldLines[ii - 1] === newLines[jj - 1]) {
      operations.push({ type: "keep", line: oldLines[ii - 1] });
      ii--; jj--;
    } else if (jj > 0 && (ii === 0 || dp[ii][jj - 1] >= dp[ii - 1][jj])) {
      operations.push({ type: "add", line: newLines[jj - 1] });
      jj--;
    } else {
      operations.push({ type: "remove", line: oldLines[ii - 1] });
      ii--;
    }
  }
  operations.reverse();

  // Generate hunks
  const result: string[] = [];
  const CONTEXT = 3;
  let inHunk = false;
  let hunkOldStart = 0;
  let hunkOldCount = 0;
  let hunkNewStart = 0;
  let hunkNewCount = 0;
  let hunkLines: string[] = [];
  let opIdx = 0;
  let oldLineNum = 1;
  let newLineNum = 1;

  function flushHunk(): void {
    if (hunkLines.length > 0) {
      result.push(`@@ -${hunkOldStart},${hunkOldCount} +${hunkNewStart},${hunkNewCount} @@`);
      result.push(...hunkLines);
      hunkLines = [];
    }
  }

  while (opIdx < operations.length) {
    const op = operations[opIdx];
    const isChange = op.type !== "keep";

    if (isChange && !inHunk) {
      flushHunk();
      inHunk = true;
      // Find the current line numbers
      const currentOld = op.type === "remove" ? oldLineNum : oldLineNum;
      const currentNew = op.type === "add" ? newLineNum : newLineNum;
      hunkOldStart = Math.max(1, currentOld - CONTEXT);
      hunkNewStart = Math.max(1, currentNew - CONTEXT);
      hunkOldCount = 0;
      hunkNewCount = 0;
      // Add leading context
      const ctxStart = Math.max(0, opIdx - CONTEXT);
      for (let c = ctxStart; c < opIdx; c++) {
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
        oldLineNum++;
        newLineNum++;
      } else if (op.type === "remove") {
        hunkLines.push(`-${op.line}`);
        hunkOldCount++;
        oldLineNum++;
      } else {
        hunkLines.push(`+${op.line}`);
        hunkNewCount++;
        newLineNum++;
      }

      // Check for trailing context
      let changesAhead = false;
      for (let k = opIdx + 1; k < Math.min(operations.length, opIdx + CONTEXT + 1); k++) {
        if (operations[k].type !== "keep") {
          changesAhead = true;
          break;
        }
      }
      if (!changesAhead) {
        let ctxAdded = 0;
        for (let k = opIdx + 1; k < operations.length && ctxAdded < CONTEXT; k++) {
          if (operations[k].type === "keep") {
            hunkLines.push(` ${operations[k].line}`);
            hunkOldCount++;
            hunkNewCount++;
            oldLineNum++;
            newLineNum++;
            ctxAdded++;
            opIdx = k;
          } else {
            break;
          }
        }
        flushHunk();
        inHunk = false;
      }
    } else {
      if (op.type === "keep") {
        oldLineNum++;
        newLineNum++;
      }
    }
    opIdx++;
  }

  flushHunk();
  return result.join("\n");
}

function diffStrings(original: string, modified: string, filename: string, truncate?: number): string {
  const oldLines = original.split("\n");
  const newLines = modified.split("\n");
  const body = generateUnifiedDiff(oldLines, newLines);
  const full = `--- a/${filename}\n+++ b/${filename}\n${body}`;
  if (truncate !== undefined && full.length > truncate) {
    return full.slice(0, truncate) + "\n... (truncated)";
  }
  return full;
}

// ── Backup rotation ─────────────────────────────────────────────────────────

async function rotateBackups(target: string): Promise<void> {
  try {
    const entries = await fs.readdir(BACKUP_DIR);
    const normalizedTarget = target.replace(/\\/g, "/");
    const matching: string[] = [];

    for (const entry of entries) {
      const match = entry.match(/^\d{4}-\d{2}-\d{2}T[^-]+--(.+)$/);
      if (!match) continue;
      const originalTarget = match[1].replace(/_/g, "/");
      if (originalTarget === normalizedTarget || originalTarget.endsWith("/" + normalizedTarget)) {
        matching.push(entry);
      }
    }

    if (matching.length <= MAX_BACKUPS_PER_TARGET) return;

    // Sort by filename (ISO timestamp) ascending — oldest first
    matching.sort((a, b) => a.localeCompare(b));

    // Delete oldest backups to get down to limit
    const toDelete = matching.length - MAX_BACKUPS_PER_TARGET;
    for (let i = 0; i < toDelete; i++) {
      await fs.unlink(path.join(BACKUP_DIR, matching[i])).catch(() => {});
    }
  } catch {
    // Rotation is best-effort
  }
}

// ── List backups ────────────────────────────────────────────────────────────

async function listBackups(target?: string, includeDiff = false): Promise<BackupEntry[]> {
  try {
    const entries = await fs.readdir(BACKUP_DIR);
    const backups: BackupEntry[] = [];

    for (const entry of entries) {
      // Filename format: 2025-01-15T10-30-00Z--memory_context.md
      const match = entry.match(/^(\d{4}-\d{2}-\d{2}T[^-]+)--(.+)$/);
      if (!match) continue;

      const backupPath = path.join(BACKUP_DIR, entry);
      const stat = await fs.stat(backupPath);
      const originalTarget = match[2].replace(/_/g, "/");

      // Filter by target if specified
      if (target && !originalTarget.includes(target.replace(/\\/g, "/"))) {
        continue;
      }

      const backupEntry: BackupEntry = {
        id: entry,
        filename: entry,
        target: originalTarget,
        created: match[1].replace(/-T/, "T").replace(/-/g, (m: string, offset: number) => {
          // Reconstruct ISO date roughly
          if (offset === 4 || offset === 7) return "-";
          if (offset === 10) return ":";
          if (offset === 13 || offset === 16) return ":";
          return m;
        }),
        size: stat.size,
      };

      // Include diff from current file if requested
      if (includeDiff) {
        try {
          const backupContent = await fs.readFile(backupPath, "utf-8");
          const currentPath = path.resolve(ROOT, originalTarget);
          const currentContent = await fs.readFile(currentPath, "utf-8");
          backupEntry.diff_from_current = diffStrings(
            currentContent,
            backupContent,
            originalTarget,
            DIFF_TRUNCATE_LENGTH,
          );
        } catch {
          backupEntry.diff_from_current = "(current file not found or unreadable)";
        }
      }

      backups.push(backupEntry);
    }

    // Sort by filename (which starts with ISO timestamp) descending
    backups.sort((a, b) => b.filename.localeCompare(a.filename));
    return backups;
  } catch {
    return [];
  }
}

// ── Main rollback function ──────────────────────────────────────────────────

export async function rollback(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const target = String(action.target ?? "").trim();
  const backupId = String(action.backup_id ?? "auto");
  const dryRun = Boolean(action.dry_run ?? false);

  // Handle "list" backup_id — include diff_from_current
  if (backupId === "list") {
    const backups = await listBackups(target || undefined, true);
    return {
      ok: true,
      data: {
        backups: backups.slice(0, 50),
        total: backups.length,
        target_filter: target || "(all)",
      },
    };
  }

  // Handle "compare:<id>" backup_id — show diff without restoring
  if (backupId.startsWith("compare:")) {
    const compareId = backupId.slice("compare:".length);

    if (!target) {
      return { ok: false, error: "Missing required field: target (file to compare against)" };
    }

    const backups = await listBackups(target);
    const found = backups.find((b) => b.id === compareId || b.filename === compareId);
    if (!found) {
      return { ok: false, error: `Backup not found: ${compareId}` };
    }

    try {
      const backupPath = path.join(BACKUP_DIR, found.filename);
      const backupContent = await fs.readFile(backupPath, "utf-8");
      const currentPath = path.resolve(ROOT, target);
      const currentContent = await fs.readFile(currentPath, "utf-8");

      const diff = diffStrings(currentContent, backupContent, target, DIFF_TRUNCATE_LENGTH);

      return {
        ok: true,
        data: {
          action: "compare",
          backup_id: found.id,
          target,
          backup_created: found.created,
          backup_size: found.size,
          current_size: currentContent.length,
          diff,
          message: "Compare mode — no files were modified",
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Compare failed: ${message}` };
    }
  }

  if (!target) {
    return { ok: false, error: "Missing required field: target (file to restore)" };
  }

  try {
    const backups = await listBackups(target);

    if (backups.length === 0) {
      return { ok: false, error: `No backups found for target: ${target}` };
    }

    // Select backup
    let selected: BackupEntry;
    if (backupId === "auto") {
      selected = backups[0]; // Most recent
    } else {
      const found = backups.find((b) => b.id === backupId || b.filename === backupId);
      if (!found) {
        return { ok: false, error: `Backup not found: ${backupId}` };
      }
      selected = found;
    }

    const backupPath = path.join(BACKUP_DIR, selected.filename);
    const restorePath = path.resolve(ROOT, target);

    if (dryRun) {
      const backupContent = await fs.readFile(backupPath, "utf-8");
      let diffFromCurrent: string | undefined;
      try {
        const currentContent = await fs.readFile(restorePath, "utf-8");
        diffFromCurrent = diffStrings(currentContent, backupContent, target, DIFF_TRUNCATE_LENGTH);
      } catch {
        // Current file doesn't exist
      }

      return {
        ok: true,
        data: {
          dry_run: true,
          backup_id: selected.id,
          target,
          backup_created: selected.created,
          backup_size: selected.size,
          preview: backupContent.slice(0, 500) + (backupContent.length > 500 ? "..." : ""),
          diff_from_current: diffFromCurrent,
          message: "Dry run — no files were modified",
        },
      };
    }

    // Log before restoring (safety)
    await ctx.audit({
      type: "action_executed",
      action: "rollback",
      detail: `PRE-RESTORE: Restoring ${target} from backup ${selected.id} (created ${selected.created})`,
      ok: true,
    });

    // Read backup
    const backupContent = await fs.readFile(backupPath, "utf-8");

    // Create a backup of the current state before overwriting
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const preRollbackTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const preRollbackName = `${preRollbackTimestamp}--pre-rollback-${target.replace(/\\/g, "_")}`;
    try {
      const currentContent = await fs.readFile(restorePath, "utf-8");
      await fs.writeFile(path.join(BACKUP_DIR, preRollbackName), currentContent, "utf-8");
    } catch {
      // Current file doesn't exist — fine
    }

    // Restore
    await fs.mkdir(path.dirname(restorePath), { recursive: true });
    await fs.writeFile(restorePath, backupContent, "utf-8");

    // Rotate backups after restore
    await rotateBackups(target);

    ctx.emitHud("activity_log", {
      message: `Rollback: Restored ${target} from backup (${selected.created})`,
      level: "warn",
    });

    await ctx.audit({
      type: "action_executed",
      action: "rollback",
      detail: `Restored ${target} from backup ${selected.id} (created ${selected.created}, ${backupContent.length} chars)`,
      ok: true,
    });

    return {
      ok: true,
      data: {
        target,
        backup_id: selected.id,
        backup_created: selected.created,
        pre_rollback_backup: preRollbackName,
        restored_size: backupContent.length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Rollback failed: ${message}` };
  }
}
