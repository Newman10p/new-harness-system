// ─── clipboard-read ──────────────────────────────────────────────────────
// Reads text content from the system clipboard using platform-specific commands.
// Windows: powershell Get-Clipboard, Linux: xclip/xsel, macOS: pbpaste.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const execAsync = promisify(exec);

function getCommand(): string {
  const platform = os.platform();
  if (platform === "win32") {
    return 'powershell -command "Get-Clipboard -Raw"';
  }
  if (platform === "darwin") {
    return "pbpaste";
  }
  // Linux — try xclip first, then xsel
  return "xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null";
}

export async function clipboardRead(
  _action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to read clipboard: ${message}. Ensure a clipboard tool is installed (xclip/xsel on Linux, pbpaste on macOS, or PowerShell on Windows).`,
    };
  }
}
