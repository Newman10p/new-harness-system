"use strict";
// ─── execute-terminal ──────────────────────────────────────────────────────
// Runs a shell command via child_process.exec with configurable timeout.
// Output is capped at 10MB to prevent memory exhaustion.
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeTerminal = executeTerminal;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
const MAX_BUFFER = 10 * 1024 * 1024; // 10MB
async function executeTerminal(action, _ctx) {
    const command = String(action.command ?? "");
    const timeout = Number(action.timeout ?? 30_000);
    if (!command) {
        return { ok: false, error: "Missing required field: command" };
    }
    try {
        const { stdout, stderr } = await execAsync(command, {
            timeout,
            maxBuffer: MAX_BUFFER,
        });
        const output = (stdout + stderr).trim();
        return { ok: true, data: output || "(no output)" };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // exec includes partial output in the error
        const output = err.stdout;
        if (output) {
            return {
                ok: true,
                data: String(output).trim() + `\n[exit code: non-zero]\n${message}`,
            };
        }
        return { ok: false, error: message };
    }
}
//# sourceMappingURL=execute-terminal.js.map