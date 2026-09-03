import { HarnessAction, ActionMeta } from "../actions/types";
/**
 * Central registry for all harness tools/actions.
 * Actions are registered by name and looked up at runtime.
 */
export declare class ActionRegistry {
    private actions;
    private metas;
    register(action: HarnessAction, meta: ActionMeta): void;
    get(name: string): HarnessAction | undefined;
    getMeta(name: string): ActionMeta | undefined;
    list(): Array<{
        action: HarnessAction;
        meta: ActionMeta;
    }>;
    listByCategory(category: string): Array<{
        action: HarnessAction;
        meta: ActionMeta;
    }>;
    runAction(name: string, input: unknown): Promise<unknown>;
    has(name: string): boolean;
    remove(name: string): boolean;
    clear(): void;
    get size(): number;
}
/** Singleton registry instance */
export declare const globalActionRegistry: ActionRegistry;
//# sourceMappingURL=actionsRegistry.d.ts.map