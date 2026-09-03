"use strict";
// ─── list-directory ────────────────────────────────────────────────────────
// Lists files and subdirectories at a given path.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDirectory = listDirectory;
const promises_1 = __importDefault(require("node:fs/promises"));
async function listDirectory(action, _ctx) {
    const dirPath = String(action.path ?? ".");
    try {
        const entries = await promises_1.default.readdir(dirPath, { withFileTypes: true });
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
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to list directory: ${message}` };
    }
}
//# sourceMappingURL=list-directory.js.map