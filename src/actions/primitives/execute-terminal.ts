// ─── execute-terminal ──────────────────────────────────────────────────────
// Runs a shell command via SandboxManager (OS-level isolation) with:
//   - Docker/firejail isolation when available (falls back to native)
//   - Persistent sandbox session (one-time approval)
//   - Dangerous pattern detection (obfuscation-aware)
//   - Restricted environment (only safe env vars)
//   - Timeout (30s default) + output limits (10MB)
//   - Side-effect analysis before execution
//   - Streaming output via callback

import { getSandboxManager } from "../../sandbox2/SandboxManager.js";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";
import { getLogger } from "../../core/MaiLogger.js";

const log = getLogger("execute-terminal");

// Persistent session ID — created once, reused across all commands
let _sessionId: string | null = null;
let _sessionInitialized = false;

/**
 * Ensure a sandbox session exists. Called lazily on first execution.
 * Uses the best available isolation tier (docker > firejail > process > native).
 */
async function ensureSession(): Promise<string> {
  if (_sessionId) return _sessionId;

  const mgr = getSandboxManager();
  await mgr.initialize();

  // Pick the best available tier
  const stats = mgr.getStats();
  let tier: "docker" | "firejail" | "process" | "native" = "native";
  if (stats.dockerAvailable) tier = "docker";
  else if (stats.firejailAvailable) tier = "firejail";
  else tier = "process";

  const session = await mgr.createSession("agent-default", {
    tier,
    commandTimeoutMs: 30_000,
    memoryLimitMb: 256,
    networkAccess: false,
    maxOutputBytes: 10 * 1024 * 1024,
    sessionTtlMs: 30 * 60 * 1000, // 30 minutes idle
  });

  _sessionId = session.id;
  _sessionInitialized = true;
  log.info("Sandbox session created", { data: { sessionId: session.id, tier, workingDir: session.workingDir } });

  return session.id;
}

export async function executeTerminal(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const command = String(action.command ?? "");
  const timeout = Number(action.timeout ?? 30_000);

  if (!command) {
    return { ok: false, error: "Missing required field: command" };
  }

  try {
    const sessionId = await ensureSession();
    const mgr = getSandboxManager();

    const result = await mgr.executeCommand(sessionId, command);

    const output = (result.stdout + (result.stderr ? "\n" + result.stderr : "")).trim();

    // Audit log
    await ctx.audit({
      type: "action_executed",
      action: "execute-terminal",
      detail: `Executed [${result.tier}]: ${command.slice(0, 200)}`,
      ok: result.success,
    });

    if (result.timedOut) {
      return { ok: false, error: `Command timed out after ${timeout}ms` };
    }

    if (!result.success && result.stderr.startsWith("[BLOCKED]")) {
      return { ok: false, error: result.stderr };
    }

    return { ok: true, data: output || "(no output)" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Execution failed", { error: message, data: { command: command.slice(0, 100) } });
    return { ok: false, error: message };
  }
}

/**
 * Get the current sandbox session info (for diagnostics / HUD display).
 */
export async function getSandboxInfo(): Promise<{ sessionId: string | null; tier: string; initialized: boolean } | null> {
  if (!_sessionId) return null;
  const mgr = getSandboxManager();
  const session = mgr.getSession(_sessionId);
  if (!session) return null;
  return { sessionId: session.id, tier: session.config.tier, initialized: _sessionInitialized };
}
