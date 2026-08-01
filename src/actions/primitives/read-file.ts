// ─── read-file ─────────────────────────────────────────────────────────────
// Reads a file from the filesystem. Supports path traversal safety via
// the deny_commands policy (no internal enforcement — policy firewall handles it).

import fs from "node:fs/promises";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";
import { resolvePath } from "./resolvePath.js";

export async function readFile(
  action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
  const filePath = resolvePath(String(action.path ?? ""));

  if (!filePath) {
    return { ok: false, error: "Missing required field: path" };
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return {
      ok: true,
      data: {
        path: filePath,
        content,
        size: content.length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to read file: ${message}` };
  }
}
