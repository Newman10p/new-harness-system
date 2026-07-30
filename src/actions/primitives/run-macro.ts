// ─── M.A.I. Primitive: run-macro ─────────────────────────────────────────────
// Execute a named macro (user-defined multi-step workflow).
// Loads the MacroEngine, finds the macro by name or ID, and runs it.

import type { Action, ActionContext, ActionResult } from "../../types/index.js";

export async function runMacro(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const macroName = action.name as string | undefined;
  const macroId = action.id as string | undefined;
  const variables = action.variables as Record<string, string> | undefined;

  if (!macroName && !macroId) {
    return { ok: false, error: "Missing name or id — specify which macro to run" };
  }

  await ctx.emitHud("activity_log", {
    message: `[Macro] Running: ${macroName ?? macroId}`,
    level: "info",
  });

  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const macroMod = require("../../macros/MacroEngine.js");
    const MacroEngine = macroMod.MacroEngine ?? macroMod.default;

    if (!MacroEngine || typeof MacroEngine !== "function") {
      return { ok: false, error: "MacroEngine not available" };
    }

    const engine = new MacroEngine();
    // MacroEngine requires explicit initialization before use
    await engine.initialize();

    // Try to match by trigger word first, then by ID
    let result;
    if (macroName) {
      const matched = engine.matchInput(macroName);
      if (matched) {
        result = await engine.execute(matched.id, variables);
      } else {
        // No trigger match — try as direct macro ID
        result = await engine.execute(macroName, variables);
      }
    } else if (macroId) {
      result = await engine.execute(macroId, variables);
    }

    if (!result) {
      return { ok: false, error: `Macro not found: ${macroName ?? macroId}` };
    }

    await ctx.emitHud("activity_log", {
      message: `[Macro] ${result.success ? "Completed" : "Failed"}: ${macroName ?? macroId} (${result.totalDuration}ms)`,
      level: result.success ? "info" : "error",
    });

    await ctx.audit({
      type: "action_executed",
      action: "run-macro",
      detail: `Ran macro ${macroName ?? macroId}: ${result.success ? "success" : "failed"}, ${result.stepResults.length} steps, ${result.totalDuration}ms`,
      durationMs: result.totalDuration,
      ok: result.success,
    });

    return { ok: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.emitHud("activity_log", {
      message: `[Macro] Error: ${message}`,
      level: "error",
    });
    return { ok: false, error: `Macro execution failed: ${message}` };
  }
}
