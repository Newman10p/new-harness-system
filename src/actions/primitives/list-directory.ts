// ─── list-directory ────────────────────────────────────────────────────────
// Lists files and subdirectories at a given path.

import fs from "node:fs/promises";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";
import { resolvePath } from "./resolvePath.js";

export async function listDirectory(
  action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
  const dirPath = resolvePath(String(action.path ?? "."));

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }));

    return {
      ok: true,
      data: {
        path: dirPath,
        entries: items,
        total: items.length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to list directory: ${message}` };
  }
}
