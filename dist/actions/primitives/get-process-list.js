"use strict";
// ─── get-process-list ──────────────────────────────────────────────────────
// Returns the top 30 processes by memory usage using `ps aux`.
// Structured output: parses the ps output into clean objects.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProcessList = getProcessList;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
async function getProcessList(_action, ctx) {
    try {
        // ps aux sorted by memory, top 30
        const { stdout } = await execAsync("ps aux --sort=-%mem | head -30", {
            timeout: 10_000,
        });
        const lines = stdout.trim().split("\n");
        if (lines.length < 2) {
            return { ok: true, data: [] };
        }
        const header = lines[0].trim();
        const processes = lines.slice(1).map((line) => {
            const parts = line.trim().split(/\s+/);
            return {
                user: parts[0],
                pid: parts[1],
                cpu: parts[2] + "%",
                mem: parts[3] + "%",
                vsz: parts[4],
                rss: parts[5],
                stat: parts[6],
                start: parts[7],
                time: parts[8],
                command: parts.slice(10).join(" "),
            };
        });
        // Emit system metrics to HUD
        if (processes.length > 0) {
            const topProcess = processes[0];
            ctx.emitHud("system_metrics", {
                cpu: parseFloat(topProcess.cpu),
                memory: parseFloat(topProcess.mem),
                disk: 0, // ps doesn't give disk
            });
        }
        return {
            ok: true,
            data: {
                total: processes.length,
                header,
                processes,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to get process list: ${message}` };
    }
}
//# sourceMappingURL=get-process-list.js.map