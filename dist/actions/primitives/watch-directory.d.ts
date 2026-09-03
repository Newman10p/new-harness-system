import type { Action, ActionContext, ActionResult } from "../../types/index.js";
export declare function watchDirectory(action: Action, ctx: ActionContext): Promise<ActionResult>;
/**
 * Stop all active watchers. Called on shutdown.
 */
export declare function shutdownWatchers(): void;
//# sourceMappingURL=watch-directory.d.ts.map