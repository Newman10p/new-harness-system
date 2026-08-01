// ─── write-file ────────────────────────────────────────────────────────────
// Writes content to a file, creating parent directories as needed.
// Overwrites existing files entirely.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";
import { resolvePath } from "./resolvePath.js";

export async function writeFile(
  action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
  const filePath = resolvePath(String(action.path ?? ""));
  const content = String(action.content ?? "");

  if (!filePath) {
    return { ok: false, error: "Missing required field: path" };
  }

  try {
    // Auto-create parent directories
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, content, "utf-8");
    return {
      ok: true,
      data: { path: filePath, bytes: Buffer.byteLength(content, "utf-8") },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to write file: ${message}` };
  }
}
