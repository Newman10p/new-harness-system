"use strict";
// ─── clipboard-read ──────────────────────────────────────────────────────
// Reads text content from the system clipboard using platform-specific commands.
// Windows: powershell Get-Clipboard, Linux: xclip/xsel, macOS: pbpaste.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clipboardRead = clipboardRead;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_os_1 = __importDefault(require("node:os"));
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
function getCommand() {
    const platform = node_os_1.default.platform();
    if (platform === "win32") {
        return 'powershell -command "Get-Clipboard -Raw"';
    }
    if (platform === "darwin") {
        return "pbpaste";
    }
    // Linux — try xclip first, then xsel
    return "xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null";
}
async function clipboardRead(_action, _ctx) {
    const cmd = getCommand();
    try {
        const { stdout } = await execAsync(cmd, { timeout: 5_000 });
        const content = stdout || "";
        if (!content.trim()) {
            return {
                ok: true,
                data: {
                    content: "",
                    isEmpty: true,
                    note: "Clipboard is empty or contains non-text data",
                },
            };
        }
        return {
            ok: true,
            data: {
                content,
                length: content.length,
                isEmpty: false,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            error: `Failed to read clipboard: ${message}. Ensure a clipboard tool is installed (xclip/xsel on Linux, pbpaste on macOS, or PowerShell on Windows).`,
        };
    }
}
//# sourceMappingURL=clipboard-read.js.map