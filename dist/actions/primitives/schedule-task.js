"use strict";
// ─── M.A.I. Scheduled Tasks ────────────────────────────────────────────────
// Simple cron-like system that lets the agent schedule recurring tasks.
// The agent sends a `schedule-task` action with a command and interval,
// and the scheduler will repeatedly send that command through the agent loop.
//
// Tasks are stored in memory and can be enabled/disabled/cancelled.
// Safety: min interval 60s, max 20 tasks.
Object.defineProperty(exports, "__esModule", { value: true });
exports.setTaskRunner = setTaskRunner;
exports.scheduleTask = scheduleTask;
exports.listTasks = listTasks;
exports.cancelTask = cancelTask;
exports.shutdownScheduler = shutdownScheduler;
const constants_js_1 = require("../../core/constants.js");
const tasks = new Map();
let taskIdCounter = 0;
let taskRunner = () => { };
/**
 * Wire the task runner callback (called by the server to connect to AgentLoop).
 */
function setTaskRunner(fn) {
    taskRunner = fn;
}
/**
 * Generate a simple task ID.
 */
function generateTaskId() {
    taskIdCounter++;
    return `task-${taskIdCounter}-${Date.now().toString(36)}`;
}
/**
 * Schedule a new recurring task.
 */
async function scheduleTask(action, ctx) {
    const name = String(action.name ?? "unnamed");
    const command = String(action.command ?? "");
    const intervalSeconds = Number(action.interval_seconds ?? 300);
    const intervalMs = intervalSeconds * 1000;
    if (!command) {
        return { ok: false, error: "Missing required field: command" };
    }
    if (intervalMs < constants_js_1.MIN_TASK_INTERVAL_MS) {
        return {
            ok: false,
            error: `Interval too short. Minimum: ${constants_js_1.MIN_TASK_INTERVAL_MS / 1000}s`,
        };
    }
    if (tasks.size >= constants_js_1.MAX_SCHEDULED_TASKS) {
        return {
            ok: false,
            error: `Maximum scheduled tasks reached (${constants_js_1.MAX_SCHEDULED_TASKS})`,
        };
    }
    const id = generateTaskId();
    const task = {
        id,
        name,
        command,
        intervalMs,
        enabled: true,
        nextRun: new Date(Date.now() + intervalMs).toISOString(),
        runCount: 0,
    };
    tasks.set(id, task);
    // Start the timer
    const timer = setInterval(() => {
        if (task.enabled) {
            task.lastRun = new Date().toISOString();
            task.nextRun = new Date(Date.now() + task.intervalMs).toISOString();
            task.runCount++;
            taskRunner(task.command);
        }
    }, intervalMs);
    // Store timer reference for cleanup
    task._timer = timer;
    ctx.emitHud("activity_log", {
        message: `Scheduled task "${name}" every ${intervalSeconds}s`,
        level: "info",
    });
    await ctx.audit({
        type: "action_executed",
        action: "schedule-task",
        detail: `Scheduled "${name}" (id: ${id}) every ${intervalSeconds}s`,
        ok: true,
    });
    return {
        ok: true,
        data: { id, name, intervalMs, nextRun: task.nextRun },
    };
}
/**
 * List all scheduled tasks.
 */
function listTasks() {
    return Array.from(tasks.values());
}
/**
 * Cancel a scheduled task by ID.
 */
async function cancelTask(action, ctx) {
    const taskId = String(action.task_id ?? "");
    const task = tasks.get(taskId);
    if (!task) {
        return { ok: false, error: `Task not found: ${taskId}` };
    }
    task.enabled = false;
    const timer = task._timer;
    if (timer)
        clearInterval(timer);
    tasks.delete(taskId);
    await ctx.audit({
        type: "action_executed",
        action: "schedule-task",
        detail: `Cancelled task "${task.name}" (id: ${taskId})`,
        ok: true,
    });
    return { ok: true, data: { message: `Cancelled: ${task.name}` } };
}
/**
 * Graceful shutdown — clear all timers.
 */
function shutdownScheduler() {
    for (const [id, task] of tasks) {
        task.enabled = false;
        const timer = task._timer;
        if (timer)
            clearInterval(timer);
    }
    tasks.clear();
}
//# sourceMappingURL=schedule-task.js.map