export type AgentEvent = {
    type: "user_input";
    payload: {
        text: string;
        source: "cli" | "audio" | "api";
    };
} | {
    type: "file_changed";
    payload: {
        path: string;
    };
} | {
    type: "resource_state";
    payload: {
        cpu: number;
        ram: number;
        gpu?: number;
    };
} | {
    type: "device_event";
    payload: {
        kind: "usb";
        info: unknown;
    };
} | {
    type: "scheduled_task";
    payload: {
        id: string;
    };
} | {
    type: "workflow_update";
    payload: {
        id: string;
        status: string;
    };
};
export type EventHandler = (event: AgentEvent) => void | Promise<void>;
/**
 * Simple event bus for agentic event-driven workflows.
 */
export declare class EventBus {
    private handlers;
    private history;
    emit(event: AgentEvent): void;
    subscribe(handler: EventHandler): () => void;
    getHistory(): AgentEvent[];
    clear(): void;
}
export declare const globalEventBus: EventBus;
//# sourceMappingURL=eventBus.d.ts.map