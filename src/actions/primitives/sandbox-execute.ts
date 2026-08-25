// ─── sandbox-execute ────────────────────────────────────────
// Unified sandbox execution primitive.
// Creates/manages sandbox sessions and executes commands within them.
// Supports operations: create-session, execute, list-sessions, destroy-session,
// session-info, replay, update-config, stats.

import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";
import { getSandboxManager } from "../../sandbox2/SandboxManager.js";
import type { SandboxManager, CommandResult } from "../../sandbox2/SandboxManager.js";

export async function sandboxExecute(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const manager = getSandboxManager();
  if (!manager) {
    return { ok: false, error: "SandboxManager not available." };
  }

  const operation = String(action.operation ?? "execute").toLowerCase();

  switch (operation) {
    case "create-session":
      return createSession(action, ctx, manager);
    case "execute":
      return executeCommand(action, ctx, manager);
    case "list-sessions":
      return listSessions(manager);
    case "destroy-session":
      return destroySession(action, ctx, manager);
    case "session-info":
      return sessionInfo(action, manager);
    case "replay":
      return replayCommand(action, ctx, manager);
    case "update-config":
      return updateConfig(action, manager);
    case "stats":
      return getStats(manager);
    default:
      return { ok: false, error: `Unknown sandbox operation: "${operation}". Valid: create-session, execute, list-sessions, destroy-session, session-info, replay, update-config, stats.` };
  }
}

// ─── Operation Handlers ──────────────────────────────────────────────

async function createSession(action: Action, ctx: ActionContext, manager: SandboxManager): Promise<ActionResult> {
  const name = String(action.name ?? "default");
  const tier = String(action.tier ?? "native");
  const timeout = Number(action.timeout ?? 30_000);
  const memory = Number(action.memory ?? 256);
  const network = Boolean(action.network ?? false);
  const sessionTtl = Number(action.session_ttl ?? 1_800_000);

  const validTiers = ["native", "process", "docker", "firejail"];
  if (!validTiers.includes(tier)) {
    return { ok: false, error: `Invalid tier: "${tier}". Must be one of: ${validTiers.join(", ")}` };
  }

  try {
    const session = await manager.createSession(name, {
      tier: tier as any,
      commandTimeoutMs: timeout,
      memoryLimitMb: memory,
      networkAccess: network,
      sessionTtlMs: sessionTtl,
    });

    ctx.emitHud("sandbox_session_event" as HudChannel, {
      event: "created",
      sessionId: session.id,
      name: session.name,
      detail: `[${session.config.tier}] timeout=${timeout}ms mem=${memory}MB network=${network}`,
    } as never);

    await ctx.audit({
      type: "action_executed",
      action: "sandbox-execute",
      detail: `Created session: ${session.name} (${session.id}) [${tier}]`,
      ok: true,
    });

    return { ok: true, data: serializeSession(session) };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function executeCommand(action: Action, ctx: ActionContext, manager: SandboxManager): Promise<ActionResult> {
  const sessionId = String(action.session_id ?? "");
  const command = String(action.command ?? "");

  if (!sessionId) {
    return { ok: false, error: 'Missing required field: "session_id"' };
  }
  if (!command) {
    return { ok: false, error: 'Missing required field: "command"' };
  }

  // Set up streaming output to HUD
  manager.onOutput((sid: string, cid: string, stream: string, chunk: string) => {
    if (sid === sessionId) {
      ctx.emitHud("sandbox_output" as HudChannel, {
        sessionId: sid,
        commandId: cid,
        stream: stream as "stdout" | "stderr",
        chunk: chunk.slice(-500),
      } as never);
    }
  });

  try {
    const result = await manager.executeCommand(sessionId, command, (progress) => {
      ctx.emitHud("action_progress" as HudChannel, {
        id: progress.commandId,
        action: "sandbox-execute",
        step: progress.phase,
        percent: progress.percent,
        detail: progress.detail,
      } as never);
    });

    await ctx.audit({
      type: result.success ? "action_executed" : "action_blocked",
      action: "sandbox-execute",
      detail: `Executed in session ${sessionId}: ${command.slice(0, 100)}`,
      durationMs: result.durationMs,
      ok: result.success,
    });

    return {
      ok: result.success,
      data: {
        id: result.id,
        command: result.command,
        success: result.success,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        tier: result.tier,
        riskScore: result.sideEffects?.riskScore ?? 0,
        sideEffects: result.sideEffects?.effects.map(e => e.description) ?? [],
      },
      error: result.success ? undefined : result.stderr || "Command failed",
    };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

function listSessions(manager: SandboxManager): ActionResult {
  const sessions = manager.listSessions();
  return {
    ok: true,
    data: sessions.map((s) => ({
      id: s.id,
      name: s.name,
      tier: s.config.tier,
      status: s.status,
      commandsRun: s.totalCommandsRun,
      workingDir: s.workingDir,
      createdAt: s.createdAt,
      lastActivity: s.lastActivityAt,
    })),
  };
}

async function destroySession(action: Action, ctx: ActionContext, manager: SandboxManager): Promise<ActionResult> {
  const sessionId = String(action.session_id ?? "");
  if (!sessionId) {
    return { ok: false, error: 'Missing required field: "session_id"' };
  }

  const session = manager.getSession(sessionId);
  const destroyed = await manager.destroySession(sessionId);

  if (session) {
    ctx.emitHud("sandbox_session_event" as HudChannel, {
      event: "destroyed",
      sessionId,
      name: session.name,
    } as never);
  }

  await ctx.audit({
    type: "action_executed",
    action: "sandbox-execute",
    detail: `Destroyed session: ${sessionId}`,
    ok: destroyed,
  });

  return { ok: destroyed, data: { destroyed, sessionId } };
}

function sessionInfo(action: Action, manager: SandboxManager): ActionResult {
  const sessionId = String(action.session_id ?? "");
  const session = manager.getSession(sessionId);
  if (!session) {
    return { ok: false, error: `Session not found: ${sessionId}` };
  }
  return { ok: true, data: serializeSession(session) };
}

async function replayCommand(action: Action, ctx: ActionContext, manager: SandboxManager): Promise<ActionResult> {
  const sessionId = String(action.session_id ?? "");
  const historyIndex = Number(action.history_index ?? 0);

  try {
    const result = await manager.replayCommand(sessionId, historyIndex);
    return {
      ok: result.success,
      data: {
        replayed: true,
        historyIndex,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      },
      error: result.success ? undefined : result.stderr,
    };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

function updateConfig(action: Action, manager: SandboxManager): ActionResult {
  const sessionId = String(action.session_id ?? "");
  const updates: Record<string, unknown> = {};

  if (action.tier) updates.tier = String(action.tier);
  if (action.timeout != null) updates.commandTimeoutMs = Number(action.timeout);
  if (action.memory != null) updates.memoryLimitMb = Number(action.memory);
  if (action.network != null) updates.networkAccess = Boolean(action.network);

  const updated = manager.updateSessionConfig(sessionId, updates);
  return { ok: updated, data: { updated, sessionId, updates } };
}

function getStats(manager: SandboxManager): ActionResult {
  return { ok: true, data: manager.getStats() };
}

// ─── Serializer ─────────────────────────────────────────────────────────

function serializeSession(session: any): Record<string, unknown> {
  return {
    id: session.id,
    name: session.name,
    tier: session.config.tier,
    status: session.status,
    workingDir: session.workingDir,
    commandsRun: session.totalCommandsRun,
    cpuTimeMs: session.totalCpuTimeMs,
    bytesOut: session.totalBytesOut,
    networkAccess: session.config.networkAccess,
    timeoutMs: session.config.commandTimeoutMs,
    memoryLimitMb: session.config.memoryLimitMb,
    createdAt: session.createdAt,
    lastActivity: session.lastActivityAt,
    historyLength: session.commandHistory.length,
    lastCommands: session.commandHistory.slice(-5).map((c: any) => ({
      command: c.command,
      success: c.success,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      timedOut: c.timedOut,
      riskScore: c.sideEffects?.riskScore ?? 0,
    })),
  };
}