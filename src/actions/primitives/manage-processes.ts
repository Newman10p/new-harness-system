// ─── manage-processes ────────────────────────────────────────────────
// Enhanced process management: kill or restart processes by PID or name.
// Kill operations are audit-logged and noted as requiring policy approval.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const execAsync = promisify(exec);

export async function manageProcesses(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const operation = String(action.operation ?? "").toLowerCase();
  const pid = action.pid != null ? Number(action.pid) : undefined;
  const name = action.name ? String(action.name) : undefined;

  if (operation !== "kill" && operation !== "restart") {
    return {
      ok: false,
      error: `Invalid operation: "${operation}". Must be "kill" or "restart".`,
    };
  }

  if (pid == null && !name) {
    return {
      ok: false,
      error: 'Must provide either "pid" or "name" to identify the process.',
    };
  }

  const platform = os.platform();

  try {
    if (operation === "kill") {
      const result = await killProcess(pid, name, platform);

      await ctx.audit({
        type: "action_executed",
        action: "manage-processes",
        detail: `Kill operation on ${pid != null ? `PID ${pid}` : `name "${name}"`}: ${result.message}`,
        ok: result.ok,
      });

      return result.ok
        ? { ok: true, data: result }
        : { ok: false, error: result.message };
    }

    // operation === "restart"
    const killResult = await killProcess(pid, name, platform);
    if (!killResult.ok) {
      return {
        ok: false,
        error: `Cannot restart: ${killResult.message}`,
      };
    }

    // Attempt to relaunch by name (limited capability)
    const restartName = name ?? killResult.processName;
    let restartResult: { ok: boolean; message: string };

    if (!restartName) {
      restartResult = {
        ok: false,
        message: "Cannot determine process name for restart.",
      };
    } else {
      try {
        const { spawn } = await import("node:child_process");
        spawn(restartName, [], {
          detached: true,
          stdio: "ignore",
        }).unref();
        restartResult = {
          ok: true,
          message: `Process "${restartName}" killed and relaunched.`,
        };
      } catch {
        restartResult = {
          ok: false,
          message: `Process killed but could not relaunch "${restartName}".`,
        };
      }
    }

    await ctx.audit({
      type: "action_executed",
      action: "manage-processes",
      detail: `Restart: ${restartResult.message}`,
      ok: restartResult.ok,
    });

    return {
      ok: restartResult.ok,
      data: {
        killed: killResult,
        restarted: restartResult,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Process management failed: ${message}` };
  }
}

async function killProcess(
  pid: number | undefined,
  name: string | undefined,
  platform: string
): Promise<{ ok: boolean; message: string; processName?: string }> {
  // If name is provided but no PID, resolve PID from name
  let targetPid = pid;
  if (!targetPid && name) {
    try {
      const { stdout } = await execAsync("pgrep -f " + JSON.stringify(name), {
        timeout: 5_000,
      });
      const pids = stdout.trim().split("\n").map(Number).filter((n) => !isNaN(n));
      if (pids.length === 0) {
        return { ok: false, message: `No process found matching "${name}".` };
      }
      targetPid = pids[0]; // Kill the first match
    } catch {
      if (platform === "win32") {
        // Try tasklist to find PID
        try {
          const { stdout } = await execAsync(
            `tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`,
            { timeout: 5_000 }
          );
          const match = stdout.match(/""([^"]+)"".*?""(\d+)""/);
          if (match) {
            targetPid = parseInt(match[2], 10);
          }
        } catch {
          // Fall through
        }
      }
      if (targetPid == null) {
        return { ok: false, message: `Could not find PID for process "${name}".` };
      }
    }
  }

  if (targetPid == null) {
    return { ok: false, message: "No PID or name provided." };
  }

  // Actually kill the process
  try {
    if (platform === "win32") {
      await execAsync(`taskkill /PID ${targetPid} /F`, { timeout: 10_000 });
    } else {
      process.kill(targetPid, "SIGTERM");
      // Give it a moment, then force kill if still alive
      setTimeout(() => {
        try {
          process.kill(targetPid!, 0); // check if alive
          process.kill(targetPid!, "SIGKILL");
        } catch {
          // already dead
        }
      }, 2000);
    }
    return {
      ok: true,
      message: `Process ${targetPid} terminated.`,
      processName: name,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Failed to kill process ${targetPid}: ${message}`,
      processName: name,
    };
  }
}
