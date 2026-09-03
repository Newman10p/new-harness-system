"use strict";
// ─── write-file ────────────────────────────────────────────────────────────
// Writes content to a file, creating parent directories as needed.
// Overwrites existing files entirely.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeFile = writeFile;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
async function writeFile(action, _ctx) {
    const filePath = String(action.path ?? "");
    const content = String(action.content ?? "");
    if (!filePath) {
        return { ok: false, error: "Missing required field: path" };
    }
    try {
        // Auto-create parent directories
        const dir = node_path_1.default.dirname(filePath);
        await promises_1.default.mkdir(dir, { recursive: true });
        await promises_1.default.writeFile(filePath, content, "utf-8");
        return {
            ok: true,
            data: { path: filePath, bytes: Buffer.byteLength(content, "utf-8") },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to write file: ${message}` };
    }
}
//# sourceMappingURL=write-file.js.map