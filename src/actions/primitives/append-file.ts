// ─── append-file ───────────────────────────────────────────────────────────
// Appends content to a file. Creates the file (and parent dirs) if they
// don't exist. Used for inbox.md, context.md, and logs.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";
import { resolvePath } from "./resolvePath.js";

export async function appendFile(
  action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
  const filePath = resolvePath(String(action.path ?? ""));
  const content = String(action.content ?? "");

  if (!filePath) {
    return { ok: false, error: "Missing required field: path" };
  }

  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.appendFile(filePath, content, "utf-8");
    return {
      ok: true,
      data: { path: filePath, appended: content.length },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to append to file: ${message}` };
  }
}
