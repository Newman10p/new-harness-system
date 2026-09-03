"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalActionRegistry = exports.ActionRegistry = void 0;
/**
 * Central registry for all harness tools/actions.
 * Actions are registered by name and looked up at runtime.
 */
class ActionRegistry {
    actions = new Map();
    metas = new Map();
    register(action, meta) {
        if (this.actions.has(action.name)) {
            throw new Error(`Action already registered: ${action.name}`);
        }
        this.actions.set(action.name, action);
        this.metas.set(action.name, meta);
    }
    get(name) {
        return this.actions.get(name);
    }
    getMeta(name) {
        return this.metas.get(name);
    }
    list() {
        const result = [];
        for (const [name, action] of this.actions) {
            const meta = this.metas.get(name);
            if (meta) {
                result.push({ action, meta });
            }
        }
        return result;
    }
    listByCategory(category) {
        return this.list().filter(({ meta }) => meta.category === category);
    }
    async runAction(name, input) {
        const action = this.actions.get(name);
        if (!action) {
            throw new Error(`Action not found: ${name}`);
        }
        return action.run(input);
    }
    has(name) {
        return this.actions.has(name);
    }
    remove(name) {
        this.metas.delete(name);
        return this.actions.delete(name);
    }
    clear() {
        this.actions.clear();
        this.metas.clear();
    }
    get size() {
        return this.actions.size;
    }
}
exports.ActionRegistry = ActionRegistry;
/** Singleton registry instance */
exports.globalActionRegistry = new ActionRegistry();
//# sourceMappingURL=actionsRegistry.js.map