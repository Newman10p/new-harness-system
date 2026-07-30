// ─── watch-directory ───────────────────────────────────────────────────────
// Watches a directory for filesystem changes using fs.watch (callback-based).
// Changes are appended to inbox.md as structured events.
// Tracks active watchers in a Map so they can be stopped on shutdown.

import fs from "node:fs";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";
import { INBOX_PATH } from "../../core/constants.js";

// Track active watchers so they can be stopped on shutdown
const activeWatchers = new Map<
  string,
  fs.FSWatcher
>();

export async function watchDirectory(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const dirPath = String(action.path ?? "");

  if (!dirPath) {
    return { ok: false, error: "Missing required field: path" };
  }

  // Check if already watching this path
  if (activeWatchers.has(dirPath)) {
    return {
      ok: true,
      data: { message: `Already watching: ${dirPath}`, watching: true },
    };
  }

  try {
    // Ensure inbox directory exists
    await fs.promises.mkdir(path.dirname(INBOX_PATH), { recursive: true });

    const watcher = fs.watch(dirPath, { recursive: false }, async (eventType, filename) => {
      if (!filename) return;

      const event = {
        type: eventType,
        source: filename,
        detail: `Change detected in watched directory: ${dirPath}`,
        timestamp: new Date().toISOString(),
      };

      await ctx.appendInbox(event);
      ctx.emitHud("activity_log", {
        message: `[watch] ${eventType}: ${filename} in ${dirPath}`,
        level: "info",
      });
    });

    activeWatchers.set(dirPath, watcher);

    return {
      ok: true,
      data: {
        message: `Watching: ${dirPath}`,
        watching: true,
        activeWatchers: activeWatchers.size,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to watch directory: ${message}` };
  }
}

/**
 * Stop all active watchers. Called on shutdown.
 */
export function shutdownWatchers(): void {
  for (const [dirPath, watcher] of activeWatchers) {
    watcher.close();
    activeWatchers.delete(dirPath);
  }
}
