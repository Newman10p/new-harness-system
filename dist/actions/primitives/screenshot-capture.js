"use strict";
// ─── screenshot-capture ───────────────────────────────────────────────────
// Captures a screenshot of the screen. Tries npx screenshot-desktop first,
// falls back to platform-specific approaches. Saves to a given path or
// state/screenshots/ with a timestamp filename.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.screenshotCapture = screenshotCapture;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
async function screenshotCapture(action, ctx) {
    const userPath = action.path ? String(action.path) : "";
    const display = action.display != null ? Number(action.display) : undefined;
    const startMs = Date.now();
    // Determine output path
    let outputPath;
    if (userPath) {
        outputPath = node_path_1.default.resolve(userPath);
    }
    else {
        const screenshotsDir = node_path_1.default.join(process.cwd(), "state", "screenshots");
        await promises_1.default.mkdir(screenshotsDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        outputPath = node_path_1.default.join(screenshotsDir, `screenshot-${ts}.png`);
    }
    // Ensure output directory exists
    const outputDir = node_path_1.default.dirname(outputPath);
    await promises_1.default.mkdir(outputDir, { recursive: true });
    try {
        const platform = node_os_1.default.platform();
        let cmd;
        if (platform === "win32") {
            // Try npx screenshot-desktop first
            const args = display != null ? ` --display ${display}` : "";
            cmd = `npx screenshot-desktop${args} --filename "${outputPath.replace(/\\/g, "\\\\")}"`;
        }
        else if (platform === "darwin") {
            const displayArg = display != null ? ` -D ${display}` : "";
            cmd = `npx screenshot-desktop${displayArg} --filename "${outputPath}"`;
        }
        else {
            // Linux
            const displayArg = display != null ? ` --display ${display}` : "";
            cmd = `npx screenshot-desktop${displayArg} --filename "${outputPath}"`;
        }
        try {
            await execAsync(cmd, { timeout: 30_000 });
        }
        catch {
            // npx approach failed — try platform-native fallbacks
            const platform2 = node_os_1.default.platform();
            if (platform2 === "win32") {
                // PowerShell screen capture using .NET
                const psCmd = `
          Add-Type -AssemblyName System.Windows.Forms
          Add-Type -AssemblyName System.Drawing
          $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
          $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
          $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
          $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
          $bitmap.Save("${outputPath.replace(/\\/g, "\\\\")}")
          $graphics.Dispose()
          $bitmap.Dispose()
        `.trim();
                await execAsync(`powershell -command "${psCmd.replace(/"/g, '\"')}"`, {
                    timeout: 30_000,
                });
            }
            else if (platform2 === "darwin") {
                await execAsync(`screencapture -x "${outputPath}"`, { timeout: 15_000 });
            }
            else {
                // Linux: try gnome-screenshot or import (ImageMagick)
                try {
                    await execAsync(`gnome-screenshot -f "${outputPath}"`, { timeout: 15_000 });
                }
                catch {
                    try {
                        await execAsync(`import -window root "${outputPath}"`, { timeout: 15_000 });
                    }
                    catch {
                        return {
                            ok: false,
                            error: "Screenshot capture failed. No supported screenshot tool found. " +
                                "Install screenshot-desktop (npm) or ensure gnome-screenshot / ImageMagick import is available on Linux, or screencapture on macOS.",
                        };
                    }
                }
            }
        }
        // Verify the file was created
        const stat = await promises_1.default.stat(outputPath).catch(() => null);
        if (!stat || stat.size === 0) {
            return {
                ok: false,
                error: "Screenshot command ran but output file is empty or missing.",
            };
        }
        const durationMs = Date.now() - startMs;
        // Emit HUD event
        ctx.emitHud("activity_log", {
            message: `Screenshot captured: ${outputPath} (${(stat.size / 1024).toFixed(1)} KB)`,
            level: "info",
        });
        await ctx.audit({
            type: "action_executed",
            action: "screenshot-capture",
            detail: `Saved screenshot to ${outputPath}`,
            durationMs,
            ok: true,
        });
        return {
            ok: true,
            data: {
                path: outputPath,
                sizeBytes: stat.size,
                sizeKB: Math.round((stat.size / 1024) * 100) / 100,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startMs;
        await ctx.audit({
            type: "action_blocked",
            action: "screenshot-capture",
            detail: message,
            durationMs,
            ok: false,
        });
        return { ok: false, error: `Screenshot capture failed: ${message}` };
    }
}
//# sourceMappingURL=screenshot-capture.js.map