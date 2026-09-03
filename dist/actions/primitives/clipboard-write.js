"use strict";
// ─── clipboard-write ─────────────────────────────────────────────────────
// Writes text to the system clipboard using platform-specific commands.
// Windows: powershell Set-Clipboard, Linux: xclip/xsel, macOS: pbcopy.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clipboardWrite = clipboardWrite;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_os_1 = __importDefault(require("node:os"));
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
async function clipboardWrite(action, _ctx) {
    const text = action.text != null ? String(action.text) : "";
    if (!text) {
        return { ok: false, error: "Missing required field: text" };
    }
    const platform = node_os_1.default.platform();
    try {
        if (platform === "win32") {
            // Escape single quotes for PowerShell
            const escaped = text.replace(/'/g, "''");
            await execAsync(`powershell -command "Set-Clipboard -Value '${escaped}'"`, { timeout: 10_000 });
        }
        else if (platform === "darwin") {
            // pbcopy reads from stdin via echo pipe
            await execAsync(`printf '%s' ${escapeForShell(text)} | pbcopy`, { timeout: 5_000, shell: "/bin/bash" });
        }
        else {
            // Linux — try xclip first, then xsel, pipe via echo
            try {
                await execAsync(`printf '%s' ${escapeForShell(text)} | xclip -selection clipboard`, { timeout: 5_000, shell: "/bin/bash" });
            }
            catch {
                await execAsync(`printf '%s' ${escapeForShell(text)} | xsel --clipboard --input`, { timeout: 5_000, shell: "/bin/bash" });
            }
        }
        return {
            ok: true,
            data: {
                message: "Text written to clipboard",
                length: text.length,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            error: `Failed to write to clipboard: ${message}. Ensure a clipboard tool is installed (xclip/xsel on Linux, pbcopy on macOS, or PowerShell on Windows).`,
        };
    }
}
/**
 * Escapes text for safe use in a shell single-quoted string.
 * Single quotes are escaped by ending the quote, adding \''\', and reopening.
 */
function escapeForShell(text) {
    return "'" + text.replace(/'/g, "'\\''") + "'";
}
//# sourceMappingURL=clipboard-write.js.map