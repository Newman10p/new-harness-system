// ─── get-system-info ────────────────────────────────────────────────────────
// Returns host system information: hostname, platform, CPU, memory.
// Pure os module — no external dependencies.

import os from "node:os";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

export async function getSystemInfo(
  _action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    ok: true,
    data: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      uptime: os.uptime(),
      cpu: {
        model: os.cpus()[0]?.model ?? "unknown",
        cores: os.cpus().length,
        speed: os.cpus()[0]?.speed ?? 0,
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercent: Math.round((usedMem / totalMem) * 100),
      },
    },
  };
}
