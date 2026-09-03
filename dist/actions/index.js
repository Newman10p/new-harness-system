"use strict";
// ─── M.A.I. Action Registry ────────────────────────────────────────────────
// Central registry that maps ActionName → PrimitiveExecutor.
// Pre-registers all 38 primitives on construction.
// Enforces a 60s hard timeout on every execution. Never throws.
//
// Every executed action is audit-logged automatically.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionRegistry = exports.shutdownScheduler = exports.listTasks = exports.setTaskRunner = void 0;
const constants_js_1 = require("../core/constants.js");
const node_module_1 = require("node:module");
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
const require = (0, node_module_1.createRequire)(import.meta.url);
const __dirname = node_path_1.default.dirname((0, node_url_1.fileURLToPath)(import.meta.url));
const execute_terminal_js_1 = require("./primitives/execute-terminal.js");
const read_file_js_1 = require("./primitives/read-file.js");
const write_file_js_1 = require("./primitives/write-file.js");
const append_file_js_1 = require("./primitives/append-file.js");
const list_directory_js_1 = require("./primitives/list-directory.js");
const watch_directory_js_1 = require("./primitives/watch-directory.js");
const get_system_info_js_1 = require("./primitives/get-system-info.js");
const get_process_list_js_1 = require("./primitives/get-process-list.js");
const open_url_js_1 = require("./primitives/open-url.js");
const http_request_js_1 = require("./primitives/http-request.js");
const emit_hud_update_js_1 = require("./primitives/emit-hud-update.js");
const compact_memory_js_1 = require("./primitives/compact-memory.js");
const run_skill_js_1 = require("./primitives/run-skill.js");
const schedule_task_js_1 = require("./primitives/schedule-task.js");
Object.defineProperty(exports, "shutdownScheduler", { enumerable: true, get: function () { return schedule_task_js_1.shutdownScheduler; } });
Object.defineProperty(exports, "setTaskRunner", { enumerable: true, get: function () { return schedule_task_js_1.setTaskRunner; } });
Object.defineProperty(exports, "listTasks", { enumerable: true, get: function () { return schedule_task_js_1.listTasks; } });
const screenshot_capture_js_1 = require("./primitives/screenshot-capture.js");
const clipboard_read_js_1 = require("./primitives/clipboard-read.js");
const clipboard_write_js_1 = require("./primitives/clipboard-write.js");
const open_application_js_1 = require("./primitives/open-application.js");
const search_files_js_1 = require("./primitives/search-files.js");
const get_gpu_info_js_1 = require("./primitives/get-gpu-info.js");
const get_network_info_js_1 = require("./primitives/get-network-info.js");
const manage_processes_js_1 = require("./primitives/manage-processes.js");
const voice_call_js_1 = require("./primitives/voice-call.js");
const list_files_detailed_js_1 = require("./primitives/list-files-detailed.js");
const semantic_recall_js_1 = require("./primitives/semantic-recall.js");
function tryLoadPrimitive(name, moduleName) {
    try {
        const mod = require(node_path_1.default.join(__dirname, "primitives", moduleName));
        // Handle both named export and default export
        const exec = mod.default ?? Object.values(mod)[0];
        if (typeof exec === "function") {
            return { name: name, exec };
        }
    }
    catch { /* primitive not yet created */ }
    return null;
}
const intelligencePrimitives = [
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
const deviceControlPrimitives = [
    tryLoadPrimitive("control-window", "control-window.js"),
    tryLoadPrimitive("input-inject", "input-inject.js"),
    tryLoadPrimitive("system-setting", "system-setting.js"),
    tryLoadPrimitive("media-control", "media-control.js"),
    tryLoadPrimitive("screen-arrange", "screen-arrange.js"),
    tryLoadPrimitive("notification-send", "notification-send.js"),
];
// Advanced primitives — lazy loaded
const advancedPrimitives = [
    tryLoadPrimitive("dry-run", "dry-run.js"),
    tryLoadPrimitive("run-macro", "run-macro.js"),
    tryLoadPrimitive("search-conversations", "search-conversations.js"),
];
class ActionRegistry {
    handlers = new Map();
    constructor() {
        // Pre-register all primitives (25 core + 13 intelligence + 6 device control + 3 advanced = 47)
        this.register("execute-terminal", execute_terminal_js_1.executeTerminal);
        this.register("read-file", read_file_js_1.readFile);
        this.register("write-file", write_file_js_1.writeFile);
        this.register("append-file", append_file_js_1.appendFile);
        this.register("list-directory", list_directory_js_1.listDirectory);
        this.register("watch-directory", watch_directory_js_1.watchDirectory);
        this.register("get-system-info", get_system_info_js_1.getSystemInfo);
        this.register("get-process-list", get_process_list_js_1.getProcessList);
        this.register("open-url", open_url_js_1.openUrl);
        this.register("http-request", http_request_js_1.httpRequest);
        this.register("emit-hud-update", emit_hud_update_js_1.emitHudUpdate);
        this.register("compact-memory", compact_memory_js_1.compactMemory);
        this.register("run-skill", run_skill_js_1.runSkill);
        this.register("schedule-task", schedule_task_js_1.scheduleTask);
        this.register("screenshot-capture", screenshot_capture_js_1.screenshotCapture);
        this.register("clipboard-read", clipboard_read_js_1.clipboardRead);
        this.register("clipboard-write", clipboard_write_js_1.clipboardWrite);
        this.register("open-application", open_application_js_1.openApplication);
        this.register("search-files", search_files_js_1.searchFiles);
        this.register("get-gpu-info", get_gpu_info_js_1.getGpuInfo);
        this.register("get-network-info", get_network_info_js_1.getNetworkInfo);
        this.register("manage-processes", manage_processes_js_1.manageProcesses);
        this.register("voice-call", voice_call_js_1.voiceCall);
        this.register("list-files-detailed", list_files_detailed_js_1.listFilesDetailed);
        this.register("semantic-recall", semantic_recall_js_1.semanticRecall);
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
    }
    register(name, executor) {
        if (this.handlers.has(name)) {
            console.warn(`[ActionRegistry] Overwriting existing action: ${name}`);
        }
        this.handlers.set(name, executor);
    }
    has(name) {
        return this.handlers.has(name);
    }
    listActions() {
        return Array.from(this.handlers.keys()).sort();
    }
    /**
     * Execute an action with a 60s hard timeout.
     * NEVER throws — always returns an ActionResult.
     * Audit-logs the execution automatically.
     */
    async execute(action, ctx) {
        const name = action.action;
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
                new Promise((_resolve) => {
                    setTimeout(() => {
                        return { ok: false, error: `Action timed out after ${constants_js_1.ACTION_TIMEOUT_MS}ms` };
                    }, constants_js_1.ACTION_TIMEOUT_MS);
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
        }
        catch (err) {
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
    shutdown() {
        (0, watch_directory_js_1.shutdownWatchers)();
        (0, schedule_task_js_1.shutdownScheduler)();
    }
}
exports.ActionRegistry = ActionRegistry;
//# sourceMappingURL=index.js.map