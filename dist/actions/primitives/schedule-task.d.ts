import type { Action, ActionContext, ActionResult, ScheduledTask } from "../../types/index.js";
type TaskRunner = (command: string) => void;
/**
 * Wire the task runner callback (called by the server to connect to AgentLoop).
 */
export declare function setTaskRunner(fn: TaskRunner): void;
/**
 * Schedule a new recurring task.
 */
export declare function scheduleTask(action: Action, ctx: ActionContext): Promise<ActionResult>;
/**
 * List all scheduled tasks.
 */
export declare function listTasks(): ScheduledTask[];
/**
 * Cancel a scheduled task by ID.
 */
export declare function cancelTask(action: Action, ctx: ActionContext): Promise<ActionResult>;
/**
 * Graceful shutdown — clear all timers.
 */
export declare function shutdownScheduler(): void;
export {};
//# sourceMappingURL=schedule-task.d.ts.map