import os from "node:os";
import { EventBus, globalEventBus } from "../core/eventBus";
import { AgentState } from "../core/agentState";

export class ResourceWatcher {
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private agentState: AgentState,
    private eventBus: EventBus = globalEventBus,
    private intervalMs = 30000
  ) {}

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const cpuLoad = os.loadavg()[0] / cpus.length;
      const ramPercent = ((1 - freeMem / totalMem) * 100);

      this.agentState.recordResource(cpuLoad * 100, ramPercent);

      this.eventBus.emit({
        type: "resource_state",
        payload: {
          cpu: parseFloat((cpuLoad * 100).toFixed(1)),
          ram: parseFloat(ramPercent.toFixed(1))
        }
      });
    }, this.intervalMs);
    console.log(`[ResourceWatcher] Started (every ${this.intervalMs / 1000}s)`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}