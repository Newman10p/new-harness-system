// ─── execute-terminal ──────────────────────────────────────────────────────
// Runs a shell command via child_process.exec with configurable timeout.
// Output is capped at 10MB to prevent memory exhaustion.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const execAsync = promisify(exec);
const MAX_BUFFER = 10 * 1024 * 1024; // 10MB

export async function executeTerminal(
  action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // exec includes partial output in the error
    const output = (err as { stdout?: string; stderr?: string }).stdout;
    if (output) {
      return {
        ok: true,
        data: String(output).trim() + `\n[exit code: non-zero]\n${message}`,
      };
    }
    return { ok: false, error: message };
  }
}
