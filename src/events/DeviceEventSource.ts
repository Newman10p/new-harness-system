// ─── M.A.I. Device Event Source ──────────────────────────────────────────
// Monitors device state (battery, network, disk, bluetooth, monitors, location)
// and publishes events to the EventMesh when state changes are detected.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";
import type { MeshEvent, EventPriority } from "./types.js";
import { EVENT_TYPES } from "./types.js";
import { getEventMesh } from "./EventMesh.js";

const execAsync = promisify(exec);

// ─── Device State Snapshot ──────────────────────────────────────────────────

interface DeviceState {
 batteryLevel: number | null;
 batteryCharging: boolean | null;
 networkInterfaces: Record<string, string>; // iface -> status summary
  diskUsagePercent: number;
  connectedBluetoothDevices: string[];
  connectedMonitors: number;
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  totalMemoryGb: number;
  location: { latitude: number; longitude: number } | null;
  lastLocationUpdate: number | null;
}

// ─── Configuration ──────────────────────────────────────────────────────────

interface DeviceEventSourceConfig {
 /** How often to poll device state in ms (default 30 000) */
  pollIntervalMs: number;
 /** Battery low threshold percentage (default 20) */
  batteryLowThreshold: number;
 /** Battery critical threshold percentage (default 5) */
  batteryCriticalThreshold: number;
 /** CPU high threshold percentage (default 90) */
  cpuHighThreshold: number;
 /** Memory high threshold percentage (default 90) */
  memoryHighThreshold: number;
 /** Disk usage warning threshold percentage (default 90) */
  diskHighThreshold: number;
 /** Enable location tracking (default false — requires mobile gateway) */
  enableLocation: boolean;
}

const DEFAULT_CONFIG: DeviceEventSourceConfig = {
  pollIntervalMs: 30_000,
  batteryLowThreshold: 20,
  batteryCriticalThreshold: 5,
  cpuHighThreshold: 90,
  memoryHighThreshold: 90,
  diskHighThreshold: 90,
  enableLocation: false,
};

// ─── Device Event Source ────────────────────────────────────────────────────

export class DeviceEventSource {
  private config: DeviceEventSourceConfig;
  private previousState: DeviceState | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private shutdownFlag = false;
  private deviceId: string;
  private cpuHistory: number[] = []; // Rolling CPU readings
  private readonly CPU_HISTORY_SIZE = 5;

  constructor(config?: Partial<DeviceEventSourceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deviceId = this.generateDeviceId();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Start polling device state and publishing events.
   */
  start(): void {
    if (this.pollTimer) return;

    this.shutdownFlag = false;

    // Initial snapshot
    this.collectAndEmit().catch(() => {});

    // Periodic polling
    this.pollTimer = setInterval(
      () => this.collectAndEmit().catch(() => {}),
      this.config.pollIntervalMs
    );
    if (this.pollTimer.unref) this.pollTimer.unref();
  }

  /**
   * Stop polling.
   */
  stop(): void {
    this.shutdownFlag = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Update location from an external source (e.g., mobile device gateway).
   */
  updateLocation(latitude: number, longitude: number): void {
    if (!this.previousState) return;

    const prev = this.previousState.location;
    this.previousState.location = { latitude, longitude };
    this.previousState.lastLocationUpdate = Date.now();

    // Emit if location changed significantly (> 100m)
    if (prev) {
      const dist = this.haversineDistance(
        prev.latitude, prev.longitude,
        latitude, longitude
      );
      if (dist > 0.1) { // 0.1 km = 100m
        this.publishEvent(EVENT_TYPES.DEVICE_LOCATION_CHANGE, {
          previousLocation: prev,
          newLocation: { latitude, longitude },
          distanceKm: Math.round(dist * 1000) / 1000,
        });
      }
    } else {
      // First location fix
      this.publishEvent(EVENT_TYPES.DEVICE_LOCATION_CHANGE, {
        previousLocation: null,
        newLocation: { latitude, longitude },
        distanceKm: 0,
      });
    }
  }

  // ─── State Collection ──────────────────────────────────────────────────

  private async collectAndEmit(): Promise<void> {
    if (this.shutdownFlag) return;

    const mesh = getEventMesh();

    try {
      const state = await this.collectState();

      // Publish connected event on first successful collection
      if (!this.previousState) {
        this.publishEvent(EVENT_TYPES.DEVICE_CONNECTED, {
          deviceId: this.deviceId,
          hostname: state.hostname,
          platform: state.platform,
          arch: state.arch,
          cpuModel: state.cpuModel,
          totalMemoryGb: state.totalMemoryGb,
        });
      }

      // Compare with previous state and emit changes
      if (this.previousState) {
        this.detectBatteryChanges(state);
        this.detectNetworkChanges(state);
        this.detectDiskChanges(state);
        this.detectBluetoothChanges(state);
        this.detectMonitorChanges(state);
        await this.detectSystemChanges(state);
      }

      this.previousState = state;
    } catch (err) {
      // Collection failures are non-fatal
      console.error("[DeviceEventSource] Collection error:", err);
    }
  }

  private async collectState(): Promise<DeviceState> {
    const [battery, disk, bt] = await Promise.allSettled([
      this.getBatteryInfo(),
      this.getDiskUsage(),
      this.getBluetoothDevices(),
    ]);

    return {
      batteryLevel: battery.status === "fulfilled" ? battery.value.level : null,
      batteryCharging:
        battery.status === "fulfilled" ? battery.value.charging : null,
      networkInterfaces: this.getNetworkInterfaces(),
      diskUsagePercent:
        disk.status === "fulfilled" ? disk.value : this.previousState?.diskUsagePercent ?? 0,
      connectedBluetoothDevices:
        bt.status === "fulfilled" ? bt.value : [],
      connectedMonitors: this.getMonitorCount(),
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpuModel: this.getCpuModel(),
      totalMemoryGb: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 100) / 100,
      location: this.previousState?.location ?? null,
      lastLocationUpdate: this.previousState?.lastLocationUpdate ?? null,
    };
  }

  // ─── Battery Detection ─────────────────────────────────────────────────

  private detectBatteryChanges(state: DeviceState): void {
    if (state.batteryLevel === null || !this.previousState) return;

    const prev = this.previousState.batteryLevel;

    if (
      state.batteryLevel <= this.config.batteryCriticalThreshold &&
      (prev === null || prev > this.config.batteryCriticalThreshold)
    ) {
      this.publishEvent(
        EVENT_TYPES.DEVICE_BATTERY_CRITICAL,
        {
          level: state.batteryLevel,
          charging: state.batteryCharging,
          deviceId: this.deviceId,
        },
        "critical"
      );
    } else if (
      state.batteryLevel <= this.config.batteryLowThreshold &&
      (prev === null || prev > this.config.batteryLowThreshold)
    ) {
      this.publishEvent(
        EVENT_TYPES.DEVICE_BATTERY_LOW,
        {
          level: state.batteryLevel,
          charging: state.batteryCharging,
          deviceId: this.deviceId,
        },
        "high"
      );
    }
  }

  // ─── Network Detection ─────────────────────────────────────────────────

  private detectNetworkChanges(state: DeviceState): void {
    if (!this.previousState) return;

    const prevIfaces = Object.keys(this.previousState.networkInterfaces).sort();
    const currIfaces = Object.keys(state.networkInterfaces).sort();

    if (JSON.stringify(prevIfaces) !== JSON.stringify(currIfaces)) {
      const added = currIfaces.filter((i) => !prevIfaces.includes(i));
      const removed = prevIfaces.filter((i) => !currIfaces.includes(i));

      this.publishEvent(EVENT_TYPES.SYSTEM_NETWORK_CHANGE, {
        previousInterfaces: this.previousState.networkInterfaces,
        currentInterfaces: state.networkInterfaces,
        added,
        removed,
        deviceId: this.deviceId,
      });
    }

    // Also detect address changes on existing interfaces
    for (const iface of currIfaces) {
      const prevAddr = this.previousState.networkInterfaces[iface];
      const currAddr = state.networkInterfaces[iface];
      if (prevAddr && currAddr && prevAddr !== currAddr) {
        this.publishEvent(EVENT_TYPES.SYSTEM_NETWORK_CHANGE, {
          interface: iface,
          previousAddress: prevAddr,
          currentAddress: currAddr,
          deviceId: this.deviceId,
        });
      }
    }
  }

  // ─── Disk Detection ────────────────────────────────────────────────────

  private detectDiskChanges(state: DeviceState): void {
    if (!this.previousState) return;

    if (
      state.diskUsagePercent >= this.config.diskHighThreshold &&
      this.previousState.diskUsagePercent < this.config.diskHighThreshold
    ) {
      this.publishEvent(
        "system.disk_high",
        {
          usagePercent: state.diskUsagePercent,
          threshold: this.config.diskHighThreshold,
          deviceId: this.deviceId,
        },
        "high"
      );
    }
  }

  // ─── Bluetooth Detection ───────────────────────────────────────────────

  private detectBluetoothChanges(state: DeviceState): void {
    if (!this.previousState) return;

    const prevSet = new Set(this.previousState.connectedBluetoothDevices);
    const currSet = new Set(state.connectedBluetoothDevices);

    for (const device of Array.from(currSet)) {
      if (!prevSet.has(device)) {
        this.publishEvent(EVENT_TYPES.DEVICE_CONNECTED, {
          type: "bluetooth",
          deviceName: device,
          deviceId: this.deviceId,
        });
      }
    }

    for (const device of Array.from(prevSet)) {
      if (!currSet.has(device)) {
        this.publishEvent(EVENT_TYPES.DEVICE_DISCONNECTED, {
          type: "bluetooth",
          deviceName: device,
          deviceId: this.deviceId,
        });
      }
    }
  }

  // ─── Monitor Detection ─────────────────────────────────────────────────

  private detectMonitorChanges(state: DeviceState): void {
    if (!this.previousState) return;

    if (state.connectedMonitors !== this.previousState.connectedMonitors) {
      if (state.connectedMonitors > this.previousState.connectedMonitors) {
        this.publishEvent(EVENT_TYPES.DEVICE_CONNECTED, {
          type: "monitor",
          monitorCount: state.connectedMonitors,
          deviceId: this.deviceId,
        });
      } else {
        this.publishEvent(EVENT_TYPES.DEVICE_DISCONNECTED, {
          type: "monitor",
          monitorCount: state.connectedMonitors,
          deviceId: this.deviceId,
        });
      }
    }
  }

  // ─── System Metrics Detection ──────────────────────────────────────────

  private async detectSystemChanges(state: DeviceState): Promise<void> {
    // CPU
    const cpuUsage = await this.getCpuUsage();
    this.cpuHistory.push(cpuUsage);
    if (this.cpuHistory.length > this.CPU_HISTORY_SIZE) {
      this.cpuHistory.shift();
    }

    // Use average of recent readings for stability
    const avgCpu =
      this.cpuHistory.reduce((a, b) => a + b, 0) / this.cpuHistory.length;

    if (avgCpu >= this.config.cpuHighThreshold) {
      this.publishEvent(
        EVENT_TYPES.SYSTEM_CPU_HIGH,
        {
          cpuPercent: Math.round(avgCpu * 10) / 10,
          threshold: this.config.cpuHighThreshold,
          deviceId: this.deviceId,
        },
        avgCpu > 95 ? "critical" : "high"
      );
    }

    // Memory
    const memUsage = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
    if (memUsage >= this.config.memoryHighThreshold) {
      this.publishEvent(
        EVENT_TYPES.SYSTEM_MEMORY_HIGH,
        {
          memoryPercent: Math.round(memUsage * 10) / 10,
          freeMemoryGb: Math.round((os.freemem() / 1024 / 1024 / 1024) * 100) / 100,
          threshold: this.config.memoryHighThreshold,
          deviceId: this.deviceId,
        },
        memUsage > 95 ? "critical" : "high"
      );
    }
  }

  // ─── Platform-Specific Collection ───────────────────────────────────────

  private async getBatteryInfo(): Promise<{ level: number; charging: boolean }> {
    const platform = os.platform();

    try {
      if (platform === "darwin") {
        const { stdout } = await execAsync("pmset -g batt");
        const match = stdout.match(/(\d+)%/);
        const level = match ? parseInt(match[1], 10) : 100;
        const charging = stdout.includes("AC Power") || stdout.includes("charged");
        return { level, charging };
      }

      if (platform === "linux") {
        try {
          const { stdout: energy } = await execAsync(
            "cat /sys/class/power_supply/BAT0/energy_now 2>/dev/null || echo 0"
          );
          const { stdout: full } = await execAsync(
            "cat /sys/class/power_supply/BAT0/energy_full 2>/dev/null || echo 1"
          );
          const { stdout: status } = await execAsync(
            "cat /sys/class/power_supply/BAT0/status 2>/dev/null || echo Unknown"
          );
          const level = Math.round((parseInt(energy) / parseInt(full)) * 100);
          const charging = status.trim().toLowerCase() === "charging";
          return { level, charging };
        } catch {
          return { level: 100, charging: true };
        }
      }
    } catch {
      // Battery info unavailable
    }

    return { level: 100, charging: true };
  }

  private async getDiskUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync("df -k / 2>/dev/null | tail -1");
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 5) {
        const used = parseInt(parts[2], 10);
        const capacity = parseInt(parts[3], 10);
        if (capacity > 0) return Math.round((used / (used + capacity)) * 100);
      }
    } catch {
      // Fallback
    }
    return 0;
  }

  private async getBluetoothDevices(): Promise<string[]> {
    const platform = os.platform();
    const devices: string[] = [];

    try {
      if (platform === "darwin") {
        const { stdout } = await execAsync(
          "system_profiler SPBluetoothDataType 2>/dev/null"
        );
        const connected = stdout.match(/Connected:.*?(?=\n|$)/gi);
        if (connected) {
          for (const line of connected) {
            const name = line.replace(/Connected:\s*/i, "").trim();
            if (name && name !== "Yes") devices.push(name);
          }
        }
      } else if (platform === "linux") {
        const { stdout } = await execAsync(
          "bluetoothctl devices Connected 2>/dev/null || echo ''");
        const lines = stdout.trim().split("\n");
        for (const line of lines) {
          const match = line.match(/Device\s+(?:[\w:]+)\s+(.+)/);
          if (match) devices.push(match[1].trim());
        }
      }
    } catch {
      // Bluetooth unavailable
    }

    return devices;
  }

  private getNetworkInterfaces(): Record<string, string> {
    const ifaces = os.networkInterfaces();
    const result: Record<string, string> = {};

    for (const [name, entries] of Object.entries(ifaces)) {
      if (!entries) continue;
      // Skip loopback and internal interfaces
      const relevant = entries.filter(
        (e) => !e.internal && (e.family === "IPv4" || e.family === "IPv6")
      );
      if (relevant.length > 0) {
        result[name] = relevant.map((e) => e.address).join(", ");
      }
    }

    return result;
  }

  private getMonitorCount(): number {
    // We can't reliably detect monitor count without external tools.
    // Return a default; in practice this would use `system_profiler` (macOS)
    // or `xrandr` (Linux) or `wmic` (Windows).
    return 1;
  }

  private getCpuModel(): string {
    const cpus = os.cpus();
    return cpus.length > 0 ? cpus[0].model : "Unknown";
  }

  private async getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const start = process.cpuUsage();
      setTimeout(() => {
        const end = process.cpuUsage(start);
        const totalMicros = end.user + end.system;
        // normalize to 0-100 over the interval (100ms)
        const usage = (totalMicros / (100 * 1000)) * 100;
        resolve(Math.min(100, usage));
      }, 100);
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private generateDeviceId(): string {
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    const raw = `${hostname}-${platform}-${arch}`;
    // Simple hash-based ID
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return `device-${Math.abs(hash).toString(16).padStart(8, "0")}`;
  }

  /**
   * Haversine distance between two lat/long points in kilometers.
   */
  private haversineDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private publishEvent(
    type: string,
    payload: Record<string, unknown>,
    priority: EventPriority = "normal"
  ): void {
    const mesh = getEventMesh();
    mesh.publishSimple(type, "device-event-source", payload, priority, "device");
  }
}
