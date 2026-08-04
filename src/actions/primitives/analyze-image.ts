// ─── analyze-image ────────────────────────────────────────────────────────
// Analyzes an image (file path or base64) using a Vision Language Model.
// Returns a text description of what the image contains.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";
import { VisionAnalyzer } from "../../core/VisionAnalyzer.js";
import { resolvePath } from "./resolvePath.js";

export async function analyzeImage(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const startMs = Date.now();
  const prompt = action.prompt ? String(action.prompt) : undefined;

  // Determine the image source: base64 string or file path
  let imageBase64: string;

  if (action.image_base64 && typeof action.image_base64 === "string") {
    imageBase64 = action.image_base64;
  } else if (action.path && typeof action.path === "string") {
    const resolvedPath = resolvePath(action.path);
    try {
      const buffer = await fs.readFile(resolvedPath);
      imageBase64 = buffer.toString("base64");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Failed to read image file at ${resolvedPath}: ${message}`,
      };
    }
  } else {
    return {
      ok: false,
      error:
        "analyze-image requires either a 'path' (file path) or 'image_base64' (base64-encoded image string).",
    };
  }

  // Instantiate the VisionAnalyzer and run analysis
  try {
    const analyzer = new VisionAnalyzer();
    const result = await analyzer.analyze(imageBase64, prompt);
    const durationMs = Date.now() - startMs;

    if (result.ok) {
      await ctx.audit({
        type: "action_executed",
        action: "analyze-image",
        detail: `Image analyzed successfully (${(durationMs / 1000).toFixed(1)}s)`,
        durationMs,
        ok: true,
      });

      return {
        ok: true,
        data: {
          description: result.description,
        },
      };
    } else {
      await ctx.audit({
        type: "action_blocked",
        action: "analyze-image",
        detail: result.error ?? "Unknown vision error",
        durationMs,
        ok: false,
      });

      return {
        ok: false,
        error: result.error ?? "Vision analysis failed.",
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startMs;

    await ctx.audit({
      type: "action_blocked",
      action: "analyze-image",
      detail: message,
      durationMs,
      ok: false,
    });

    return {
      ok: false,
      error: `analyze-image failed: ${message}`,
    };
  }
}
