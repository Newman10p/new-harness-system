import { execSync } from "node:child_process";
import { EventBus, globalEventBus } from "../core/eventBus";
import { AgentState } from "../core/agentState";

export class DeviceWatcher {
  private interval: ReturnType<typeof setInterval> | null = null;
  private knownDevices = new Set<string>();

  constructor(
    private agentState: AgentState,
    private eventBus: EventBus = globalEventBus,
    private intervalMs = 60000
  ) {}

  start(): void {
    if (this.interval) return;
    // Initial scan
    this.scan();
    this.interval = setInterval(() => this.scan(), this.intervalMs);
    console.log(`[DeviceWatcher] Started (every ${this.intervalMs / 1000}s)`);
  }

  private scan(): void {
    try {
      if (process.platform === "linux") {
        const out = execSync("lsusb 2>/dev/null || echo ''", { encoding: "utf8", timeout: 5000 });
        for (const line of out.trim().split("\n")) {
          if (!line.trim()) continue;
          const m = line.match(/Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+(\S+)\s+(.+)/);
          if (m) {
            const id = m[3];
            if (!this.knownDevices.has(id)) {
              this.knownDevices.add(id);
              const info = { bus: m[1], device: m[2], id, description: m[4] };
              this.agentState.addDevice({
                kind: "usb", id, description: m[4],
                firstSeen: new Date(), lastSeen: new Date()
              });
              this.eventBus.emit({ type: "device_event", payload: { kind: "usb", info } });
            }
          }
        }
      }
    } catch { /* device scan not available */ }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}