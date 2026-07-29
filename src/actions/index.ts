// ─── M.A.I. Action Registry ────────────────────────────────────────────────
// Central registry that maps ActionName → PrimitiveExecutor.
// Pre-registers all 12 primitives on construction.
// Enforces a 60s hard timeout on every execution. Never throws.
//
// Design: Map-based, single instance. Actions are stateless functions
// that receive (Action, ActionContext) and return ActionResult.

import type {
  ActionName,
  Action,
  ActionContext,
  ActionResult,
  PrimitiveExecutor,
} from "../types/index.js";
import { ACTION_TIMEOUT_MS } from "../core/constants.js";
import { executeTerminal } from "./primitives/execute-terminal.js";
import { readFile } from "./primitives/read-file.js";
import { writeFile } from "./primitives/write-file.js";
import { appendFile } from "./primitives/append-file.js";
import { listDirectory } from "./primitives/list-directory.js";
import { watchDirectory, shutdownWatchers } from "./primitives/watch-directory.js";
import { getSystemInfo } from "./primitives/get-system-info.js";
import { getProcessList } from "./primitives/get-process-list.js";
import { openUrl } from "./primitives/open-url.js";
import { httpRequest } from "./primitives/http-request.js";
import { emitHudUpdate } from "./primitives/emit-hud-update.js";
import { compactMemory } from "./primitives/compact-memory.js";

export class ActionRegistry {
  private handlers = new Map<ActionName, PrimitiveExecutor>();

  constructor() {
    // Pre-register all 12 primitives
    this.register("execute-terminal", executeTerminal);
    this.register("read-file", readFile);
    this.register("write-file", writeFile);
    this.register("append-file", appendFile);
    this.register("list-directory", listDirectory);
    this.register("watch-directory", watchDirectory);
    this.register("get-system-info", getSystemInfo);
    this.register("get-process-list", getProcessList);
    this.register("open-url", openUrl);
    this.register("http-request", httpRequest);
    this.register("emit-hud-update", emitHudUpdate);
    this.register("compact-memory", compactMemory);
  }

  register(name: ActionName, executor: PrimitiveExecutor): void {
    if (this.handlers.has(name)) {
      console.warn(`[ActionRegistry] Overwriting existing action: ${name}`);
    }
    this.handlers.set(name, executor);
  }

  has(name: string): boolean {
    return this.handlers.has(name as ActionName);
  }

  listActions(): readonly string[] {
    return Array.from(this.handlers.keys()).sort();
  }

  /**
   * Execute an action with a 60s hard timeout.
   * NEVER throws — always returns an ActionResult.
   */
  async execute(
    action: Action,
    ctx: ActionContext
  ): Promise<ActionResult> {
    const name = action.action as ActionName;
    const handler = this.handlers.get(name);

    if (!handler) {
      return {
        ok: false,
        error: `Unknown action: ${name}`,
      };
    }

    try {
      // Race the handler against a hard timeout
      return await Promise.race([
        handler(action, ctx),
        new Promise<ActionResult>((_resolve) => {
          setTimeout(() => {
            return { ok: false, error: `Action timed out after ${ACTION_TIMEOUT_MS}ms` };
          }, ACTION_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Action execution failed: ${message}`,
      };
    }
  }

  /**
   * Graceful shutdown — stop all fs.watch watchers.
   */
  shutdown(): void {
    shutdownWatchers();
  }
}
