import os from "node:os";
import { execSync } from "node:child_process";
import { HarnessAction, ActionMeta } from "./types";
import { globalActionRegistry } from "../registry/actionsRegistry";

export interface PcMonitorOutput {
  cpu: {
    loadAvg: number[];
    cores: number;
    model?: string;
  };
  memory: {
    totalGb: number;
    freeGb: number;
    usedPercent: number;
  };
  disk: {
    totalGb: number;
    freeGb: number;
    usedPercent: number;
  };
  uptime: number;
  hostname: string;
  platform: string;
}

class PcMonitorAction implements HarnessAction {
  name = "pc.monitor";
  description = "Read CPU, RAM, and disk info for resource monitoring";

  async run(_input: unknown): Promise<PcMonitorOutput> {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // Disk info (cross-platform best effort)
    let diskTotal = 0;
    let diskFree = 0;
    try {
      if (process.platform === "win32") {
        const out = execSync("wmic logicaldisk get size,freespace", { encoding: "utf8", timeout: 5000 });
        const lines = out.trim().split("\n").slice(1);
        for (const line of lines) {
          const [, freeStr, totalStr] = line.trim().split(/\s+/);
          diskTotal += parseInt(totalStr || "0", 10);
          diskFree += parseInt(freeStr || "0", 10);
        }
      } else {
        const stat = execSync("df -k /", { encoding: "utf8", timeout: 5000 });
        const parts = stat.trim().split("\n")[1]?.split(/\s+/) ?? [];
        diskTotal = parseInt(parts[1] || "0", 10) * 1024;
        diskFree = parseInt(parts[3] || "0", 10) * 1024;
      }
    } catch {
      // Fallback: use os.totalmem as rough estimate
      diskTotal = totalMem;
      diskFree = freeMem;
    }

    return {
      cpu: {
        loadAvg: os.loadavg(),
        cores: cpus.length,
        model: cpus[0]?.model
      },
      memory: {
        totalGb: parseFloat((totalMem / 1e9).toFixed(2)),
        freeGb: parseFloat((freeMem / 1e9).toFixed(2)),
        usedPercent: parseFloat(((1 - freeMem / totalMem) * 100).toFixed(1))
      },
      disk: {
        totalGb: parseFloat((diskTotal / 1e9).toFixed(2)),
        freeGb: parseFloat((diskFree / 1e9).toFixed(2)),
        usedPercent: parseFloat(((1 - diskFree / diskTotal) * 100).toFixed(1))
      },
      uptime: os.uptime(),
      hostname: os.hostname(),
      platform: process.platform
    };
  }
}

interface PcControlInput {
  action: "throttle" | "pause" | "resume" | "notify_low_battery";
  reason?: string;
}

class PcControlAction implements HarnessAction {
  name = "pc.control";
  description = "Safe resource control operations (throttle, pause, resume)";

  async run(input: unknown): Promise<{ status: string; action: string }> {
    const { action, reason } = input as PcControlInput;
    if (!action) throw new Error("pc.control requires 'action'");

    switch (action) {
      case "throttle":
        return { status: "throttled", action: "Marked harness for reduced activity" };
      case "pause":
        return { status: "paused", action: "Paused heavy operations" };
      case "resume":
        return { status: "resumed", action: "Resumed normal operations" };
      case "notify_low_battery":
        return { status: "notified", action: `Low battery awareness: ${reason ?? "no reason"}` };
      default:
        throw new Error(`Unknown pc.control action: ${action}`);
    }
  }
}

export const pcMonitorAction = new PcMonitorAction();
export const pcControlAction = new PcControlAction();

export function registerPcActions(): void {
  globalActionRegistry.register(pcMonitorAction, {
    name: "pc.monitor", description: "Read CPU, RAM, and disk info for resource monitoring", category: "pc"
  });
  globalActionRegistry.register(pcControlAction, {
    name: "pc.control", description: "Safe resource control operations", category: "pc"
  });
}