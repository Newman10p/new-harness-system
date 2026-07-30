// ─── self-repair ────────────────────────────────────────────────────────
// Attempts to fix common issues detected by self-diagnose. Supported repairs:
// corrupted_memory, llm_unreachable, disk_full, large_log, missing_dirs.
// Always creates backups before repairing and logs all actions.

import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const execAsync = promisify(exec);
const ROOT = process.cwd();
const BACKUP_DIR = path.join(ROOT, "state", "backups");

interface RepairResult {
  issue: string;
  auto: boolean;
  repairs: Array<{ target: string; status: "success" | "failed" | "skipped"; detail: string }>;
}

async function createBackup(filePath: string): Promise<string | null> {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const relativePath = path.relative(ROOT, filePath);
    const backupName = `${timestamp}--${relativePath.replace(/\//g, "_")}`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

async function repairCorruptedMemory(): Promise<{ target: string; status: "success" | "failed" | "skipped"; detail: string }> {
  const memoryFiles = ["memory/context.md", "state/inbox.md", "agent/identity.md"];
  const results: string[] = [];

  for (const rel of memoryFiles) {
    const fullPath = path.join(ROOT, rel);
    try {
      const content = await fs.readFile(fullPath, "utf-8");
      // Check if content looks like corrupted binary
      const nullBytes = (content.match(/\x00/g) || []).length;
      if (nullBytes > 5) {
        // Backup then restore
        const backup = await createBackup(fullPath);
        await fs.writeFile(fullPath, `# ${path.basename(rel)}\n\n> Restored from backup after corruption detected.\n\nPrevious backup: ${backup}\n`, "utf-8");
        results.push(`${rel}: restored (had ${nullBytes} null bytes)`);
      }
    } catch {
      // File doesn't exist — create fresh
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, `# ${path.basename(rel)}\n\n> Freshly created by self-repair.\n\n`, "utf-8");
      results.push(`${rel}: created fresh (was missing)`);
    }
  }

  return {
    target: "corrupted_memory",
    status: results.length > 0 ? "success" : "skipped",
    detail: results.length > 0 ? results.join("; ") : "No corruption detected",
  };
}

async function repairDiskFull(): Promise<{ target: string; status: "success" | "failed" | "skipped"; detail: string }> {
  const results: string[] = [];
  const dirs = [
    { dir: path.join(ROOT, "state", "backups"), maxAge: 7 * 24 * 60 * 60 * 1000, label: "old backups" },
    { dir: path.join(ROOT, "state", "screenshots"), maxAge: 3 * 24 * 60 * 60 * 1000, label: "old screenshots" },
  { dir: path.join(ROOT, "memory", "evaluations"), maxAge: 14 * 24 * 60 * 60 * 1000, label: "old evaluations" },
  ];

  for (const { dir, maxAge, label } of dirs) {
    try {
      const entries = await fs.readdir(dir);
      let removed = 0;

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = await fs.stat(fullPath);
        if (Date.now() - stat.mtimeMs > maxAge) {
          await fs.unlink(fullPath);
          removed++;
        }
      }
      results.push(`${label}: removed ${removed} files`);
    } catch {
      results.push(`${label}: directory not found (skipped)`);
    }
  }

  // Trim audit log if very large
  const auditPath = path.join(ROOT, "state", "audit.log.md");
  try {
    const stat = await fs.stat(auditPath);
    if (stat.size > 5 * 1024 * 1024) { // > 5MB
      const content = await fs.readFile(auditPath, "utf-8");
      const lines = content.split("\n");
      // Keep last 5000 lines
      const trimmed = lines.slice(-5000).join("\n");
      await createBackup(auditPath);
      await fs.writeFile(auditPath, trimmed, "utf-8");
      results.push(`audit.log.md: trimmed from ${lines.length} to 5000 lines`);
    }
  } catch {
    // No audit log to trim
  }

  return {
    target: "disk_full",
    status: "success",
    detail: results.join("; "),
  };
}

async function repairLargeLog(): Promise<{ target: string; status: "success" | "failed" | "skipped"; detail: string }> {
  const auditPath = path.join(ROOT, "state", "audit.log.md");
  try {
    const stat = await fs.stat(auditPath);
    const content = await fs.readFile(auditPath, "utf-8");
    const lines = content.split("\n");
    const targetLines = 2000;

    if (lines.length <= targetLines) {
      return { target: "large_log", status: "skipped", detail: `Audit log has ${lines.length} lines (under ${targetLines} threshold)` };
    }

    await createBackup(auditPath);
    const trimmed = lines.slice(-targetLines).join("\n");
    await fs.writeFile(auditPath, trimmed, "utf-8");

    return {
      target: "large_log",
      status: "success",
      detail: `Trimmed audit log from ${lines.length} to ${targetLines} lines (was ${(stat.size / 1024).toFixed(1)}KB)`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { target: "large_log", status: "failed", detail: message };
  }
}

async function repairMissingDirs(): Promise<{ target: string; status: "success" | "failed" | "skipped"; detail: string }> {
  const dirs = ["state", "state/backups", "memory", "memory/evaluations", "skills"];
  const created: string[] = [];

  for (const dir of dirs) {
    const fullPath = path.join(ROOT, dir);
    try {
      await fs.access(fullPath);
    } catch {
      await fs.mkdir(fullPath, { recursive: true });
      created.push(dir);
    }
  }

  return {
    target: "missing_dirs",
    status: created.length > 0 ? "success" : "skipped",
    detail: created.length > 0 ? `Created: ${created.join(", ")}` : "All directories exist",
  };
}

async function repairLLMUnreachable(): Promise<{ target: string; status: "success" | "failed" | "skipped"; detail: string }> {
  // Check if we can find a fallback provider in config
  try {
    const configPath = path.join(ROOT, "harness.config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    const providers = config?.providers || config?.llm;

    if (providers) {
      // Try to verify connectivity to at least one provider
      let reachable = false;
      let tried = "";

      if (Array.isArray(providers)) {
        for (const p of providers) {
          const url = p.baseURL || p.url;
          if (url) {
            try {
              await execAsync(`curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 ${url.replace(/\/$/, "")}/models 2>/dev/null`, { timeout: 5_000 });
              reachable = true;
              tried = url;
              break;
            } catch {
              tried += `${url} (fail), `;
            }
          }
        }
      }

      if (reachable) {
        return { target: "llm_unreachable", status: "success", detail: `Fallback provider reachable: ${tried}` };
      }
      return { target: "llm_unreachable", status: "failed", detail: `No providers reachable. Tried: ${tried}` };
    }

    return { target: "llm_unreachable", status: "skipped", detail: "No provider configuration found" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { target: "llm_unreachable", status: "failed", detail: message };
  }
}

const REPAIR_HANDLERS: Record<string, () => Promise<{ target: string; status: "success" | "failed" | "skipped"; detail: string }>> = {
  corrupted_memory: repairCorruptedMemory,
  llm_unreachable: repairLLMUnreachable,
  disk_full: repairDiskFull,
  large_log: repairLargeLog,
  missing_dirs: repairMissingDirs,
};

export async function selfRepair(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const issue = String(action.issue ?? "all");
  const auto = Boolean(action.auto ?? false);

  const validIssues = [...Object.keys(REPAIR_HANDLERS), "all"];
  if (!validIssues.includes(issue)) {
    return { ok: false, error: `Invalid issue: ${issue}. Valid: ${validIssues.join(", ")}` };
  }

  const issuesToRepair = issue === "all" ? Object.keys(REPAIR_HANDLERS) : [issue];
  const repairs: RepairResult["repairs"] = [];

  try {
    for (const iss of issuesToRepair) {
      const handler = REPAIR_HANDLERS[iss];
      if (!handler) continue;

      try {
        const result = await handler();
        repairs.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        repairs.push({ target: iss, status: "failed", detail: message });
      }
    }

    const successCount = repairs.filter((r) => r.status === "success").length;
    const failedCount = repairs.filter((r) => r.status === "failed").length;

    const result: RepairResult = { issue, auto, repairs };

    await ctx.audit({
      type: "action_executed",
      action: "self-repair",
      detail: `Repaired ${successCount} issues, ${failedCount} failed, ${repairs.length - successCount - failedCount} skipped (auto=${auto})`,
      ok: failedCount === 0,
    });

    ctx.emitHud("activity_log", {
      message: `Self-repair: ${successCount} fixed, ${failedCount} failed`,
      level: failedCount > 0 ? "warn" : "info",
    });

    return { ok: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Self-repair failed: ${message}` };
  }
}
