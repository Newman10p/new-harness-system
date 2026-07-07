import { HarnessAction, ActionMeta } from "../actions/types";

/**
 * Central registry for all harness tools/actions.
 * Actions are registered by name and looked up at runtime.
 */
export class ActionRegistry {
  private actions: Map<string, HarnessAction> = new Map();
  private metas: Map<string, ActionMeta> = new Map();

  register(action: HarnessAction, meta: ActionMeta): void {
    if (this.actions.has(action.name)) {
      throw new Error(`Action already registered: ${action.name}`);
    }
    this.actions.set(action.name, action);
    this.metas.set(action.name, meta);
  }

  get(name: string): HarnessAction | undefined {
    return this.actions.get(name);
  }

  getMeta(name: string): ActionMeta | undefined {
    return this.metas.get(name);
  }

  list(): Array<{ action: HarnessAction; meta: ActionMeta }> {
    const result: Array<{ action: HarnessAction; meta: ActionMeta }> = [];
    for (const [name, action] of this.actions) {
      const meta = this.metas.get(name);
      if (meta) {
        result.push({ action, meta });
      }
    }
    return result;
  }

  listByCategory(category: string): Array<{ action: HarnessAction; meta: ActionMeta }> {
    return this.list().filter(({ meta }) => meta.category === category);
  }

  async runAction(name: string, input: unknown): Promise<unknown> {
    const action = this.actions.get(name);
    if (!action) {
      throw new Error(`Action not found: ${name}`);
    }
    return action.run(input);
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  remove(name: string): boolean {
    this.metas.delete(name);
    return this.actions.delete(name);
  }

  clear(): void {
    this.actions.clear();
    this.metas.clear();
  }

  get size(): number {
    return this.actions.size;
  }
}

/** Singleton registry instance */
export const globalActionRegistry = new ActionRegistry();