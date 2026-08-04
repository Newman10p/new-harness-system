// ─── screenshot-capture ───────────────────────────────────────────────────
// Captures a screenshot of the screen. Tries npx screenshot-desktop first,
// falls back to platform-specific approaches. Saves to a given path or
// state/screenshots/ with a timestamp filename.
//
// Optional `analyze: true` parameter sends the screenshot to a VLM for
// automatic visual analysis, returning both the file path and description.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";
import { resolvePath } from "./resolvePath.js";
import { VisionAnalyzer } from "../../core/VisionAnalyzer.js";

const execAsync = promisify(exec);

export async function screenshotCapture(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const userPath = action.path ? resolvePath(String(action.path)) : "";
  const display = action.display != null ? Number(action.display) : undefined;
  const shouldAnalyze = action.analyze === true;
  const analysisPrompt = action.analysis_prompt ? String(action.analysis_prompt) : undefined;
  const startMs = Date.now();

  // Determine output path
  let outputPath: string;
  if (userPath) {
    outputPath = path.resolve(userPath);
  } else {
    const screenshotsDir = path.join(process.cwd(), "state", "screenshots");
    await fs.mkdir(screenshotsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    outputPath = path.join(screenshotsDir, `screenshot-${ts}.png`);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  try {
    const platform = os.platform();
    let cmd: string;

    if (platform === "win32") {
      // Try npx screenshot-desktop first
      const args = display != null ? ` --display ${display}` : "";
      cmd = `npx screenshot-desktop${args} --filename "${outputPath.replace(/\\/g, "\\\\")}"`;
    } else if (platform === "darwin") {
      const displayArg = display != null ? ` -D ${display}` : "";
      cmd = `npx screenshot-desktop${displayArg} --filename "${outputPath}"`;
    } else {
      // Linux
      const displayArg = display != null ? ` --display ${display}` : "";
      cmd = `npx screenshot-desktop${displayArg} --filename "${outputPath}"`;
    }

    try {
      await execAsync(cmd, { timeout: 30_000 });
    } catch {
      // npx approach failed — try platform-native fallbacks
      const platform2 = os.platform();
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
      } else if (platform2 === "darwin") {
        await execAsync(`screencapture -x "${outputPath}"`, { timeout: 15_000 });
      } else {
        // Linux: try gnome-screenshot or import (ImageMagick)
        try {
          await execAsync(`gnome-screenshot -f "${outputPath}"`, { timeout: 15_000 });
        } catch {
          try {
            await execAsync(`import -window root "${outputPath}"`, { timeout: 15_000 });
          } catch {
            return {
              ok: false,
              error:
                "Screenshot capture failed. No supported screenshot tool found. " +
                "Install screenshot-desktop (npm) or ensure gnome-screenshot / ImageMagick import is available on Linux, or screencapture on macOS.",
            };
          }
        }
      }
    }

    // Verify the file was created
    const stat = await fs.stat(outputPath).catch(() => null);
    if (!stat || stat.size === 0) {
      return {
        ok: false,
        error: "Screenshot command ran but output file is empty or missing.",
      };
    }

    const durationMs = Date.now() - startMs;

    // Emit HUD event
    ctx.emitHud("activity_log" as HudChannel, {
      message: `Screenshot captured: ${outputPath} (${(stat.size / 1024).toFixed(1)} KB)`,
      level: "info",
    } as never);

    await ctx.audit({
      type: "action_executed",
      action: "screenshot-capture",
      detail: `Saved screenshot to ${outputPath}`,
      durationMs,
      ok: true,
    });

    const resultData: Record<string, unknown> = {
      path: outputPath,
      sizeBytes: stat.size,
      sizeKB: Math.round((stat.size / 1024) * 100) / 100,
    };

    // Optional VLM analysis
    if (shouldAnalyze) {
      try {
        const imageBuffer = await fs.readFile(outputPath);
        const imageBase64 = imageBuffer.toString("base64");
        const analyzer = new VisionAnalyzer();
        const visionResult = await analyzer.analyze(imageBase64, analysisPrompt);

        if (visionResult.ok && visionResult.description) {
          resultData.analysis = visionResult.description;

          ctx.emitHud("activity_log" as HudChannel, {
            message: `Screenshot analyzed: ${outputPath}`,
            level: "info",
          } as never);
        } else {
          resultData.analysisError = visionResult.error ?? "Vision analysis returned no description.";
          console.warn(
            `[screenshot-capture] Vision analysis failed: ${visionResult.error}`
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        resultData.analysisError = `Vision analysis error: ${msg}`;
        console.warn(
          `[screenshot-capture] Vision analysis error: ${msg}`
        );
      }
    }

    return {
      ok: true,
      data: resultData,
    };
  } catch (err) {
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
