// ─── clipboard-write ─────────────────────────────────────────────────────
// Writes text to the system clipboard using platform-specific commands.
// Windows: powershell Set-Clipboard, Linux: xclip/xsel, macOS: pbcopy.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const execAsync = promisify(exec);

export async function clipboardWrite(
  action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
  const text = action.text != null ? String(action.text) : "";

  if (!text) {
    return { ok: false, error: "Missing required field: text" };
  }

  const platform = os.platform();

  try {
    if (platform === "win32") {
      // Escape single quotes for PowerShell
      const escaped = text.replace(/'/g, "''");
      await execAsync(
        `powershell -command "Set-Clipboard -Value '${escaped}'"`,
        { timeout: 10_000 }
      );
    } else if (platform === "darwin") {
      // pbcopy reads from stdin via echo pipe
      await execAsync(
        `printf '%s' ${escapeForShell(text)} | pbcopy`,
        { timeout: 5_000, shell: "/bin/bash" }
      );
    } else {
      // Linux — try xclip first, then xsel, pipe via echo
      try {
        await execAsync(
          `printf '%s' ${escapeForShell(text)} | xclip -selection clipboard`,
          { timeout: 5_000, shell: "/bin/bash" }
        );
      } catch {
        await execAsync(
          `printf '%s' ${escapeForShell(text)} | xsel --clipboard --input`,
          { timeout: 5_000, shell: "/bin/bash" }
        );
      }
    }

    return {
      ok: true,
      data: {
        message: "Text written to clipboard",
        length: text.length,
      },
    };
  } catch (err) {
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
function escapeForShell(text: string): string {
  return "'" + text.replace(/'/g, "'\\''") + "'";
}
