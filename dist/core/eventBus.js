"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalEventBus = exports.EventBus = void 0;
/**
 * Simple event bus for agentic event-driven workflows.
 */
class EventBus {
    handlers = new Set();
    history = [];
    emit(event) {
        this.history.push(event);
        if (this.history.length > 1000)
            this.history = this.history.slice(-500);
        for (const handler of this.handlers) {
            try {
                const result = handler(event);
                if (result instanceof Promise) {
                    result.catch((err) => console.error(`[EventBus] Handler error:`, err));
                }
            }
            catch (err) {
                console.error(`[EventBus] Handler error:`, err);
            }
        }
    }
    subscribe(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    getHistory() {
        return [...this.history];
    }
    clear() {
        this.history = [];
    }
}
exports.EventBus = EventBus;
exports.globalEventBus = new EventBus();
//# sourceMappingURL=eventBus.js.map