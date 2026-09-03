"use strict";
// ─── list-files-detailed ──────────────────────────────────────────
// Enhanced file listing for the file manager UI. Returns name, path,
// size, modified date, type, and extension for each entry.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFilesDetailed = listFilesDetailed;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
async function listFilesDetailed(action, ctx) {
    const dirPath = node_path_1.default.resolve(String(action.path ?? "."));
    const showHidden = action.show_hidden === true;
    try {
        const entries = await promises_1.default.readdir(dirPath, { withFileTypes: true });
        const detailed = [];
        for (const entry of entries) {
            // Skip hidden files unless requested
            if (!showHidden && entry.name.startsWith(".")) {
                continue;
            }
            const fullPath = node_path_1.default.join(dirPath, entry.name);
            try {
                const stat = await promises_1.default.stat(fullPath);
                const ext = entry.isDirectory() ? "" : node_path_1.default.extname(entry.name);
                const type = entry.isSymbolicLink()
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
            }
            catch {
                // If stat fails (e.g., broken symlink), add with minimal info
                detailed.push({
                    name: entry.name,
                    path: fullPath,
                    type: entry.isSymbolicLink() ? "symlink" : "file",
                    sizeBytes: 0,
                    sizeFormatted: "0 B",
                    modified: "",
                    extension: node_path_1.default.extname(entry.name),
                });
            }
        }
        // Sort: directories first, then files, both alphabetically
        detailed.sort((a, b) => {
            if (a.type === "directory" && b.type !== "directory")
                return -1;
            if (a.type !== "directory" && b.type === "directory")
                return 1;
            return a.name.localeCompare(b.name);
        });
        // Emit file_list to HUD
        ctx.emitHud("activity_log", {
            message: `Listed ${detailed.length} items in ${dirPath}`,
            level: "info",
        });
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
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to list files: ${message}` };
    }
}
function formatSize(bytes) {
    if (bytes === 0)
        return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
//# sourceMappingURL=list-files-detailed.js.map