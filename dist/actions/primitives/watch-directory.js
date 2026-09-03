"use strict";
// ─── watch-directory ───────────────────────────────────────────────────────
// Watches a directory for filesystem changes using fs.watch (callback-based).
// Changes are appended to inbox.md as structured events.
// Tracks active watchers in a Map so they can be stopped on shutdown.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchDirectory = watchDirectory;
exports.shutdownWatchers = shutdownWatchers;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const constants_js_1 = require("../../core/constants.js");
// Track active watchers so they can be stopped on shutdown
const activeWatchers = new Map();
async function watchDirectory(action, ctx) {
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
        await node_fs_1.default.promises.mkdir(node_path_1.default.dirname(constants_js_1.INBOX_PATH), { recursive: true });
        const watcher = node_fs_1.default.watch(dirPath, { recursive: false }, async (eventType, filename) => {
            if (!filename)
                return;
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
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to watch directory: ${message}` };
    }
}
/**
 * Stop all active watchers. Called on shutdown.
 */
function shutdownWatchers() {
    for (const [dirPath, watcher] of activeWatchers) {
        watcher.close();
        activeWatchers.delete(dirPath);
    }
}
//# sourceMappingURL=watch-directory.js.map