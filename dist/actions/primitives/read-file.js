"use strict";
// ─── read-file ─────────────────────────────────────────────────────────────
// Reads a file from the filesystem. Supports path traversal safety via
// the deny_commands policy (no internal enforcement — policy firewall handles it).
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readFile = readFile;
const promises_1 = __importDefault(require("node:fs/promises"));
async function readFile(action, _ctx) {
    const filePath = String(action.path ?? "");
    if (!filePath) {
        return { ok: false, error: "Missing required field: path" };
    }
    try {
        const content = await promises_1.default.readFile(filePath, "utf-8");
        return {
            ok: true,
            data: {
                path: filePath,
                content,
                size: content.length,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to read file: ${message}` };
    }
}
//# sourceMappingURL=read-file.js.map