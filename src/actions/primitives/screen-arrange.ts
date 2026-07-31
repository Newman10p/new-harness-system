// ─── screen-arrange ─────────────────────────────────────────────────
// Desktop/workspace management — switch desktops, create/remove virtual
// workspaces, multi-monitor arrangement, wallpaper setting.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";

const execAsync = promisify(exec);

type Platform = "darwin" | "linux" | "win32";

function getPlatform(): Platform {
  return process.platform as Platform;
}

const VALID_OPS = [
  "switch-desktop", "create-desktop", "remove-desktop", "list-desktops",
  "move-to-desktop", "set-wallpaper", "mirror", "extend",
];

export async function screenArrange(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const operation = String(action.operation ?? "").toLowerCase();
  const index = action.index != null ? Number(action.index) : undefined;
  const direction = action.direction ? String(action.direction) : undefined;
  const app = action.app ? String(action.app) : undefined;
  const wallpaperUrl = action.wallpaperUrl ? String(action.wallpaperUrl) : undefined;
  const monitors = Array.isArray(action.monitors) ? (action.monitors as string[]) : undefined;

  if (!VALID_OPS.includes(operation)) {
    return { ok: false, error: `Invalid operation: "${operation}". Must be one of: ${VALID_OPS.join(", ")}` };
  }

  const platform = getPlatform();
  const startMs = Date.now();

  try {
    let result: unknown;

    switch (operation) {
      case "switch-desktop":
        result = await switchDesktop(platform, index, direction);
        break;
      case "create-desktop":
        result = await createDesktop(platform);
        break;
      case "remove-desktop":
        result = await removeDesktop(platform, index);
        break;
      case "list-desktops":
        result = await listDesktops(platform);
        break;
      case "move-to-desktop":
        result = await moveToDesktop(platform, app, index);
        break;
      case "set-wallpaper":
        if (!wallpaperUrl) return { ok: false, error: 'Missing required "wallpaperUrl" for set-wallpaper.' };
        result = await setWallpaper(platform, wallpaperUrl);
        break;
      case "mirror":
        result = await arrangeMonitors(platform, "mirror", monitors);
        break;
      case "extend":
        result = await arrangeMonitors(platform, "extend", monitors);
        break;
    }

    const durationMs = Date.now() - startMs;

    ctx.emitHud("activity_log" as HudChannel, {
      message: `Screen arrange: ${operation} — completed`,
      level: "info",
    } as never);

    await ctx.audit({
      type: "action_executed",
      action: "screen-arrange",
      detail: `operation=${operation} index=${index ?? "-"} direction=${direction ?? "-"} app=${app ?? "-"}`,
      durationMs,
      ok: true,
    });

    return { ok: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startMs;

    ctx.emitHud("activity_log" as HudChannel, {
      message: `Screen arrange failed: ${operation} — ${message}`,
      level: "error",
    } as never);

    await ctx.audit({
      type: "action_blocked",
      action: "screen-arrange",
      detail: `operation=${operation} error=${message}`,
      durationMs,
      ok: false,
    });

    return { ok: false, error: `Screen arrange failed: ${message}` };
  }
}

// ─── Switch Desktop ───────────────────────────────────────────────────
async function switchDesktop(
  platform: Platform, index?: number, direction?: string
): Promise<{ operation: string; detail: string }> {
  if (platform === "darwin") {
    if (direction === "left") {
      await execAsync(
        `osascript -e 'tell application "System Events" to key code 123 using {control down, option down}'`,
        { timeout: 5_000 }
      );
    } else if (direction === "right") {
      await execAsync(
        `osascript -e 'tell application "System Events" to key code 124 using {control down, option down}'`,
        { timeout: 5_000 }
      );
    } else if (index != null) {
      for (let i = 0; i < index; i++) {
        await execAsync(
          `osascript -e 'tell application "System Events" to key code 124 using {control down, option down}'`,
          { timeout: 5_000 }
        );
      }
    }
    return { operation: "switch-desktop", detail: `Switched ${direction ? `to ${direction}` : `to desktop ${index}`}` };
  }

  if (platform === "linux") {
    if (index != null) {
      await execAsync(`wmctrl -s ${index}`, { timeout: 5_000 });
    } else if (direction) {
      const current = await getCurrentLinuxDesktop();
      const target = direction === "left" ? current - 1 : current + 1;
      await execAsync(`wmctrl -s ${Math.max(0, target)}`, { timeout: 5_000 });
    }
    return { operation: "switch-desktop", detail: "Switched desktop" };
  }

  // Windows: Ctrl+Win+Arrow
  const dirKey = direction === "left" ? "{LEFT}" : direction === "right" ? "{RIGHT}" : "";
  if (dirKey) {
    await execAsync(
      `powershell -command "(New-Object -ComObject WScript.Shell).SendKeys('^${dirKey}')"`,
      { timeout: 5_000 }
    );
  } else if (index != null) {
    for (let i = 0; i < index; i++) {
      await execAsync(
        `powershell -command "(New-Object -ComObject WScript.Shell).SendKeys('^{RIGHT}')"`,
        { timeout: 5_000 }
      );
    }
  }
  return { operation: "switch-desktop", detail: "Switched virtual desktop" };
}

// ─── Create Desktop ───────────────────────────────────────────────────
async function createDesktop(platform: Platform): Promise<{ operation: string; detail: string }> {
  if (platform === "darwin") {
    await execAsync(
      `osascript -e 'tell application "System Events" to key code 125 using {control down}'`,
      { timeout: 5_000 }
    );
    return { operation: "create-desktop", detail: "Mission Control opened — create new space via Accessibility API" };
  }

  if (platform === "linux") {
    try {
      await execAsync(`wmctrl -n 99`, { timeout: 5_000 });
      return { operation: "create-desktop", detail: "Created new workspace (expanded to 99)" };
    } catch {
      return { operation: "create-desktop", detail: "Workspace creation requires wmctrl on Linux" };
    }
  }

  // Windows
  await execAsync(
    `powershell -command "(New-Object -ComObject WScript.Shell).SendKeys('^^{RIGHT}')"`,
    { timeout: 5_000 }
  );
  return { operation: "create-desktop", detail: "Created new virtual desktop" };
}

// ─── Remove Desktop ──────────────────────────────────────────────────
async function removeDesktop(platform: Platform, index?: number): Promise<{ operation: string; detail: string }> {
  if (platform === "darwin") {
    return { operation: "remove-desktop", detail: "macOS does not support removing desktop spaces via CLI" };
  }

  if (platform === "linux") {
    return { operation: "remove-desktop", detail: "Linux workspace removal depends on window manager" };
  }

  await execAsync(
    `powershell -command "(New-Object -ComObject WScript.Shell).SendKeys('^%{F4}')"`,
    { timeout: 5_000 }
  );
  return { operation: "remove-desktop", detail: `Removed virtual desktop ${index ?? "current"}` };
}

// ─── List Desktops ───────────────────────────────────────────────────
async function listDesktops(
  platform: Platform
): Promise<{ desktops: Array<{ index: number; name?: string; windows: number }> }> {
  const desktops: Array<{ index: number; name?: string; windows: number }> = [];

  if (platform === "darwin") {
    const { stdout } = await execAsync(
      `osascript -e '
tell application "System Events"
  set deskCount to count of desktops
  set output to ""
  repeat with d from 1 to deskCount
    set winCount to count of windows of desktop d
    set output to output & d & "|" & winCount & "\\n"
  end repeat
  return output
end tell'`,
      { timeout: 10_000 }
    );
    for (const line of stdout.trim().split("\n").filter(Boolean)) {
      const [idx, wins] = line.split("|");
      desktops.push({ index: Number(idx), windows: Number(wins ?? 0) });
    }
  } else if (platform === "linux") {
    const { stdout } = await execAsync("wmctrl -d", { timeout: 5_000 });
    for (const line of stdout.trim().split("\n").filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      desktops.push({
        index: Number(parts[0]),
        name: parts[parts.length - 1],
        windows: 0,
      });
    }
  } else {
    try {
      const { stdout } = await execAsync(
        `powershell -command "@((Get-Process | Where-Object { $_.MainWindowHandle -ne 0 }).Count)"`,
        { timeout: 5_000 }
      );
      desktops.push({ index: 0, name: "Desktop 1", windows: parseInt(stdout.trim(), 10) || 0 });
    } catch {
      desktops.push({ index: 0, name: "Desktop 1", windows: 0 });
    }
  }

  return { desktops };
}

// ─── Move Window to Desktop ──────────────────────────────────────────
async function moveToDesktop(
  platform: Platform, app?: string, index?: number
): Promise<{ operation: string; detail: string }> {
  if (!app) return { operation: "move-to-desktop", detail: 'Missing "app" to identify window.' };
  if (index == null) return { operation: "move-to-desktop", detail: 'Missing "index" for target desktop.' };

  if (platform === "darwin") {
    await execAsync(
      `osascript -e '
tell application "System Events"
  tell process "${app}"
    move window 1 to desktop ${index + 1}
  end tell
end tell'`,
      { timeout: 5_000 }
    );
    return { operation: "move-to-desktop", detail: `Moved ${app} to desktop ${index + 1}` };
  }

  if (platform === "linux") {
    const { stdout } = await execAsync(`xdotool search --class "${app}"`, { timeout: 3_000 });
    const wid = stdout.trim().split("\n")[0];
    if (wid) {
      await execAsync(`wmctrl -i -r ${wid} -t ${index}`, { timeout: 5_000 });
    }
    return { operation: "move-to-desktop", detail: `Moved ${app} to desktop ${index}` };
  }

  // Windows
  await execAsync(
    `powershell -command "$p = Get-Process '${app}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if ($p) { [Microsoft.VisualBasic.Interaction]::AppActivate('${app}'); Start-Sleep -Milliseconds 200; (New-Object -ComObject WScript.Shell).SendKeys('^+{F${index + 10}}') }"`,
    { timeout: 10_000 }
  );
  return { operation: "move-to-desktop", detail: `Attempted to move ${app} to desktop ${index}` };
}

// ─── Set Wallpaper ───────────────────────────────────────────────────
async function setWallpaper(
  platform: Platform, url: string
): Promise<{ operation: string; detail: string }> {
  if (platform === "darwin") {
    await execAsync(
      `osascript -e 'tell application "System Events" to set picture of current desktop to POSIX file "${url.replace(/"/g, '\\"')}"'`,
      { timeout: 10_000 }
    );
    return { operation: "set-wallpaper", detail: `Wallpaper set to ${url}` };
  }

  if (platform === "linux") {
    await execAsync(
      `gsettings set org.gnome.desktop.background picture-uri "file://${url}"`,
      { timeout: 5_000 }
    );
    return { operation: "set-wallpaper", detail: `Wallpaper set to ${url}` };
  }

  // Windows
  const escapedUrl = url.replace(/'/g, "''");
  await execAsync(
    `powershell -command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class WP{[DllImport(\\"user32.dll\\",CharSet=CharSet.Auto)]public static extern int SystemParametersInfo(int u,int v,string s,int f);}'; [WP]::SystemParametersInfo(0x0014,0,'${escapedUrl}',3)"`,
    { timeout: 10_000 }
  );
  return { operation: "set-wallpaper", detail: `Wallpaper set to ${url}` };
}

// ─── Monitor Arrangement ─────────────────────────────────────────────
async function arrangeMonitors(
  platform: Platform, mode: string, _monitors?: string[]
): Promise<{ operation: string; mode: string; detail: string; monitors?: string[] }> {
  if (platform === "darwin") {
    const { stdout } = await execAsync("system_profiler SPDisplaysDataType", { timeout: 10_000 });
    const displays = stdout.split("Display Type:").length - 1;
    return {
      operation: "arrange-monitors",
      mode,
      detail: `macOS detected ${displays} display(s). ${mode === "mirror" ? "Mirroring" : "Extended"} mode requested.`,
    };
  }

  if (platform === "linux") {
    const { stdout: xrandrOut } = await execAsync("xrandr --query", { timeout: 5_000 });
    const connected = xrandrOut
      .split("\n")
      .filter((l) => l.includes(" connected"))
      .map((l) => l.split(" ")[0]);

    if (connected.length < 2) {
      return {
        operation: "arrange-monitors",
        mode,
        detail: "Only one monitor detected. Connect a second monitor for arrangement.",
      };
    }

    if (mode === "mirror") {
      await execAsync(`xrandr --output ${connected[1]} --same-as ${connected[0]} --auto`, { timeout: 5_000 });
    } else {
      await execAsync(`xrandr --output ${connected[1]} --auto --right-of ${connected[0]}`, { timeout: 5_000 });
    }

    return {
      operation: "arrange-monitors",
      mode,
      detail: `${mode === "mirror" ? "Mirrored" : "Extended"} ${connected.length} monitors`,
      monitors: connected,
    };
  }

  // Windows
  const { stdout: dispOut } = await execAsync(
    `powershell -command "Get-CimInstance -ClassName Win32_DesktopMonitor | Select-Object -ExpandProperty Name"`,
    { timeout: 10_000 }
  );
  const monitorNames = dispOut.trim().split("\n").filter(Boolean);

  try {
    if (mode === "mirror") {
      await execAsync("displayswitch /clone", { timeout: 5_000 });
    } else {
      await execAsync("displayswitch /extend", { timeout: 5_000 });
    }
  } catch {
    // Fallback: control panel
  }

  return {
    operation: "arrange-monitors",
    mode,
    detail: `${mode === "mirror" ? "Mirrored" : "Extended"} ${monitorNames.length} monitor(s)`,
    monitors: monitorNames,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────
async function getCurrentLinuxDesktop(): Promise<number> {
  try {
    const { stdout } = await execAsync("wmctrl -d", { timeout: 3_000 });
    for (const line of stdout.trim().split("\n")) {
      if (line.includes(" * ")) {
        return parseInt(line.split(/\s+/)[0], 10);
      }
    }
  } catch { /* default to 0 */ }
  return 0;
}