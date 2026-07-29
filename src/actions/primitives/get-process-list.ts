// ─── get-process-list ──────────────────────────────────────────────────────
// Returns the top 30 processes by memory usage using `ps aux`.
// Structured output: parses the ps output into clean objects.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const execAsync = promisify(exec);

export async function getProcessList(
  _action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to get process list: ${message}` };
  }
}
