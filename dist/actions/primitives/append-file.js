"use strict";
// ─── append-file ───────────────────────────────────────────────────────────
// Appends content to a file. Creates the file (and parent dirs) if they
// don't exist. Used for inbox.md, context.md, and logs.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendFile = appendFile;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
async function appendFile(action, _ctx) {
    const filePath = String(action.path ?? "");
    const content = String(action.content ?? "");
    if (!filePath) {
        return { ok: false, error: "Missing required field: path" };
    }
    try {
        const dir = node_path_1.default.dirname(filePath);
        await promises_1.default.mkdir(dir, { recursive: true });
        await promises_1.default.appendFile(filePath, content, "utf-8");
        return {
            ok: true,
            data: { path: filePath, appended: content.length },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to append to file: ${message}` };
    }
}
//# sourceMappingURL=append-file.js.map