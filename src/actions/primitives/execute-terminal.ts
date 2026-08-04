// ─── execute-terminal ──────────────────────────────────────────────────────
// Runs a shell command via SandboxExecutor with:
//   - Dangerous pattern detection (obfuscation-aware)
//   - Restricted environment (only safe env vars)
//   - Shell=false for simple commands (no shell operators)
//   - Timeout (30s default) + output limits (10MB)
//   - Dry-run audit logging of parsed command structure

import { SandboxExecutor } from "../../security/SandboxExecutor.js";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const MAX_BUFFER = 10 * 1024 * 1024; // 10MB
const sandbox = new SandboxExecutor(MAX_BUFFER);

export async function executeTerminal(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const command = String(action.command ?? "");
  const timeout = Number(action.timeout ?? 30_000);

  if (!command) {
    return { ok: false, error: "Missing required field: command" };
  }

  try {
    const { stdout, stderr, parsed } = await sandbox.execute(command, timeout);

    const output = (stdout + stderr).trim();

    // Audit log with parsed structure
    await ctx.audit({
      type: "action_executed",
      action: "execute-terminal",
      detail: `Executed (shell=${parsed.usesShell}): ${parsed.command} ${parsed.args.join(" ")}`,
      ok: true,
    });

    return { ok: true, data: output || "(no output)" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Check if it was a sandbox block
    if (message.includes("Command blocked by sandbox")) {
      await ctx.audit({
        type: "action_blocked",
        action: "execute-terminal",
        detail: message,
        ok: false,
      });
      return { ok: false, error: message };
    }

    // exec/spawn includes partial output in the error
    const partialOutput = (err as { stdout?: string }).stdout;
    if (partialOutput) {
      return {
        ok: true,
        data: String(partialOutput).trim() + `\n[exit code: non-zero]\n${message}`,
      };
    }
    return { ok: false, error: message };
  }
}
