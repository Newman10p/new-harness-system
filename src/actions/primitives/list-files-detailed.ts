// ─── list-files-detailed ──────────────────────────────────────────
// Enhanced file listing for the file manager UI. Returns name, path,
// size, modified date, type, and extension for each entry.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";
import { resolvePath } from "./resolvePath.js";

interface DetailedFileEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  sizeBytes: number;
  sizeFormatted: string;
  modified: string;
  extension: string;
}

export async function listFilesDetailed(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const dirPath = resolvePath(String(action.path ?? "."));
  const showHidden = action.show_hidden === true;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const detailed: DetailedFileEntry[] = [];

    for (const entry of entries) {
      // Skip hidden files unless requested
      if (!showHidden && entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      try {
        const stat = await fs.stat(fullPath);
        const ext = entry.isDirectory() ? "" : path.extname(entry.name);
        const type: DetailedFileEntry["type"] = entry.isSymbolicLink()
          ? "symlink"
          : entry.isDirectory()
            ? "directory"
            : "file";

        detailed.push({
          name: entry.name,
          path: fullPath,
          type,
          sizeBytes: stat.size,
          sizeFormatted: formatSize(stat.size),
          modified: stat.mtime.toISOString(),
          extension: ext,
        });
      } catch {
        // If stat fails (e.g., broken symlink), add with minimal info
        detailed.push({
          name: entry.name,
          path: fullPath,
          type: entry.isSymbolicLink() ? "symlink" : "file",
          sizeBytes: 0,
          sizeFormatted: "0 B",
          modified: "",
          extension: path.extname(entry.name),
        });
      }
    }

    // Sort: directories first, then files, both alphabetically
    detailed.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });

    // Emit file_list to HUD
    ctx.emitHud("activity_log" as HudChannel, {
      message: `Listed ${detailed.length} items in ${dirPath}`,
      level: "info",
    } as never);

    return {
      ok: true,
      data: {
        path: dirPath,
        total: detailed.length,
        directories: detailed.filter((d) => d.type === "directory").length,
        files: detailed.filter((d) => d.type === "file" || d.type === "symlink").length,
        entries: detailed,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to list files: ${message}` };
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
