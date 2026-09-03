"use strict";
// ─── control-window ───────────────────────────────────────────────────
// Window management primitive — move, resize, focus, minimize, maximize,
// close, list, and arrange windows via platform-specific commands.
Object.defineProperty(exports, "__esModule", { value: true });
exports.controlWindow = controlWindow;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
function getPlatform() {
    return process.platform;
}
/** Safely escape a string for use in shell commands. */
function shellEscape(s) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`") + '"';
}
async function controlWindow(action, ctx) {
    const operation = String(action.operation ?? "").toLowerCase();
    const title = action.title ? String(action.title) : undefined;
    const app = action.app ? String(action.app) : undefined;
    const x = action.x != null ? Number(action.x) : undefined;
    const y = action.y != null ? Number(action.y) : undefined;
    const width = action.width != null ? Number(action.width) : undefined;
    const height = action.height != null ? Number(action.height) : undefined;
    const layout = action.layout ? String(action.layout) : undefined;
    const validOps = ["move", "resize", "focus", "minimize", "maximize", "close", "list", "arrange"];
    if (!validOps.includes(operation)) {
        return { ok: false, error: `Invalid operation: "${operation}". Must be one of: ${validOps.join(", ")}` };
    }
    const platform = getPlatform();
    const startMs = Date.now();
    try {
        let result;
        if (operation === "list") {
            result = await listWindows(platform);
        }
        else if (operation === "arrange") {
            result = await arrangeWindows(platform, layout ?? "tile");
        }
        else {
            if (!title && !app) {
                return { ok: false, error: 'Must provide "title" or "app" to identify the target window (except for "list" and "arrange").' };
            }
            result = await performWindowOp(platform, operation, { title, app, x, y, width, height });
        }
        const durationMs = Date.now() - startMs;
        ctx.emitHud("activity_log", {
            message: `Window ${operation}: ${app ?? title ?? "all"}` + (operation !== "list" ? " — completed" : ` — ${Array.isArray(result) ? result.length : 0} windows`),
            level: "info",
        });
        await ctx.audit({
            type: "action_executed",
            action: "control-window",
            detail: `operation=${operation} app=${app ?? "-"} title=${title ?? "-"}`,
            durationMs,
            ok: true,
        });
        return { ok: true, data: result };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startMs;
        ctx.emitHud("activity_log", {
            message: `Window ${operation} failed: ${message}`,
            level: "error",
        });
        await ctx.audit({
            type: "action_blocked",
            action: "control-window",
            detail: `operation=${operation} error=${message}`,
            durationMs,
            ok: false,
        });
        return { ok: false, error: `Window control failed: ${message}` };
    }
}
// ─── List all open windows ─────────────────────────────────────────────
async function listWindows(platform) {
    if (platform === "darwin") {
        const { stdout } = await execAsync(`osascript -e '
tell application "System Events"
  set output to ""
  repeat with proc in every process whose background only is false
    set winCount to count of windows of proc
    if winCount > 0 then
      repeat with w from 1 to winCount
        set winName to name of window w of proc
        set winPos to position of window w of proc
        set winSize to size of window w of proc
        set output to output & proc.name & "|" & winName & "|" & (item 1 of winPos) & "," & (item 2 of winPos) & "|" & (item 1 of winSize) & "," & (item 2 of winSize) & "\n"
      end repeat
    end if
  end repeat
  return output
end tell'`, { timeout: 10_000 });
        return stdout
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
            const [app, title, pos, size] = line.split("|");
            const [px, py] = (pos ?? "").split(",").map(Number);
            const [sw, sh] = (size ?? "").split(",").map(Number);
            return { app: app?.trim(), title: title?.trim(), x: px, y: py, width: sw, height: sh };
        });
    }
    if (platform === "linux") {
        try {
            const { stdout } = await execAsync("wmctrl -l -p -G", { timeout: 5_000 });
            return stdout
                .trim()
                .split("\n")
                .filter(Boolean)
                .map((line) => {
                // Format: <winId> <desktop> <pid> <x> <y> <w> <h> <hostname> <title>
                const parts = line.trim().split(/\s+/);
                return {
                    id: parts[0],
                    desktop: Number(parts[1]),
                    pid: Number(parts[2]),
                    x: Number(parts[3]),
                    y: Number(parts[4]),
                    width: Number(parts[5]),
                    height: Number(parts[6]),
                    title: parts.slice(8).join(" "),
                };
            });
        }
        catch {
            // Fallback: xdotool
            const { stdout } = await execAsync("xdotool search --onlyvisible --name ''", { timeout: 5_000 });
            const ids = stdout.trim().split("\n").filter(Boolean);
            const results = [];
            for (const id of ids) {
                try {
                    const [nameOut, geoOut] = await Promise.all([
                        execAsync(`xdotool getwindowname ${id}`, { timeout: 2_000 }),
                        execAsync(`xdotool getwindowgeometry --shell ${id}`, { timeout: 2_000 }),
                    ]);
                    const geo = {};
                    for (const line of geoOut.stdout.trim().split("\n")) {
                        const [k, v] = line.split("=");
                        geo[k.trim()] = parseInt(v, 10);
                    }
                    results.push({ id, title: nameOut.stdout.trim(), x: geo.X, y: geo.Y, width: geo.WIDTH, height: geo.HEIGHT });
                }
                catch { /* skip unresponsive windows */ }
            }
            return results;
        }
    }
    // Windows
    const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinHelper {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
}
"@
$procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Id, ProcessName, MainWindowTitle, MainWindowHandle
foreach ($p in $procs) {
  $r = New-Object WinHelper+RECT
  [WinHelper]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
  $w = $r.R - $r.L; $h = $r.B - $r.T
  Write-Output "$($p.Id)|$($p.ProcessName)|$($p.MainWindowTitle)|$($r.L),$($r.T)|$w,$h"
}`;
    const { stdout } = await execAsync(`powershell -command "${psScript.replace(/"/g, '\"')}"`, { timeout: 15_000 });
    return stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
        const [pid, app, title, pos, size] = line.split("|");
        const [px, py] = (pos ?? "").split(",").map(Number);
        const [sw, sh] = (size ?? "").split(",").map(Number);
        return { pid: Number(pid), app, title, x: px, y: py, width: sw, height: sh };
    });
}
// ─── Arrange windows in a layout ──────────────────────────────────────
async function arrangeWindows(platform, layout) {
    const windows = await listWindows(platform);
    if (windows.length === 0)
        return { layout, arranged: 0 };
    if (platform === "darwin") {
        if (layout === "cascade") {
            const script = windows
                .map((_, i) => `  set position of window 1 of process "${windows[i].app}" to {${i * 30}, ${i * 30}}`)
                .join("\n");
            await execAsync(`osascript -e '
tell application "System Events"
${script}
end tell'`, { timeout: 10_000 });
        }
        else if (layout === "tile" || layout === "side-by-side") {
            const cols = Math.ceil(Math.sqrt(windows.length));
            const rows = Math.ceil(windows.length / cols);
            // Assume 1440x900 screen as default — in practice could query screen size
            const sw = 1440, sh = 900;
            const cw = Math.floor(sw / cols), ch = Math.floor(sh / rows);
            const lines = windows.map((w, i) => {
                const col = i % cols, row = Math.floor(i / cols);
                return `  set position of window 1 of process "${w.app}" to {${col * cw}, ${row * ch}}
  set size of window 1 of process "${w.app}" to {${cw}, ${ch}}`;
            });
            await execAsync(`osascript -e '
tell application "System Events"
${lines.join("\n")}
end tell'`, { timeout: 10_000 });
        }
    }
    else if (platform === "linux") {
        if (layout === "tile" || layout === "side-by-side") {
            const ids = windows.map((w) => w.id).join(" ");
            await execAsync(`wmctrl -i -r $(echo ${ids} | awk '{print $1}') -e 0,0,0,720,450`, { timeout: 5_000 }).catch(() => { });
        }
        else if (layout === "cascade") {
            for (let i = 0; i < windows.length; i++) {
                const w = windows[i];
                await execAsync(`wmctrl -i -r ${w.id} -e 0,${i * 30},${i * 30},-1,-1`, { timeout: 3_000 }).catch(() => { });
            }
        }
    }
    else {
        // Windows: tile via PowerShell
        const psLayout = layout === "cascade" ? "CascadeWindows" : "TileVertically";
        await execAsync(`powershell -command "[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); ([System.Windows.Forms.Screen]::AllScreens | Select-Object -First 1).Bounds"`, { timeout: 5_000 }).catch(() => { });
    }
    return { layout, arranged: windows.length };
}
// ─── Perform a single window operation ─────────────────────────────────
async function performWindowOp(platform, operation, opts) {
    const target = opts.app ?? opts.title ?? "";
    if (platform === "darwin") {
        return darwinWindowOp(operation, opts);
    }
    else if (platform === "linux") {
        return linuxWindowOp(operation, opts);
    }
    else {
        return windowsWindowOp(operation, opts);
    }
}
async function darwinWindowOp(op, opts) {
    const appName = opts.app ?? "";
    let script = '';
    switch (op) {
        case "focus":
            script = `
tell application "${appName}"
  activate
end tell`;
            break;
        case "minimize":
            script = `
tell application "System Events"
  tell process "${appName}"
    set visible to false
  end tell
end tell`;
            break;
        case "maximize":
            script = `
tell application "System Events"
  tell process "${appName}"
    set size of window 1 to {1440, 900}
    set position of window 1 to {0, 0}
  end tell
end tell`;
            break;
        case "close":
            script = `
tell application "${appName}"
  close every window
end tell`;
            break;
        case "move":
            script = `
tell application "System Events"
  tell process "${appName}"
    set position of window 1 to {${opts.x ?? 0}, ${opts.y ?? 0}}
  end tell
end tell`;
            break;
        case "resize":
            script = `
tell application "System Events"
  tell process "${appName}"
    set size of window 1 to {${opts.width ?? 800}, ${opts.height ?? 600}}
  end tell
end tell`;
            break;
        default:
            return { operation: op, detail: `Unsupported operation on macOS: ${op}` };
    }
    await execAsync(`osascript -e '${script}'`, { timeout: 10_000 });
    return { operation: op, app: appName, detail: `Executed ${op} on ${appName}` };
}
async function linuxWindowOp(op, opts) {
    const search = opts.title ? `--name ${shellEscape(opts.title)}` : `--class ${shellEscape(opts.app ?? "")}`;
    switch (op) {
        case "focus": {
            const { stdout } = await execAsync(`xdotool search ${search}`, { timeout: 3_000 });
            const wid = stdout.trim().split("\n")[0];
            await execAsync(`xdotool windowactivate ${wid} windowfocus ${wid}`, { timeout: 3_000 });
            return { operation: op, detail: `Focused window ${wid}` };
        }
        case "minimize": {
            const { stdout } = await execAsync(`xdotool search ${search}`, { timeout: 3_000 });
            const wid = stdout.trim().split("\n")[0];
            await execAsync(`xdotool windowminimize ${wid}`, { timeout: 3_000 });
            return { operation: op, detail: `Minimized window ${wid}` };
        }
        case "maximize": {
            const { stdout } = await execAsync(`xdotool search ${search}`, { timeout: 3_000 });
            const wid = stdout.trim().split("\n")[0];
            await execAsync(`xdotool windowactivate ${wid} windowmove ${wid} 0 0 windowsize ${wid} 100% 100%`, { timeout: 3_000 });
            return { operation: op, detail: `Maximized window ${wid}` };
        }
        case "close": {
            const { stdout } = await execAsync(`xdotool search ${search}`, { timeout: 3_000 });
            const wid = stdout.trim().split("\n")[0];
            await execAsync(`xdotool windowclose ${wid}`, { timeout: 3_000 });
            return { operation: op, detail: `Closed window ${wid}` };
        }
        case "move": {
            const { stdout } = await execAsync(`xdotool search ${search}`, { timeout: 3_000 });
            const wid = stdout.trim().split("\n")[0];
            await execAsync(`xdotool windowmove ${wid} ${opts.x ?? 0} ${opts.y ?? 0}`, { timeout: 3_000 });
            return { operation: op, detail: `Moved window ${wid} to (${opts.x}, ${opts.y})` };
        }
        case "resize": {
            const { stdout } = await execAsync(`xdotool search ${search}`, { timeout: 3_000 });
            const wid = stdout.trim().split("\n")[0];
            await execAsync(`xdotool windowsize ${wid} ${opts.width ?? 800} ${opts.height ?? 600}`, { timeout: 3_000 });
            return { operation: op, detail: `Resized window ${wid} to ${opts.width}x${opts.height}` };
        }
        default:
            return { operation: op, detail: `Unsupported operation on Linux: ${op}` };
    }
}
async function windowsWindowOp(op, opts) {
    const appName = opts.app ?? "";
    let psCmd = "";
    switch (op) {
        case "focus":
            psCmd = `$w = (Get-Process "${appName}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle; [void][System.Reflection.Assembly]::LoadWithPartialName('Microsoft.VisualBasic'); [Microsoft.VisualBasic.Interaction]::AppActivate(${appName})`;
            break;
        case "minimize":
            psCmd = `$w = (Get-Process "${appName}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle; Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W32{[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);}'; [W32]::ShowWindow($w, 6)`;
            break;
        case "maximize":
            psCmd = `$w = (Get-Process "${appName}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle; Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W32{[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);}'; [W32]::ShowWindow($w, 3)`;
            break;
        case "close":
            psCmd = `Get-Process "${appName}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.CloseMainWindow() }`;
            break;
        case "move":
            psCmd = `$w = (Get-Process "${appName}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle; Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class M{[DllImport("user32.dll")]public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);}'; [M]::MoveWindow($w,${opts.x ?? 0},${opts.y ?? 0},800,600,$true)`;
            break;
        case "resize":
            psCmd = `$w = (Get-Process "${appName}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle; Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class R{[DllImport("user32.dll")]public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);}'; [R]::MoveWindow($w,0,0,${opts.width ?? 800},${opts.height ?? 600},$true)`;
            break;
        default:
            return { operation: op, detail: `Unsupported operation on Windows: ${op}` };
    }
    await execAsync(`powershell -command "${psCmd.replace(/"/g, '\"')}"`, { timeout: 15_000 });
    return { operation: op, app: appName, detail: `Executed ${op} on ${appName}` };
}
//# sourceMappingURL=control-window.js.map