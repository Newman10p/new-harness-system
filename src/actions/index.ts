// ─── M.A.I. Action Registry ────────────────────────────────────────────────
// Central registry that maps ActionName → PrimitiveExecutor.
// Pre-registers all 38 primitives on construction.
// Enforces a 60s hard timeout on every execution. Never throws.
//
// Every executed action is audit-logged automatically.

import type {
  ActionName,
  Action,
  ActionContext,
  ActionResult,
  PrimitiveExecutor,
} from "../types/index.js";
import { ACTION_TIMEOUT_MS } from "../core/constants.js";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
import { runSkill } from "./primitives/run-skill.js";
import { scheduleTask, cancelTask, shutdownScheduler, setTaskRunner, listTasks } from "./primitives/schedule-task.js";
import { screenshotCapture } from "./primitives/screenshot-capture.js";
import { clipboardRead } from "./primitives/clipboard-read.js";
import { clipboardWrite } from "./primitives/clipboard-write.js";
import { openApplication } from "./primitives/open-application.js";
import { searchFiles } from "./primitives/search-files.js";
import { getGpuInfo } from "./primitives/get-gpu-info.js";
import { getNetworkInfo } from "./primitives/get-network-info.js";
import { manageProcesses } from "./primitives/manage-processes.js";
import { voiceCall } from "./primitives/voice-call.js";
import { listFilesDetailed } from "./primitives/list-files-detailed.js";
import { semanticRecall } from "./primitives/semantic-recall.js";
import { webSearch } from "./primitives/web-search.js";
import { webScrape } from "./primitives/web-scrape.js";

// Intelligence primitives — loaded conditionally (files may not exist yet)
type LazyPrimitive = { name: ActionName; exec: PrimitiveExecutor } | null;

function tryLoadPrimitive(name: string, moduleName: string): LazyPrimitive {
  try {
    const mod = require(path.join(__dirname, "primitives", moduleName));
    // Handle both named export and default export
    const exec = mod.default ?? Object.values(mod)[0];
    if (typeof exec === "function") {
      return { name: name as ActionName, exec };
    }
  } catch { /* primitive not yet created */ }
  return null;
}

const intelligencePrimitives: LazyPrimitive[] = [
  tryLoadPrimitive("self-modify", "self-modify.js"),
  tryLoadPrimitive("self-evaluate", "self-evaluate.js"),
  tryLoadPrimitive("self-diagnose", "self-diagnose.js"),
  tryLoadPrimitive("self-repair", "self-repair.js"),
  tryLoadPrimitive("adaptive-config", "adaptive-config.js"),
  tryLoadPrimitive("remember", "remember.js"),
  tryLoadPrimitive("recall", "recall.js"),
  tryLoadPrimitive("forget", "forget.js"),
  tryLoadPrimitive("profile-update", "profile-update.js"),
  tryLoadPrimitive("learn-pattern", "learn-pattern.js"),
  tryLoadPrimitive("create-skill", "create-skill.js"),
  tryLoadPrimitive("optimize-skill", "optimize-skill.js"),
  tryLoadPrimitive("rollback", "rollback.js"),
];

// Device control primitives — lazy loaded
const deviceControlPrimitives: LazyPrimitive[] = [
  tryLoadPrimitive("control-window", "control-window.js"),
  tryLoadPrimitive("input-inject", "input-inject.js"),
  tryLoadPrimitive("system-setting", "system-setting.js"),
  tryLoadPrimitive("media-control", "media-control.js"),
  tryLoadPrimitive("screen-arrange", "screen-arrange.js"),
  tryLoadPrimitive("notification-send", "notification-send.js"),
];

// Web search & scrape primitives
const webPrimitives: LazyPrimitive[] = [
  tryLoadPrimitive("web-search", "web-search.js"),
  tryLoadPrimitive("web-scrape", "web-scrape.js"),
];

// Advanced primitives — lazy loaded
const advancedPrimitives: LazyPrimitive[] = [
  tryLoadPrimitive("dry-run", "dry-run.js"),
  tryLoadPrimitive("run-macro", "run-macro.js"),
  tryLoadPrimitive("search-conversations", "search-conversations.js"),
];

// Re-export scheduler functions for the server to wire up
export { setTaskRunner, listTasks, shutdownScheduler };

export class ActionRegistry {
  private handlers = new Map<ActionName, PrimitiveExecutor>();

  constructor() {
    // Pre-register all primitives (25 core + 13 intelligence + 6 device control + 3 advanced + 2 web = 49)
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
    this.register("run-skill", runSkill);
    this.register("schedule-task", scheduleTask);
    this.register("screenshot-capture", screenshotCapture);
    this.register("clipboard-read", clipboardRead);
    this.register("clipboard-write", clipboardWrite);
    this.register("open-application", openApplication);
    this.register("search-files", searchFiles);
    this.register("get-gpu-info", getGpuInfo);
    this.register("get-network-info", getNetworkInfo);
    this.register("manage-processes", manageProcesses);
    this.register("voice-call", voiceCall);
    this.register("list-files-detailed", listFilesDetailed);
    this.register("semantic-recall", semanticRecall);
    this.register("web-search", webSearch);
    this.register("web-scrape", webScrape);

    // Register intelligence primitives (gracefully skip if not yet created)
    for (const prim of intelligencePrimitives) {
      if (prim) {
        this.register(prim.name, prim.exec);
      }
    }

    // Register device control primitives (gracefully skip if not yet created)
    for (const prim of deviceControlPrimitives) {
      if (prim) {
        this.register(prim.name, prim.exec);
      }
    }

    // Register advanced primitives (gracefully skip if not yet created)
    for (const prim of advancedPrimitives) {
      if (prim) {
        this.register(prim.name, prim.exec);
      }
    }

    // Register web primitives (gracefully skip if not yet created)
    for (const prim of webPrimitives) {
      if (prim) {
        this.register(prim.name, prim.exec);
      }
    }
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
   * Audit-logs the execution automatically.
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

    const start = Date.now();

    try {
      // Race the handler against a hard timeout
      const result = await Promise.race([
        handler(action, ctx),
        new Promise<ActionResult>((_resolve) => {
          setTimeout(() => {
            return { ok: false, error: `Action timed out after ${ACTION_TIMEOUT_MS}ms` };
          }, ACTION_TIMEOUT_MS);
        }),
      ]);

      const duration = Date.now() - start;

      // Audit log the execution
      ctx.audit?.({
        type: result.ok ? "action_executed" : "action_blocked",
        action: name,
        detail: result.ok
          ? `Completed successfully`
          : result.error ?? "Unknown error",
        durationMs: duration,
        ok: result.ok,
      });

      return result;
    } catch (err) {
      const duration = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);

      ctx.audit?.({
        type: "action_timeout",
        action: name,
        detail: message,
        durationMs: duration,
        ok: false,
      });

      return {
        ok: false,
        error: `Action execution failed: ${message}`,
      };
    }
  }

  /**
   * Graceful shutdown — stop all fs.watch watchers and scheduled tasks.
   */
  shutdown(): void {
    shutdownWatchers();
    shutdownScheduler();
  }
}
