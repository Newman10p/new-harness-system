// ─── M.A.I. Primitive: dry-run ──────────────────────────────────────────────
// Simulate an action without executing it. Shows what WOULD happen.
// Uses the SandboxRunner for simulation, or falls back to SideEffectAnalyzer.

import type { Action, ActionContext, ActionResult } from "../../types/index.js";

export async function dryRun(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const targetAction = action.targetAction as string | undefined;
  const targetParams = action.targetParams as Record<string, unknown> | undefined;

  if (!targetAction) {
    return { ok: false, error: "Missing targetAction — specify which action to dry-run" };
  }

  await ctx.emitHud("activity_log", {
    message: `[Dry Run] Simulating: ${targetAction}`,
    level: "info",
  });

  // Build a command string from the action (SandboxRunner.dryRun takes a string)
  const commandStr = targetParams?.command as string ?? JSON.stringify(targetParams ?? {});

  // Try to load SandboxRunner for full simulation
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const sandboxMod = require("../../sandbox/SandboxRunner.js");
    const getSandboxRunner = sandboxMod.getSandboxRunner ?? sandboxMod.default;

    if (typeof getSandboxRunner === "function") {
      const runner = getSandboxRunner();
      const result = await runner.dryRun(commandStr);
      await ctx.audit({
        type: "action_executed",
        action: "dry-run",
        detail: `Simulated ${targetAction}: ${result.wouldSucceed ? "would succeed" : "would fail"}`,
        ok: true,
      });
      return { ok: true, data: result };
    }
  } catch {
    // SandboxRunner not available — fall back to analysis
  }

  // Fallback: Static analysis via SideEffectAnalyzer
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const analyzerMod = require("../../sandbox/SideEffectAnalyzer.js");
    const analyzeSideEffects = analyzerMod.analyzeSideEffects ?? analyzerMod.default;

    if (typeof analyzeSideEffects === "function") {
      const report = analyzeSideEffects(commandStr);

      await ctx.audit({
        type: "action_executed",
        action: "dry-run",
        detail: `Analyzed ${targetAction}: risk score ${report.riskScore}/100`,
        ok: true,
      });

      return {
        ok: true,
        data: {
          originalAction: targetAction,
          simulated: true,
          wouldSucceed: report.riskScore < 80,
          sideEffects: report.effects.map((e: { description: string }) => e.description),
          warnings: report.effects
            .filter((e: { severity: string }) => e.severity === "high" || e.severity === "critical")
            .map((e: { description: string }) => e.description),
          riskScore: report.riskScore,
          duration: 0,
        },
      };
    }
  } catch {
    // SideEffectAnalyzer not available — return basic analysis
  }

  // Ultimate fallback: basic analysis
  const warnings: string[] = [];
  const effects: string[] = [];

  if (commandStr.includes("rm ") || commandStr.includes("delete")) {
    effects.push("FILE_DELETION");
    warnings.push("This command would delete files");
  }
  if (commandStr.includes("curl ") || commandStr.includes("wget ") || commandStr.includes("fetch ")) {
    effects.push("NETWORK_OUTBOUND");
  }
  if (commandStr.includes("sudo ") || commandStr.includes("chmod ") || commandStr.includes("chown ")) {
    effects.push("PRIVILEGE_ESCALATION");
    warnings.push("This command requires elevated privileges");
  }

  await ctx.emitHud("activity_log", {
    message: `[Dry Run] ${targetAction}: ${effects.length} effect(s) predicted, ${warnings.length} warning(s)`,
    level: warnings.length > 0 ? "warn" : "info",
  });

  await ctx.audit({
    type: "action_executed",
    action: "dry-run",
    detail: `Basic analysis of ${targetAction}: ${effects.join(", ") || "no significant effects"}`,
    ok: true,
  });

  return {
    ok: true,
    data: {
      originalAction: targetAction,
      simulated: true,
      wouldSucceed: warnings.length === 0,
      sideEffects: effects,
      warnings,
      duration: 0,
    },
  };
}
