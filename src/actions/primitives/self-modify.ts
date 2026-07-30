// ─── self-modify ───────────────────────────────────────────────────────────
// Allows M.A.I. to modify its own brain files (identity, context, inbox,
// memory, skills, catalog). Enforces a strict whitelist, creates backups
// before every modification, and logs every change to the audit trail.

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
    try {
      await fs.access(fullPath);
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

    return {
      ok: true,
      data: {
        target: normalizedTarget,
        operation,
        section_marker: sectionMarker || null,
        backup: backupPath,
        new_size: result.length,
      },
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
