import type { ActionName, Action, ActionContext, ActionResult, PrimitiveExecutor } from "../types/index.js";
import { shutdownScheduler, setTaskRunner, listTasks } from "./primitives/schedule-task.js";
export { setTaskRunner, listTasks, shutdownScheduler };
export declare class ActionRegistry {
    private handlers;
    constructor();
    register(name: ActionName, executor: PrimitiveExecutor): void;
    has(name: string): boolean;
    listActions(): readonly string[];
    /**
     * Execute an action with a 60s hard timeout.
     * NEVER throws — always returns an ActionResult.
     * Audit-logs the execution automatically.
     */
    execute(action: Action, ctx: ActionContext): Promise<ActionResult>;
    /**
     * Graceful shutdown — stop all fs.watch watchers and scheduled tasks.
     */
    shutdown(): void;
}
//# sourceMappingURL=index.d.ts.map