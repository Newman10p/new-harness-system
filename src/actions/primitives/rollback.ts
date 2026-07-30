// ─── rollback ───────────────────────────────────────────
// Reverts a file to a previous state using backups in state/backups/.
// Supports dry-run mode, listing available backups, and auto-selection
// of the most recent backup. Rollback operations are always logged.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, "state", "backups");

interface BackupEntry {
  id: string;
  filename: string;
  target: string;
  created: string;
  size: number;
}

async function listBackups(target?: string): Promise<BackupEntry[]> {
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

      backups.push({
        id: entry,
        filename: entry,
        target: originalTarget,
        created: match[1].replace(/-T/, "T").replace(/-/g, (m, offset) => {
          // Reconstruct ISO date roughly
          if (offset === 4 || offset === 7) return "-";
          if (offset === 10) return ":";
          if (offset === 13 || offset === 16) return ":";
          return m;
        }),
        size: stat.size,
      });
    }

    // Sort by filename (which starts with ISO timestamp) descending
    backups.sort((a, b) => b.filename.localeCompare(a.filename));
    return backups;
  } catch {
    return [];
  }
}

export async function rollback(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const target = String(action.target ?? "").trim();
  const backupId = String(action.backup_id ?? "auto");
  const dryRun = Boolean(action.dry_run ?? false);

  // Handle "list" backup_id
  if (backupId === "list") {
    const backups = await listBackups(target || undefined);
    return {
      ok: true,
      data: {
        backups: backups.slice(0, 50), // Limit response size
        total: backups.length,
        target_filter: target || "(all)",
      },
    };
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
      return {
        ok: true,
        data: {
          dry_run: true,
          backup_id: selected.id,
          target,
          backup_created: selected.created,
          backup_size: selected.size,
          preview: backupContent.slice(0, 500) + (backupContent.length > 500 ? "..." : ""),
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
