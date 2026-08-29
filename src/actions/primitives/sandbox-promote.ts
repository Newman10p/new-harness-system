// ─── sandbox-promote ────────────────────────────────────────────────────
// Promotes sandbox files to a real target directory on the host.
//
// Flow:
//   1. Agent calls sandbox-promote with session_id + target_dir
//   2. Primitive does a dry-run diff (what files would change)
//   3. Emits promotion_request to HUD with file summary
//   4. Waits for user approval via AgentLoop.resolvePromotion()
//   5. If approved, copies sandbox files to real target
//   6. Returns summary of what was applied
//
// This is the ONLY way sandbox output reaches the real filesystem.
// The agent must explicitly request promotion — it never happens automatically.

import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";
import { getSandboxManager } from "../../sandbox2/SandboxManager.js";
import { getLogger } from "../../core/MaiLogger.js";

const log = getLogger("sandbox-promote");

/**
 * Wait for the user to respond to a promotion request.
 * Uses the same pattern as AgentLoop.waitForApproval — sets pendingPromotion
 * on state and awaits resolution.
 */
function waitForPromotion(ctx: ActionContext): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const state = ctx.state;
    if (!state) {
      // No state available — auto-deny (safety)
      resolve(false);
      return;
    }
    // Store the resolve function so the HUD can call resolvePromotion later
    (state as any)._promotionResolve = resolve;
    // 5-minute timeout to prevent deadlock
    setTimeout(() => {
      if ((state as any)._promotionResolve === resolve) {
        (state as any)._promotionResolve = null;
        resolve(false);
      }
    }, 5 * 60 * 1000);
  });
}

export async function sandboxPromote(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const sessionId = String(action.session_id ?? "");
  const targetDir = String(action.target_dir ?? "");
  const reason = String(action.reason ?? "");
  const files = action.files as string[] | undefined;
  const exclude = action.exclude as string[] | undefined;

  if (!sessionId) {
    return { ok: false, error: 'Missing required field: "session_id"' };
  }
  if (!targetDir) {
    return { ok: false, error: 'Missing required field: "target_dir"' };
  }

  const mgr = getSandboxManager();
  if (!mgr) {
    return { ok: false, error: "SandboxManager not available." };
  }

  // Verify session exists
  const session = mgr.getSession(sessionId);
  if (!session) {
    return { ok: false, error: `Session not found: ${sessionId}` };
  }

  // Step 1: Dry-run to compute what would change
  const dryRun = await mgr.promoteSessionFiles(sessionId, targetDir, {
    dryRun: true,
    files,
    exclude,
  });

  if (!dryRun.ok) {
    return { ok: false, error: dryRun.error };
  }

  if (dryRun.files.length === 0) {
    return { ok: true, data: { promoted: false, message: "No file changes to promote — sandbox and target are in sync." } };
  }

  // Step 2: Emit promotion_request to HUD
  ctx.emitHud("promotion_request" as HudChannel, {
    sessionId,
    sandboxDir: session.workingDir,
    targetDir,
    files: dryRun.files,
    totalSize: dryRun.totalSize,
    reason: reason || undefined,
  } as never);

  ctx.emitHud("interim_message" as HudChannel, {
    type: "waiting_approval",
    detail: `Promotion: ${dryRun.files.length} files (${(dryRun.totalSize / 1024).toFixed(1)} KB) from sandbox → ${targetDir}`,
  } as never);

  log.info("Promotion request sent to HUD", {
    data: {
      sessionId,
      targetDir,
      fileCount: dryRun.files.length,
      totalSize: dryRun.totalSize,
      reason: reason?.slice(0, 100),
    },
  });

  // Step 3: Wait for user approval
  const approved = await waitForPromotion(ctx);

  if (!approved) {
    await ctx.audit({
      type: "action_denied",
      action: "sandbox-promote",
      detail: `User denied promotion of ${dryRun.files.length} files from ${session.name} → ${targetDir}`,
      ok: false,
    });
    return { ok: false, error: "Promotion denied by user." };
  }

  // Step 4: Actually promote the files
  const result = await mgr.promoteSessionFiles(sessionId, targetDir, {
    dryRun: false,
    files,
    exclude,
  });

  if (!result.ok) {
    await ctx.audit({
      type: "action_executed",
      action: "sandbox-promote",
      detail: `Promotion failed: ${result.error}`,
      ok: false,
    });
    return { ok: false, error: result.error };
  }

  // Step 5: Return success summary
  const summary = {
    promoted: true,
    sessionId,
    sessionName: session.name,
    targetDir,
    filesApplied: result.files.length,
    totalSize: result.totalSize,
    breakdown: {
      created: result.files.filter(f => f.change === "created").length,
      modified: result.files.filter(f => f.change === "modified").length,
    },
    files: result.files.map(f => ({ path: f.path, change: f.change, size: f.size })),
  };

  log.info("Promotion applied", { data: summary });

  await ctx.audit({
    type: "action_approved",
    action: "sandbox-promote",
    detail: `Promoted ${result.files.length} files (${(result.totalSize / 1024).toFixed(1)} KB) from ${session.name} → ${targetDir}`,
    ok: true,
  });

  return { ok: true, data: summary };
}
