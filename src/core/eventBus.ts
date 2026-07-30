export type AgentEvent =
  | { type: "user_input"; payload: { text: string; source: "cli" | "audio" | "api" } }
  | { type: "file_changed"; payload: { path: string } }
  | { type: "resource_state"; payload: { cpu: number; ram: number; gpu?: number } }
  | { type: "device_event"; payload: { kind: "usb"; info: unknown } }
  | { type: "scheduled_task"; payload: { id: string } }
  | { type: "workflow_update"; payload: { id: string; status: string } };

export type EventHandler = (event: AgentEvent) => void | Promise<void>;

/**
 * Simple event bus for agentic event-driven workflows.
 */
export class EventBus {
  private handlers: Set<EventHandler> = new Set();
  private history: AgentEvent[] = [];

  emit(event: AgentEvent): void {
    this.history.push(event);
    if (this.history.length > 1000) this.history = this.history.slice(-500);
    for (const handler of this.handlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((err) => console.error(`[EventBus] Handler error:`, err));
        }
      } catch (err) {
        console.error(`[EventBus] Handler error:`, err);
      }
    }
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  getHistory(): AgentEvent[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
  }
}

export const globalEventBus = new EventBus();