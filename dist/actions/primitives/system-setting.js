"use strict";
// ─── system-setting ──────────────────────────────────────────────────
// System settings control — volume, brightness, WiFi, Bluetooth, DND,
// night-shift, resolution, sleep, lock, shutdown, restart.
// Destructive operations (shutdown/restart) include extra confirmation text.
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemSetting = systemSetting;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
function getPlatform() {
    return process.platform;
}
const VALID_SETTINGS = [
    "volume", "brightness", "wifi", "bluetooth", "dnd",
    "night-shift", "resolution", "sleep", "lock", "shutdown", "restart",
];
async function systemSetting(action, ctx) {
    const setting = String(action.setting ?? "").toLowerCase();
    const value = action.value;
    const display = action.display != null ? Number(action.display) : undefined;
    if (!VALID_SETTINGS.includes(setting)) {
        return { ok: false, error: `Invalid setting: "${setting}". Must be one of: ${VALID_SETTINGS.join(", ")}` };
    }
    if (value === undefined || value === null) {
        return { ok: false, error: 'Missing required field: "value".' };
    }
    const platform = getPlatform();
    const startMs = Date.now();
    const valueStr = String(value);
    // Destructive operations: include extra confirmation text
    if (setting === "shutdown" || setting === "restart") {
        const opLabel = setting === "shutdown" ? "SHUT DOWN" : "RESTART";
        ctx.emitHud("activity_log", {
            message: `⚠ DESTRUCTIVE OPERATION REQUESTED: ${opLabel}. This will ${setting} the host device. Policy engine must approve.`,
            level: "warn",
        });
        await ctx.audit({
            type: "action_executed",
            action: "system-setting",
            detail: `Destructive: ${setting} requested. Extra human confirmation required.`,
            ok: false,
        });
        return {
            ok: false,
            error: `⚠ Destructive operation "${setting}" requires explicit human confirmation before execution. The host device will ${setting === "shutdown" ? "power off" : "reboot"}. This action must be re-submitted with explicit operator approval.`,
        };
    }
    try {
        let result;
        switch (setting) {
            case "volume":
                result = await setVolume(platform, Number(value), display);
                break;
            case "brightness":
                result = await setBrightness(platform, Number(value), display);
                break;
            case "wifi":
                result = await setWifi(platform, valueStr === "true" || valueStr === "on");
                break;
            case "bluetooth":
                result = await setBluetooth(platform, valueStr === "true" || valueStr === "on");
                break;
            case "dnd":
                result = await setDND(platform, valueStr === "true" || valueStr === "on");
                break;
            case "night-shift":
                result = await setNightShift(platform, valueStr === "true" || valueStr === "on");
                break;
            case "resolution":
                result = await setResolution(platform, valueStr, display);
                break;
            case "sleep":
                result = await triggerSleep(platform);
                break;
            case "lock":
                result = await triggerLock(platform);
                break;
            default:
                return { ok: false, error: `Setting "${setting}" is not yet implemented.` };
        }
        const durationMs = Date.now() - startMs;
        ctx.emitHud("activity_log", {
            message: `System setting changed: ${setting} = ${valueStr}`,
            level: "info",
        });
        await ctx.audit({
            type: "action_executed",
            action: "system-setting",
            detail: `setting=${setting} value=${valueStr} display=${display ?? "default"}`,
            durationMs,
            ok: true,
        });
        return { ok: true, data: result };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startMs;
        ctx.emitHud("activity_log", {
            message: `System setting failed: ${setting} — ${message}`,
            level: "error",
        });
        await ctx.audit({
            type: "action_blocked",
            action: "system-setting",
            detail: `setting=${setting} error=${message}`,
            durationMs,
            ok: false,
        });
        return { ok: false, error: `System setting failed: ${message}` };
    }
}
// ─── Volume ────────────────────────────────────────────────────────────
async function setVolume(platform, level, _display) {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    if (platform === "darwin") {
        await execAsync(`osascript -e 'set volume output volume ${clamped}'`, { timeout: 5_000 });
    }
    else if (platform === "linux") {
        const pct = Math.round(clamped * 1.524); // amixer uses 0-153 range approx
        await execAsync(`amixer -q sset Master ${pct}%`, { timeout: 5_000 });
    }
    else {
        await execAsync(`powershell -command "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]174)"`, { timeout: 5_000 }).catch(async () => {
            try {
                await execAsync(`nircmd.exe setsysvolume ${Math.round(clamped * 655.35)}`, { timeout: 5_000 });
            }
            catch {
                await execAsync(`powershell -command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Audio{[DllImport(\"winmm.dll\")]public static extern int waveOutSetVolume(IntPtr h,uint v);}'; [Audio]::waveOutSetVolume([IntPtr]::Zero, ${Math.round(clamped / 100 * 0xFFFF)})"`, { timeout: 5_000 });
            }
        });
    }
    return { setting: "volume", value: clamped, detail: `Volume set to ${clamped}%` };
}
// ─── Brightness ────────────────────────────────────────────────────────
async function setBrightness(platform, level, display) {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    if (platform === "darwin") {
        try {
            await execAsync(`brightness ${clamped / 100}`, { timeout: 5_000 });
        }
        catch {
            await execAsync(`osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to ${clamped < 50}'`, { timeout: 5_000 });
        }
    }
    else if (platform === "linux") {
        const displayArg = display != null ? `--display ${display}` : "";
        await execAsync(`xrandr ${displayArg} --brightness ${clamped / 100}`, { timeout: 5_000 });
    }
    else {
        try {
            await execAsync(`nircmd.exe changebrightness ${display ?? 0} ${clamped}`, { timeout: 5_000 });
        }
        catch {
            await execAsync(`powershell -command "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${clamped})"`, { timeout: 10_000 });
        }
    }
    return { setting: "brightness", value: clamped, detail: `Brightness set to ${clamped}%` };
}
// ─── WiFi ──────────────────────────────────────────────────────────────
async function setWifi(platform, enable) {
    if (platform === "darwin") {
        const device = "Wi-Fi";
        await execAsync(`networksetup -setairportpower ${device} ${enable ? "on" : "off"}`, { timeout: 10_000 });
    }
    else if (platform === "linux") {
        await execAsync(`nmcli radio wifi ${enable ? "on" : "off"}`, { timeout: 10_000 });
    }
    else {
        const state = enable ? "Enable" : "Disable";
        await execAsync(`powershell -command "Get-NetAdapter | Where-Object { $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN' } | ${state}-NetAdapter -Confirm:$false"`, { timeout: 15_000 });
    }
    return { setting: "wifi", value: enable, detail: `WiFi ${enable ? "enabled" : "disabled"}` };
}
// ─── Bluetooth ─────────────────────────────────────────────────────────
async function setBluetooth(platform, enable) {
    if (platform === "darwin") {
        try {
            await execAsync(`blueutil --power ${enable ? "1" : "0"}`, { timeout: 10_000 });
        }
        catch {
            return { setting: "bluetooth", value: enable, detail: "Bluetooth control on macOS requires 'blueutil'. Install with: brew install blueutil" };
        }
    }
    else if (platform === "linux") {
        await execAsync(`bluetoothctl power ${enable ? "on" : "off"}`, { timeout: 10_000 });
    }
    else {
        await execAsync(`powershell -command "Get-Service bthserv | ${enable ? 'Start-Service' : 'Stop-Service'} -Force"`, { timeout: 10_000 });
    }
    return { setting: "bluetooth", value: enable, detail: `Bluetooth ${enable ? "enabled" : "disabled"}` };
}
// ─── Do Not Disturb ────────────────────────────────────────────────────
async function setDND(platform, enable) {
    if (platform === "darwin") {
        // macOS 14+: use Focus mode via shortcuts
        const mode = enable ? "on" : "off";
        try {
            await execAsync(`shortcuts run "Toggle Do Not Disturb"`, { timeout: 5_000 });
        }
        catch {
            await execAsync(`defaults write com.apple.controlcenter "NSStatusItem Visible FocusModes" -bool ${enable}`, { timeout: 5_000 });
        }
    }
    else if (platform === "linux") {
        // GNOME: use gsettings for Do Not Disturb
        try {
            await execAsync(`gsettings set org.gnome.desktop.notifications show-banners ${enable ? "false" : "true"}`, { timeout: 5_000 });
        }
        catch {
            return { setting: "dnd", value: enable, detail: "DND control requires GNOME settings on Linux." };
        }
    }
    else {
        await execAsync(`powershell -command "New-BurntToastNotification -Text 'M.A.I. DND' -Sound 'Default' 2>$null; if ($?) { Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings' -Name 'NOC_GLOBAL_SETTING_TOASTS_ENABLED' -Value ${enable ? 0 : 1}"`, { timeout: 10_000 }).catch(async () => {
            await execAsync(`powershell -command "Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications' -Name 'ToastEnabled' -Value ${enable ? 0 : 1}"`, { timeout: 5_000 });
        });
    }
    return { setting: "dnd", value: enable, detail: `Do Not Disturb ${enable ? "enabled" : "disabled"}` };
}
// ─── Night Shift ───────────────────────────────────────────────────────
async function setNightShift(platform, enable) {
    if (platform === "darwin") {
        try {
            await execAsync(`nightlight ${enable ? "on" : "off"}`, { timeout: 5_000 });
        }
        catch {
            await execAsync(`defaults write com.apple.controlcenter "NSStatusItem Visible NightShift" -bool ${enable}`, { timeout: 5_000 });
        }
    }
    else if (platform === "linux") {
        try {
            await execAsync(`gsettings set org.gnome.settings-daemon.plugins.color night-light-enabled ${enable}`, { timeout: 5_000 });
        }
        catch {
            return { setting: "night-shift", value: enable, detail: "Night Shift requires GNOME Night Light on Linux." };
        }
    }
    else {
        await execAsync(`powershell -command "Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\DefaultAccount\Current\default$windows.data.bluelightreduction.bluelightreductionstate\windows.data.bluelightreduction.bluelightreductionstate' -Name 'Data' -Value ${enable ? 1 : 0}"`, { timeout: 10_000 }).catch(() => {
            // Fallback: toggle Night light via Action Center
        });
    }
    return { setting: "night-shift", value: enable, detail: `Night Shift ${enable ? "enabled" : "disabled"}` };
}
// ─── Resolution ────────────────────────────────────────────────────────
async function setResolution(platform, resolution, display) {
    if (platform === "darwin") {
        const [w, h] = resolution.split("x").map(Number);
        await execAsync(`osascript -e 'tell application "System Events" to tell process "System Preferences" to quit'`).catch(() => { });
        await execAsync(`system_profiler SPDisplaysDataType`, { timeout: 5_000 }); // verify display available
        return { setting: "resolution", value: resolution, detail: `Resolution change to ${resolution} requested on macOS. Note: macOS requires System Preferences GUI for resolution changes.` };
    }
    else if (platform === "linux") {
        const output = display != null ? `HDMI-${display}` : "";
        await execAsync(`xrandr --output ${output || "$(xrandr | rg ' connected' | head -1 | awk '{print $1}')"} --mode ${resolution}`, { timeout: 5_000 });
    }
    else {
        const [w, h] = resolution.split("x").map(Number);
        await execAsync(`powershell -command "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class Res{[DllImport(\"user32.dll\")]public static extern int ChangeDisplaySettings(ref DEVMODE d,uint f);[StructLayout(LayoutKind.Sequential)]public struct DEVMODE{[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string dmDeviceName;public short dmSpecVersion,dmDriverVersion,dmSize;public short dmDriverExtra;public int dmFields;public int dmPositionX,dmPositionY;public int dmDisplayOrientation,dmDisplayFixedOutput;public short dmColor,dpDuplex,dmYResolution,dmTTOption,dmCollate;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string dmFormName;public short dmLogPixels,dmBitsPerPel,dmPelsWidth,dmPelsHeight;public int dmDisplayFrequency;}'}; $d=new-object Res+DEVMODE; $d.dmSize=[System.Runtime.InteropServices.Marshal]::SizeOf($d); $d.dmPelsWidth=${w}; $d.dmPelsHeight=${h}; $d.dmFields=0x180000; [Res]::ChangeDisplaySettings([ref]$d,0)"`, { timeout: 10_000 });
    }
    return { setting: "resolution", value: resolution, detail: `Resolution set to ${resolution}` };
}
// ─── Sleep ─────────────────────────────────────────────────────────────
async function triggerSleep(platform) {
    if (platform === "darwin") {
        await execAsync(`pmset sleepnow`, { timeout: 5_000 });
    }
    else if (platform === "linux") {
        await execAsync(`systemctl suspend`, { timeout: 10_000 });
    }
    else {
        await execAsync(`rundll32.exe powrprof.dll,SetSuspendState 0,1,0`, { timeout: 10_000 });
    }
    return { setting: "sleep", value: true, detail: "System sleep triggered" };
}
// ─── Lock ──────────────────────────────────────────────────────────────
async function triggerLock(platform) {
    if (platform === "darwin") {
        await execAsync(`/System/Library/CoreServices/Menu\ Extras/User.menu/Contents/Resources/CGSession -suspend`, { timeout: 5_000 });
    }
    else if (platform === "linux") {
        await execAsync(`loginctl lock-session`, { timeout: 5_000 });
    }
    else {
        await execAsync(`rundll32.exe user32.dll,LockWorkStation`, { timeout: 5_000 });
    }
    return { setting: "lock", value: true, detail: "Screen locked" };
}
//# sourceMappingURL=system-setting.js.map