// ─── open-application ───────────────────────────────────────────────────
// Launches an application by name using platform-specific commands.
// Includes safety checks to block destructive commands.

import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const execAsync = promisify(exec);

// Blocklist of dangerous commands that should never be launched
const BLOCKED_PATTERNS = [
  /^rm\s/, /^rmdir/, /^del/, /^format/, /^mkfs/, /^dd\s/, /^shutdown/,
  /^reboot/, /^halt/, /^poweroff/, /^init\s+[06]/, /^:(){ :|:& };:/,
  /^chmod\s.*777/, /^chown\s.*root/, /^fdisk/, /^parted/,
  /^mv\s.*\//, /^cp\s.*\/dev/, /^cat\s.*>\s*\/dev/,
  />(?:\s*)\//, /\|\s*sh$/, /\|\s*bash$/,
  /curl.*\|.*sh/, /wget.*\|.*sh/,
];

function isDestructive(appName: string): boolean {
  const lower = appName.toLowerCase().trim();
  return BLOCKED_PATTERNS.some((re) => re.test(lower));
}

export async function openApplication(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const app = String(action.app ?? "").trim();
  const args = Array.isArray(action.args)
    ? (action.args as string[]).map(String)
    : [];

  if (!app) {
    return { ok: false, error: "Missing required field: app" };
  }

  if (isDestructive(app)) {
    await ctx.audit({
      type: "action_blocked",
      action: "open-application",
      detail: `Blocked potentially destructive application: ${app}`,
      ok: false,
    });
    return {
      ok: false,
      error: 'Application name blocked for safety: "' + app + '" looks like a destructive command.',
    };
  }

  // Also check args for destructive patterns
  const argsStr = args.join(" ");
  if (isDestructive(argsStr)) {
    await ctx.audit({
      type: "action_blocked",
      action: "open-application",
      detail: 'Blocked destructive arguments for: ' + app,
      ok: false,
    });
    return {
      ok: false,
      error: "Arguments blocked for safety: contains potentially destructive commands.",
    };
  }

  const platform = os.platform();

  try {
    if (platform === "win32") {
      // Windows: use start command via cmd
      const quotedArgs = [app, ...args].map((a) => '"' + a + '"').join(" ");
      const cmd = 'start "" ' + quotedArgs;
      await execAsync(cmd, { timeout: 10_000, shell: "cmd.exe" });
    } else if (platform === "darwin") {
      // macOS: use open -a
      const argList = ["-a", app, ...args];
      const cmdStr = 'open ' + argList.map((a) => '"' + a + '"').join(" ");
      await execAsync(cmdStr, { timeout: 10_000 });
    } else {
      // Linux: try xdg-open first, then try direct command
      if (app.includes("/") || app.includes(".")) {
        spawn(app, args, { detached: true, stdio: "ignore" }).unref();
      } else {
        try {
          await execAsync('xdg-open "' + app + '"', { timeout: 5_000 });
        } catch {
          spawn(app, args, { detached: true, stdio: "ignore" }).unref();
        }
      }
    }

    await ctx.audit({
      type: "action_executed",
      action: "open-application",
      detail: 'Launched application: ' + app + (args.length ? ' with args: ' + args.join(" ") : ""),
      ok: true,
    });

    return {
      ok: true,
      data: {
        message: 'Application launched: ' + app,
        app,
        args,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: 'Failed to launch application "' + app + '": ' + message,
    };
  }
}
