// ─── input-inject ─────────────────────────────────────────────────────
// Keyboard and mouse input injection. Supports key, text, mouse, scroll,
// and shortcut types across macOS, Linux, and Windows.
// All injections are audit-logged for safety.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";

const execAsync = promisify(exec);

type Platform = "darwin" | "linux" | "win32";

function getPlatform(): Platform {
  return process.platform as Platform;
}

/** Safely escape a string for shell usage. */
function shellEscape(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\\$").replace(/`/g, "\\`") + '"';
}

/** Parse shortcut string like "ctrl+c", "cmd+shift+3" into platform keys. */
function parseShortcut(shortcut: string, platform: Platform): string {
  const parts = shortcut.toLowerCase().split("+").map((s) => s.trim());
  const modifiers: string[] = [];
  const keyParts: string[] = [];

  for (const part of parts) {
    if (["ctrl", "control", "cmd", "command", "alt", "option", "shift", "super", "win", "meta"].includes(part)) {
      modifiers.push(part);
    } else {
      keyParts.push(part);
    }
  }

  if (platform === "darwin") {
    const map: Record<string, string> = {
      ctrl: "control down", control: "control down",
      alt: "option down", option: "option down",
      shift: "shift down",
      cmd: "command down", command: "command down", super: "command down", meta: "command down",
    };
    const upMap: Record<string, string> = {
      ctrl: "control up", control: "control up",
      alt: "option up", option: "option up",
      shift: "shift up",
      cmd: "command up", command: "command up", super: "command up", meta: "command up",
    };
    const modDown = modifiers.map((m) => map[m] ?? m + " down").join(", ");
    const modUp = modifiers.map((m) => upMap[m] ?? m + " up").join(", ");
    const key = keyParts[0] ?? "";
    // Map common key names
    const keyName: Record<string, string> = { tab: "tab", enter: "return", escape: "escape", esc: "escape", space: "space", backspace: "delete", delete: "delete" };
    const keyStr = keyName[key] ?? key.toUpperCase();
    return `{${modDown}}, keystroke "${keyStr}", {${modUp}}`;
  }

  if (platform === "linux") {
    const map: Record<string, string> = {
      ctrl: "ctrl", control: "ctrl",
      alt: "alt", option: "alt",
      shift: "shift",
      cmd: "super", command: "super", super: "super", win: "super", meta: "super",
    };
    const mods = modifiers.map((m) => map[m] ?? m).join("+");
    const key = keyParts[0] ?? "";
    const keyName: Record<string, string> = { tab: "Tab", enter: "Return", escape: "Escape", esc: "Escape", space: "space", backspace: "BackSpace", delete: "Delete" };
    const keyStr = keyName[key] ?? key;
    return mods ? `${mods}+${keyStr}` : keyStr;
  }

  // Windows
  const map: Record<string, string> = {
    ctrl: "^", control: "^",
    alt: "%", option: "%",
    shift: "+",
    cmd: "^", command: "^", super: "^", win: "^", meta: "^",
  };
  const mods = modifiers.map((m) => map[m] ?? "").join("");
  const key = keyParts[0] ?? "";
  const keyName: Record<string, string> = { tab: "{TAB}", enter: "~", return: "~", escape: "{ESC}", esc: "{ESC}", space: " ", backspace: "{BACKSPACE}", delete: "{DELETE}" };
  const keyStr = keyName[key] ?? key.toUpperCase();
  return mods + keyStr;
}

export async function inputInject(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const type = String(action.type ?? "").toLowerCase();
  const key = action.key ? String(action.key) : undefined;
  const text = action.text ? String(action.text) : undefined;
  const mouseX = action.mouseX != null ? Number(action.mouseX) : undefined;
  const mouseY = action.mouseY != null ? Number(action.mouseY) : undefined;
  const mouseButton = action.mouseButton ? String(action.mouseButton) : "left";
  const scrollX = action.scrollX != null ? Number(action.scrollX) : 0;
  const scrollY = action.scrollY != null ? Number(action.scrollY) : 0;
  const shortcut = action.shortcut ? String(action.shortcut) : undefined;
  const delay = action.delay != null ? Number(action.delay) : 0;

  const validTypes = ["key", "text", "mouse", "scroll", "shortcut"];
  if (!validTypes.includes(type)) {
    return { ok: false, error: `Invalid input type: "${type}". Must be one of: ${validTypes.join(", ")}` };
  }

  const platform = getPlatform();
  const startMs = Date.now();

  // Audit log the injection for safety
  const auditDetail = `type=${type} key=${key ?? "-"} text=${text ? JSON.stringify(text) : "-"} ` +
    `mouse=(${mouseX ?? "-"},${mouseY ?? "-"}) button=${mouseButton} ` +
    `scroll=(${scrollX},${scrollY}) shortcut=${shortcut ?? "-"}`;

  try {
    if (type === "key") {
      if (!key) return { ok: false, error: 'Missing "key" for type "key".' };
      await injectKey(platform, key, delay);
    } else if (type === "text") {
      if (!text) return { ok: false, error: 'Missing "text" for type "text".' };
      await injectText(platform, text, delay);
    } else if (type === "mouse") {
      await injectMouse(platform, mouseX ?? 0, mouseY ?? 0, mouseButton);
    } else if (type === "scroll") {
      await injectScroll(platform, scrollX, scrollY);
    } else if (type === "shortcut") {
      if (!shortcut) return { ok: false, error: 'Missing "shortcut" for type "shortcut".' };
      await injectShortcut(platform, shortcut);
    }

    const durationMs = Date.now() - startMs;

    ctx.emitHud("activity_log" as HudChannel, {
      message: `Input injected: ${type}` + (shortcut ? ` (${shortcut})` : "") + (text ? ` "${text.substring(0, 30)}${text.length > 30 ? "..." : ""}"` : ""),
      level: "info",
    } as never);

    await ctx.audit({
      type: "action_executed",
      action: "input-inject",
      detail: auditDetail,
      durationMs,
      ok: true,
    });

    return { ok: true, data: { type, injected: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startMs;

    await ctx.audit({
      type: "action_blocked",
      action: "input-inject",
      detail: `${auditDetail} error=${message}`,
      durationMs,
      ok: false,
    });

    return { ok: false, error: `Input injection failed: ${message}` };
  }
}

// ─── Key injection ─────────────────────────────────────────────────────
async function injectKey(platform: Platform, key: string, _delay: number): Promise<void> {
  const keyName: Record<string, string> = { tab: "tab", enter: "return", escape: "escape", esc: "escape", space: "space", backspace: "delete", delete: "delete", up: "up", down: "down", left: "left", right: "right" };
  const k = keyName[key.toLowerCase()] ?? key.toUpperCase();

  if (platform === "darwin") {
    await execAsync(`osascript -e 'tell application "System Events" to keystroke "${k}"'`, { timeout: 5_000 });
  } else if (platform === "linux") {
    const mapped = keyName[key.toLowerCase()] ?? key;
    await execAsync(`xdotool key ${shellEscape(mapped)}`, { timeout: 5_000 });
  } else {
    const psKey = keyName[key.toLowerCase()] ? `{${keyName[key.toLowerCase()].toUpperCase()}}` : key.toUpperCase();
    await execAsync(`powershell -command "New-Object -ComObject WScript.Shell | ForEach-Object { $_.SendKeys('${psKey}') }"`, { timeout: 5_000 });
  }
}

// ─── Text injection ────────────────────────────────────────────────────
async function injectText(platform: Platform, text: string, delay: number): Promise<void> {
  if (platform === "darwin") {
    if (delay > 0) {
      // Inject character by character with delay
      for (const char of text) {
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "${char.replace(/"/g, '\\"')}"'`, { timeout: 3_000 });
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      }
    } else {
      await execAsync(`osascript -e 'tell application "System Events" to keystroke "${text.replace(/"/g, '\\"')}"'`, { timeout: 10_000 });
    }
  } else if (platform === "linux") {
    await execAsync(`xdotool type --delay ${delay} ${shellEscape(text)}`, { timeout: 10_000 });
  } else {
    // Windows: use clipboard method for reliability
    const escaped = text.replace(/'/g, "''").replace(/{/g, '{{').replace(/}/g, '}}');
    await execAsync(`powershell -command "$text = '${escaped}'; Set-Clipboard $text; Start-Sleep -Milliseconds 100; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`, { timeout: 10_000 });
  }
}

// ─── Mouse injection ───────────────────────────────────────────────────
async function injectMouse(platform: Platform, x: number, y: number, button: string): Promise<void> {
  if (platform === "darwin") {
    // Move then click using cliclick if available, otherwise osascript
    try {
      const btnCode = button === "right" ? "2" : button === "middle" ? "3" : "1";
      await execAsync(`cliclick m:${x},${y} c:${btnCode}`, { timeout: 5_000 });
    } catch {
      await execAsync(`osascript -e '
tell application "System Events"
  do shell script "cliclick m:${x},${y}"
end tell'`, { timeout: 5_000 }).catch(() => {
        throw new Error('Mouse control on macOS requires "cliclick". Install with: brew install cliclick');
      });
    }
  } else if (platform === "linux") {
    await execAsync(`xdotool mousemove ${x} ${y}`, { timeout: 3_000 });
    const btnMap: Record<string, number> = { left: 1, middle: 2, right: 3 };
    const btn = btnMap[button] ?? 1;
    await execAsync(`xdotool click ${btn}`, { timeout: 3_000 });
  } else {
    const btnClick = button === "right" ? "RightClick" : button === "middle" ? "MiddleClick" : "LeftClick";
    await execAsync(
      `powershell -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y}); Start-Sleep -Milliseconds 50; [System.Windows.Forms.SendKeys]::SendWait('{${btnClick}}')"`,
      { timeout: 5_000 }
    ).catch(async () => {
      // Fallback: use nircmd if available
      await execAsync(`nircmd.exe setcursor ${x} ${y} && nircmd.exe sendmouse ${button} click ${x} ${y}`, { timeout: 5_000 });
    });
  }
}

// ─── Scroll injection ──────────────────────────────────────────────────
async function injectScroll(platform: Platform, scrollX: number, scrollY: number): Promise<void> {
  if (platform === "darwin") {
    // Use cliclick for scrolling if available
    if (scrollY !== 0) {
      const clicks = Math.abs(Math.round(scrollY / 3)); // each click = ~3 units
      const direction = scrollY > 0 ? "4" : "5"; // 4=scroll down, 5=scroll up in cliclick
      try {
        await execAsync(`cliclick ${Array(clicks).fill(`sd:${direction}`).join(" ")}`, { timeout: 5_000 });
      } catch {
        await execAsync(`osascript -e 'tell application "System Events" to scroll ${scrollY}'`, { timeout: 5_000 });
      }
    }
  } else if (platform === "linux") {
    if (scrollY !== 0) {
      const btn = scrollY > 0 ? 5 : 4; // 5=down, 4=up
      const clicks = Math.abs(Math.round(scrollY / 3));
      await execAsync(`xdotool click --repeat ${clicks} ${btn}`, { timeout: 5_000 });
    }
    if (scrollX !== 0) {
      const btn = scrollX > 0 ? 7 : 6; // 7=right, 6=left
      const clicks = Math.abs(Math.round(scrollX / 3));
      await execAsync(`xdotool click --repeat ${clicks} ${btn}`, { timeout: 5_000 });
    }
  } else {
    // Windows: use PowerShell mouse_event
    const dy = Math.round(scrollY);
    const dx = Math.round(scrollX);
    if (dy !== 0 || dx !== 0) {
      await execAsync(
        `powershell -command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class ScrollInput{[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint dx,uint dy,uint d,uint e);}'; [ScrollInput]::mouse_event(0x0800,${dx},${dy},0,0)"`,
        { timeout: 5_000 }
      );
    }
  }
}

// ─── Shortcut injection ───────────────────────────────────────────────
async function injectShortcut(platform: Platform, shortcut: string): Promise<void> {
  if (platform === "darwin") {
    const expr = parseShortcut(shortcut, platform);
    await execAsync(`osascript -e 'tell application "System Events" to ${expr}'`, { timeout: 5_000 });
  } else if (platform === "linux") {
    const keys = parseShortcut(shortcut, platform);
    await execAsync(`xdotool key ${shellEscape(keys)}`, { timeout: 5_000 });
  } else {
    const keys = parseShortcut(shortcut, platform);
    await execAsync(`powershell -command "New-Object -ComObject WScript.Shell | ForEach-Object { $_.SendKeys('${keys}') }"`, { timeout: 5_000 });
  }
}
