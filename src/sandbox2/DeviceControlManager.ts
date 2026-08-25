// ─── M.A.I. DeviceControlManager ─────────────────────────────────────
// Device discovery, registration, and control layer.
// Provides Mai with the ability to discover and control devices:
//   - Smart home (MQTT, Home Assistant)
//   - Network devices (SSH, SNMP, UPnP)
//   - Bluetooth devices (BLE, Classic)
//   - USB/serial devices
//   - Display/audio devices (backlight, volume)
//   - System devices (fans, LEDs, sensors)
//
// Architecture:
//   - DeviceRegistry: in-memory store of discovered devices + capabilities
//   - DeviceAdapter: per-protocol interface for discovery & control
//   - Unified control API: sendCommand() routes to the right adapter

import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import { EventEmitter } from "node:events";
import crypto from "node:crypto";

const execAsync = promisify(exec);

// ─── Types ────────────────────────────────────────────────────────────────

export type DeviceProtocol =
  | "local"
  | "mqtt"
  | "home-assistant"
  | "ssh"
  | "snmp"
  | "upnp"
  | "bluetooth"
  | "usb"
  | "serial"
  | "display"
  | "audio"
  | "network-service";

export type DeviceStatus = "online" | "offline" | "unknown" | "error";

export interface DeviceCapability {
  /** Human-readable name of the capability */
  name: string;
  /** The type of action this capability supports */
  type: "switch" | "slider" | "sensor" | "text" | "select" | "button" | "toggle";
  /** Current value (for sensors/sliders/toggles) */
  value?: string | number | boolean;
  /** Allowed values for select type */
  options?: string[];
  /** Min/max for slider type */
  range?: { min: number; max: number; step?: number };
  /** Unit label */
  unit?: string;
}

export interface Device {
  id: string;
  name: string;
  protocol: DeviceProtocol;
  status: DeviceStatus;
  capabilities: DeviceCapability[];
  /** Protocol-specific metadata */
  metadata: Record<string, unknown>;
  /** When the device was discovered/registered */
  discoveredAt: number;
  /** Last communication */
  lastSeenAt: number;
  /** The adapter that manages this device */
  adapterId: string;
}

export interface DeviceCommand {
  deviceId: string;
  capability: string;
  action: "set" | "get" | "toggle" | "trigger";
  value?: string | number | boolean;
}

export interface DeviceCommandResult {
  success: boolean;
  deviceId: string;
  capability: string;
  action: string;
  value?: unknown;
  previousValue?: unknown;
  error?: string;
  durationMs: number;
}

export interface DeviceDiscoveryResult {
  adapterId: string;
  protocol: DeviceProtocol;
  devicesFound: number;
  newDevices: Device[];
  error?: string;
  durationMs: number;
}

export interface DeviceControlConfig {
  /** Enable/disable device control entirely */
  enabled: boolean;
  /** Adapters to enable */
  adapters: Partial<AdapterConfigs>;
  /** Auto-discover on startup */
  autoDiscover: boolean;
  /** How often to re-scan (ms), 0 = no auto-scan */
  scanIntervalMs: number;
  /** Home Assistant URL */
  homeAssistantUrl?: string;
  /** Home Assistant token */
  homeAssistantToken?: string;
  /** MQTT broker URL */
  mqttBrokerUrl?: string;
  /** MQTT username */
  mqttUsername?: string;
  /** MQTT password */
  mqttPassword?: string;
  /** Known SSH hosts */
  sshHosts?: Array<{ host: string; port?: number; user?: string; keyPath?: string }>;
}

interface AdapterConfigs {
  local: { enabled: boolean };
  display: { enabled: boolean };
  audio: { enabled: boolean };
  usb: { enabled: boolean };
  bluetooth: { enabled: boolean };
  "home-assistant": { enabled: boolean; url: string; token: string };
  mqtt: { enabled: boolean; brokerUrl: string; username?: string; password?: string };
  ssh: { enabled: boolean; hosts: Array<{ host: string; port?: number; user?: string; keyPath?: string }> };
  upnp: { enabled: boolean };
}

// ─── Events ───────────────────────────────────────────────────────────────

export interface DeviceControlEvents {
  device_discovered: (device: Device) => void;
  device_removed: (deviceId: string) => void;
  device_status_change: (deviceId: string, oldStatus: DeviceStatus, newStatus: DeviceStatus) => void;
  device_state_change: (deviceId: string, capability: string, value: unknown) => void;
  discovery_complete: (result: DeviceDiscoveryResult) => void;
}

// ─── DeviceAdapter Interface ──────────────────────────────────────────────

export abstract class DeviceAdapter {
  abstract readonly id: string;
  abstract readonly protocol: DeviceProtocol;
  abstract readonly name: string;
  protected devices = new Map<string, Device>();
  protected config: Record<string, unknown>;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
  }

  /** Discover devices on this protocol */
  abstract discover(): Promise<Device[]>;

  /** Send a command to a device */
  abstract sendCommand(cmd: DeviceCommand): Promise<DeviceCommandResult>;

  /** Get current state of a device's capability */
  abstract getState(deviceId: string, capability: string): Promise<unknown>;

  /** Get all devices managed by this adapter */
  getDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  /** Clean up resources */
  async cleanup(): Promise<void> {
    this.devices.clear();
  }
}

// ─── Local System Adapter ────────────────────────────────────────────────

export class LocalSystemAdapter extends DeviceAdapter {
  readonly id = "local-system";
  readonly protocol: DeviceProtocol = "local";
  readonly name = "Local System";

  async discover(): Promise<Device[]> {
    const devices: Device[] = [];
    const platform = os.platform();

    // Register the local machine as a device
    const localDevice: Device = {
      id: "local-machine",
      name: os.hostname(),
      protocol: "local",
      status: "online",
      capabilities: [
        { name: "hostname", type: "sensor", value: os.hostname() },
        { name: "platform", type: "sensor", value: platform },
        { name: "arch", type: "sensor", value: os.arch() },
        { name: "cpu_count", type: "sensor", value: os.cpus().length, unit: "cores" },
        { name: "total_memory", type: "sensor", value: Math.round(os.totalmem() / 1024 / 1024 / 1024), unit: "GB" },
        { name: "uptime", type: "sensor", value: Math.round(os.uptime()), unit: "seconds" },
        { name: "notification", type: "button" },
      ],
      metadata: { platform, arch: os.arch(), release: os.release() },
      discoveredAt: Date.now(),
      lastSeenAt: Date.now(),
      adapterId: this.id,
    };
    this.devices.set(localDevice.id, localDevice);
    devices.push(localDevice);

    return devices;
  }

  async sendCommand(cmd: DeviceCommand): Promise<DeviceCommandResult> {
    const start = Date.now();

    if (cmd.deviceId === "local-machine" && cmd.capability === "notification") {
      // Send a desktop notification
      const title = String(cmd.value ?? "M.A.I.");
      try {
        if (os.platform() === "linux") {
          await execAsync(`notify-send "${title}" "M.A.I. Alert"`, { timeout: 5000 });
        } else if (os.platform() === "darwin") {
          await execAsync(`osascript -e 'display notification "M.A.I. Alert" with title "${title}"'`, { timeout: 5000 });
        }
        return { success: true, deviceId: cmd.deviceId, capability: cmd.capability, action: cmd.action, durationMs: Date.now() - start };
      } catch (err: any) {
        return { success: false, deviceId: cmd.deviceId, capability: cmd.capability, action: cmd.action, error: err.message, durationMs: Date.now() - start };
      }
    }

    return { success: false, deviceId: cmd.deviceId, capability: cmd.capability, action: cmd.action, error: `Unknown command: ${cmd.capability}`, durationMs: Date.now() - start };
  }

  async getState(deviceId: string, capability: string): Promise<unknown> {
    const device = this.devices.get(deviceId);
    if (!device) return null;
    const cap = device.capabilities.find(c => c.name === capability);
    return cap?.value ?? null;
  }
}

// ─── Display Adapter ──────────────────────────────────────────────────────

export class DisplayAdapter extends DeviceAdapter {
  readonly id = "display";
  readonly protocol: DeviceProtocol = "display";
  readonly name = "Display Control";

  async discover(): Promise<Device[]> {
    const devices: Device[] = [];
    const platform = os.platform();

    try {
      let brightness = "unknown";
      if (platform === "linux") {
        try {
          const { stdout } = await execAsync("brightnessctl info 2>/dev/null | grep -oP '\d+%'", { timeout: 3000 });
          brightness = stdout.trim() || "unknown";
        } catch { /* no brightnessctl */ }
      } else if (platform === "darwin") {
        try {
          const { stdout } = await execAsync("brightness -l 2>/dev/null | tail -1 | awk '{print $NF}'", { timeout: 3000 });
          brightness = stdout.trim() || "unknown";
        } catch { /* no brightness tool */ }
      }

      const displayDevice: Device = {
        id: "display-primary",
        name: "Primary Display",
        protocol: "display",
        status: "online",
        capabilities: [
          { name: "brightness", type: "slider", value: parseFloat(brightness) || 100, range: { min: 0, max: 100, step: 5 }, unit: "%" },
          { name: "night_mode", type: "toggle", value: false },
        ],
        metadata: { platform },
        discoveredAt: Date.now(),
        lastSeenAt: Date.now(),
        adapterId: this.id,
      };
      this.devices.set(displayDevice.id, displayDevice);
      devices.push(displayDevice);
    } catch {
      // Display not available in this environment
    }

    return devices;
  }

  async sendCommand(cmd: DeviceCommand): Promise<DeviceCommandResult> {
    const start = Date.now();
    const platform = os.platform();

    if (cmd.capability === "brightness" && cmd.action === "set") {
      const level = Number(cmd.value);
      try {
        if (platform === "linux") {
          await execAsync(`brightnessctl set ${level}%`, { timeout: 5000 });
        } else if (platform === "darwin") {
          await execAsync(`brightness ${level / 100}`, { timeout: 5000 });
        }
        this.updateCapabilityValue("display-primary", "brightness", level);
        return { success: true, deviceId: cmd.deviceId, capability: "brightness", action: "set", value: level, durationMs: Date.now() - start };
      } catch (err: any) {
        return { success: false, deviceId: cmd.deviceId, capability: "brightness", action: "set", error: err.message, durationMs: Date.now() - start };
      }
    }

    return { success: false, deviceId: cmd.deviceId, capability: cmd.capability, action: cmd.action, error: `Unsupported: ${cmd.capability}`, durationMs: Date.now() - start };
  }

  async getState(deviceId: string, capability: string): Promise<unknown> {
    const device = this.devices.get(deviceId);
    if (!device) return null;
    const cap = device.capabilities.find(c => c.name === capability);
    return cap?.value ?? null;
  }

  private updateCapabilityValue(deviceId: string, capName: string, value: string | number | boolean) {
    const device = this.devices.get(deviceId);
    if (device) {
      const cap = device.capabilities.find(c => c.name === capName);
      if (cap) cap.value = value;
    }
  }
}

// ─── Audio Adapter ────────────────────────────────────────────────────────

export class AudioDeviceAdapter extends DeviceAdapter {
  readonly id = "audio";
  readonly protocol: DeviceProtocol = "audio";
  readonly name = "Audio Control";

  async discover(): Promise<Device[]> {
    const devices: Device[] = [];
    const platform = os.platform();

    try {
      let volume = 50;
      let muted = false;

      if (platform === "linux") {
        try {
          const { stdout } = await execAsync("pactl get-sink-volume @DEFAULT_SINK@ | grep -oP '\d+%' | head -1", { timeout: 3000 });
          volume = parseInt(stdout.trim()) || 50;
        } catch { /* no pulseaudio */ }
        try {
          const { stdout } = await execAsync("pactl get-sink-mute @DEFAULT_SINK@", { timeout: 3000 });
          muted = stdout.trim().includes("yes");
        } catch { /* no pulseaudio */ }
      } else if (platform === "darwin") {
        try {
          const { stdout } = await execAsync("osascript -e 'output volume of (get volume settings)'", { timeout: 3000 });
          volume = parseInt(stdout.trim()) || 50;
          const { stdout: mutedOut } = await execAsync("osascript -e 'output muted of (get volume settings)'", { timeout: 3000 });
          muted = mutedOut.trim() === "true";
        } catch { /* no osascript access */ }
      }

      const audioDevice: Device = {
        id: "audio-primary",
        name: "Primary Audio Output",
        protocol: "audio",
        status: "online",
        capabilities: [
          { name: "volume", type: "slider", value: volume, range: { min: 0, max: 100, step: 5 }, unit: "%" },
          { name: "muted", type: "toggle", value: muted },
          { name: "play_pause", type: "button" },
          { name: "next_track", type: "button" },
          { name: "prev_track", type: "button" },
        ],
        metadata: { platform },
        discoveredAt: Date.now(),
        lastSeenAt: Date.now(),
        adapterId: this.id,
      };
      this.devices.set(audioDevice.id, audioDevice);
      devices.push(audioDevice);
    } catch {
      // Audio not available
    }

    return devices;
  }

  async sendCommand(cmd: DeviceCommand): Promise<DeviceCommandResult> {
    const start = Date.now();
    const platform = os.platform();

    try {
      if (cmd.capability === "volume" && cmd.action === "set") {
        const level = Number(cmd.value);
        if (platform === "linux") {
          await execAsync(`pactl set-sink-volume @DEFAULT_SINK@ ${level}%`, { timeout: 5000 });
        } else if (platform === "darwin") {
          await execAsync(`osascript -e "set volume output volume ${level}"`, { timeout: 5000 });
        }
        this.updateCap("audio-primary", "volume", level);
        return { success: true, deviceId: cmd.deviceId, capability: "volume", action: "set", value: level, durationMs: Date.now() - start };
      }

      if (cmd.capability === "muted" && (cmd.action === "set" || cmd.action === "toggle")) {
        let muted: boolean;
        if (cmd.action === "toggle") {
          const current = await this.getState(cmd.deviceId, "muted") as boolean;
          muted = !current;
        } else {
          muted = Boolean(cmd.value);
        }
        if (platform === "linux") {
          await execAsync(`pactl set-sink-mute @DEFAULT_SINK@ ${muted ? "1" : "0"}`, { timeout: 5000 });
        } else if (platform === "darwin") {
          await execAsync(`osascript -e "set volume output muted ${muted}"`, { timeout: 5000 });
        }
        this.updateCap("audio-primary", "muted", muted);
        return { success: true, deviceId: cmd.deviceId, capability: "muted", action: cmd.action, value: muted, durationMs: Date.now() - start };
      }

      if (cmd.capability === "play_pause" && cmd.action === "trigger") {
        if (platform === "linux") {
          await execAsync("playerctl play-pause", { timeout: 5000 }).catch(() => {});
        } else if (platform === "darwin") {
          await execAsync(`osascript -e 'tell application "System Events" to key code 16'`, { timeout: 5000 });
        }
        return { success: true, deviceId: cmd.deviceId, capability: "play_pause", action: "trigger", durationMs: Date.now() - start };
      }

      if ((cmd.capability === "next_track" || cmd.capability === "prev_track") && cmd.action === "trigger") {
        const playerCmd = cmd.capability === "next_track" ? "next" : "previous";
        if (platform === "linux") {
          await execAsync(`playerctl ${playerCmd}`, { timeout: 5000 }).catch(() => {});
        } else if (platform === "darwin") {
          const code = cmd.capability === "next_track" ? 17 : 18;
          await execAsync(`osascript -e 'tell application "System Events" to key code ${code}'`, { timeout: 5000 });
        }
        return { success: true, deviceId: cmd.deviceId, capability: cmd.capability, action: "trigger", durationMs: Date.now() - start };
      }
    } catch (err: any) {
      return { success: false, deviceId: cmd.deviceId, capability: cmd.capability, action: cmd.action, error: err.message, durationMs: Date.now() - start };
    }

    return { success: false, deviceId: cmd.deviceId, capability: cmd.capability, action: cmd.action, error: `Unsupported: ${cmd.capability}`, durationMs: Date.now() - start };
  }

  async getState(deviceId: string, capability: string): Promise<unknown> {
    const device = this.devices.get(deviceId);
    if (!device) return null;
    const cap = device.capabilities.find(c => c.name === capability);
    return cap?.value ?? null;
  }

  private updateCap(deviceId: string, capName: string, value: string | number | boolean) {
    const device = this.devices.get(deviceId);
    if (device) {
      const cap = device.capabilities.find(c => c.name === capName);
      if (cap) cap.value = value;
    }
  }
}

// ─── Network Service Adapter ─────────────────────────────────────────────

export class NetworkServiceAdapter extends DeviceAdapter {
  readonly id = "network-services";
  readonly protocol: DeviceProtocol = "network-service";
  readonly name = "Network Services";

  async discover(): Promise<Device[]> {
    const devices: Device[] = [];

    // Scan common local services
    const services = [
      { name: "Ollama", port: 11434, path: "/api/tags" },
      { name: "Piper TTS", port: 5002, path: "/" },
      { name: "Home Assistant", port: 8123, path: "/api/" },
      { name: "MQTT Broker", port: 1883, path: null },
      { name: "Cockpit", port: 9090, path: "/" },
    ];

    for (const svc of services) {
      try {
        const result = await this.probeService("127.0.0.1", svc.port, svc.path);
        if (result.reachable) {
          const device: Device = {
            id: `svc-${svc.name.toLowerCase().replace(/\s+/g, "-")}`,
            name: `${svc.name} (localhost:${svc.port})`,
            protocol: "network-service",
            status: "online",
            capabilities: [
              { name: "status", type: "sensor", value: "running" },
              { name: "port", type: "sensor", value: svc.port },
              { name: "restart", type: "button" },
            ],
            metadata: { host: "127.0.0.1", port: svc.port, responseTime: result.responseTimeMs },
            discoveredAt: Date.now(),
            lastSeenAt: Date.now(),
            adapterId: this.id,
          };
          this.devices.set(device.id, device);
          devices.push(device);
        }
      } catch { /* not reachable */ }
    }

    return devices;
  }

  async sendCommand(cmd: DeviceCommand): Promise<DeviceCommandResult> {
    const start = Date.now();
    const device = this.devices.get(cmd.deviceId);
    if (!device) {
      return { success: false, deviceId: cmd.deviceId, capability: cmd.capability, action: cmd.action, error: "Device not found", durationMs: Date.now() - start };
    }

    if (cmd.capability === "restart" && cmd.action === "trigger") {
      const port = device.metadata.port as number;
      try {
        // Try systemctl restart for known services
        const svcName = device.name.toLowerCase().includes("ollama") ? "ollama"
          : device.name.toLowerCase().includes("home assistant") ? "home-assistant"
          : null;
        if (svcName) {
          await execAsync(`sudo systemctl restart ${svcName}`, { timeout: 15_000 });
          return { success: true, deviceId: cmd.deviceId, capability: "restart", action: "trigger", value: "restarting", durationMs: Date.now() - start };
        }
        return { success: false, deviceId: cmd.deviceId, capability: "restart", action: "trigger", error: "Cannot determine service name for restart", durationMs: Date.now() - start };
      } catch (err: any) {
        return { success: false, deviceId: cmd.deviceId, capability: "restart", action: "trigger", error: err.message, durationMs: Date.now() - start };
      }
    }

    return { success: false, deviceId: cmd.deviceId, capability: cmd.capability, action: cmd.action, error: `Unsupported: ${cmd.capability}`, durationMs: Date.now() - start };
  }

  async getState(deviceId: string, capability: string): Promise<unknown> {
    const device = this.devices.get(deviceId);
    if (!device) return null;
    const cap = device.capabilities.find(c => c.name === capability);
    return cap?.value ?? null;
  }

  private async probeService(host: string, port: number, _path: string | null): Promise<{ reachable: boolean; responseTimeMs: number }> {
    const start = Date.now();
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);

      socket.on("connect", () => {
        const responseTime = Date.now() - start;
        socket.destroy();
        resolve({ reachable: true, responseTimeMs: responseTime });
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve({ reachable: false, responseTimeMs: Date.now() - start });
      });

      socket.on("error", () => {
        socket.destroy();
        resolve({ reachable: false, responseTimeMs: Date.now() - start });
      });

      socket.connect(port, host);
    });
  }
}

// ─── USB Device Adapter ──────────────────────────────────────────────────

export class UsbDeviceAdapter extends DeviceAdapter {
  readonly id = "usb";
  readonly protocol: DeviceProtocol = "usb";
  readonly name = "USB Devices";

  async discover(): Promise<Device[]> {
    const devices: Device[] = [];
    const platform = os.platform();

    try {
      let cmd = "";
      if (platform === "linux") {
        cmd = "lsusb 2>/dev/null || echo ''";
      } else if (platform === "darwin") {
        cmd = "system_profiler SPUSBDataType 2>/dev/null | grep -E 'Product ID|Vendor ID' || echo ''";
      } else {
        return devices;
      }

      const { stdout } = await execAsync(cmd, { timeout: 5000 });
      const lines = stdout.trim().split("\n").filter(Boolean);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const id = `usb-${crypto.createHash("md5").update(line).digest("hex").slice(0, 8)}`;
        const device: Device = {
          id,
          name: line.length > 60 ? line.slice(0, 57) + "..." : line,
          protocol: "usb",
          status: "online",
          capabilities: [
            { name: "info", type: "sensor", value: line },
          ],
          metadata: { raw: line },
          discoveredAt: Date.now(),
          lastSeenAt: Date.now(),
          adapterId: this.id,
        };
        this.devices.set(id, device);
        devices.push(device);
      }
    } catch { /* no USB tools */ }

    return devices;
  }

  async sendCommand(cmd: DeviceCommand): Promise<DeviceCommandResult> {
    return { success: false, deviceId: cmd.deviceId, capability: cmd.capability, action: cmd.action, error: "USB devices are read-only in this version", durationMs: 0 };
  }

  async getState(deviceId: string, capability: string): Promise<unknown> {
    const device = this.devices.get(deviceId);
    if (!device) return null;
    const cap = device.capabilities.find(c => c.name === capability);
    return cap?.value ?? null;
  }
}

// ─── DeviceControlManager ─────────────────────────────────────────────────

export class DeviceControlManager extends EventEmitter {
  private adapters = new Map<string, DeviceAdapter>();
  private allDevices = new Map<string, Device>();
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private config: DeviceControlConfig;
  private _initialized = false;

  constructor(config?: Partial<DeviceControlConfig>) {
    super();
    this.config = {
      enabled: true,
      adapters: {},
      autoDiscover: true,
      scanIntervalMs: 0, // no auto-scan by default
      ...config,
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Initialize the device control manager and register adapters.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log("[DeviceControl] Disabled by configuration");
      return;
    }

    // Register built-in adapters
    this.registerAdapter(new LocalSystemAdapter());
    this.registerAdapter(new DisplayAdapter());
    this.registerAdapter(new AudioDeviceAdapter());
    this.registerAdapter(new NetworkServiceAdapter());
    this.registerAdapter(new UsbDeviceAdapter());

    // Auto-discover on startup
    if (this.config.autoDiscover) {
      await this.discoverAll();
    }

    // Set up periodic re-scan
    if (this.config.scanIntervalMs > 0) {
      this.scanInterval = setInterval(() => this.discoverAll(), this.config.scanIntervalMs);
      this.scanInterval.unref();
    }

    this._initialized = true;
    console.log(`[DeviceControl] Initialized. Adapters: ${this.adapters.size}, Devices: ${this.allDevices.size}`);
  }

  /**
   * Register a device adapter.
   */
  registerAdapter(adapter: DeviceAdapter): void {
    this.adapters.set(adapter.id, adapter);
    console.log(`[DeviceControl] Adapter registered: ${adapter.name} (${adapter.protocol})`);
  }

  /**
   * Discover devices across all adapters.
   */
  async discoverAll(): Promise<DeviceDiscoveryResult[]> {
    const results: DeviceDiscoveryResult[] = [];

    for (const [adapterId, adapter] of this.adapters) {
      try {
        const start = Date.now();
        const newDevices = await adapter.discover();

        for (const device of newDevices) {
          const existing = this.allDevices.get(device.id);
          if (!existing) {
            this.allDevices.set(device.id, device);
            this.emit("device_discovered", device);
          } else {
            // Update last seen
            existing.lastSeenAt = Date.now();
            existing.status = device.status;
          }
        }

        const result: DeviceDiscoveryResult = {
          adapterId,
          protocol: adapter.protocol,
          devicesFound: newDevices.length,
          newDevices,
          durationMs: Date.now() - start,
        };
        results.push(result);
        this.emit("discovery_complete", result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          adapterId,
          protocol: adapter.protocol,
          devicesFound: 0,
          newDevices: [],
          error: message,
          durationMs: 0,
        });
      }
    }

    return results;
  }

  /**
   * Send a command to a device.
   */
  async sendCommand(cmd: DeviceCommand): Promise<DeviceCommandResult> {
    const device = this.allDevices.get(cmd.deviceId);
    if (!device) {
      return {
        success: false, deviceId: cmd.deviceId, capability: cmd.capability,
        action: cmd.action, error: `Device not found: ${cmd.deviceId}`, durationMs: 0,
      };
    }

    const adapter = this.adapters.get(device.adapterId);
    if (!adapter) {
      return {
        success: false, deviceId: cmd.deviceId, capability: cmd.capability,
        action: cmd.action, error: `No adapter for device: ${device.adapterId}`, durationMs: 0,
      };
    }

    const previousValue = await adapter.getState(cmd.deviceId, cmd.capability);
    const result = await adapter.sendCommand(cmd);

    // Emit state change event
    if (result.success && result.value !== undefined) {
      this.emit("device_state_change", cmd.deviceId, cmd.capability, result.value);
    }

    return { ...result, previousValue };
  }

  /**
   * Get the state of a device capability.
   */
  async getState(deviceId: string, capability: string): Promise<unknown> {
    const device = this.allDevices.get(deviceId);
    if (!device) return null;
    const adapter = this.adapters.get(device.adapterId);
    if (!adapter) return null;
    return adapter.getState(deviceId, capability);
  }

  /**
   * List all known devices.
   */
  listDevices(): Device[] {
    return Array.from(this.allDevices.values());
  }

  /**
   * Get a specific device by ID.
   */
  getDevice(deviceId: string): Device | undefined {
    return this.allDevices.get(deviceId);
  }

  /**
   * List devices by protocol.
   */
  getDevicesByProtocol(protocol: DeviceProtocol): Device[] {
    return this.listDevices().filter(d => d.protocol === protocol);
  }

  /**
   * Search devices by name or capability.
   */
  searchDevices(query: string): Device[] {
    const q = query.toLowerCase();
    return this.listDevices().filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.capabilities.some(c => c.name.toLowerCase().includes(q))
    );
  }

  /**
   * Get device control statistics.
  */
  getStats(): { totalDevices: number; adaptersCount: number; protocols: DeviceProtocol[] } {
    return {
      totalDevices: this.allDevices.size,
      adaptersCount: this.adapters.size,
      protocols: [...new Set(Array.from(this.allDevices.values()).map(d => d.protocol))],
    };
  }

  /**
   * Graceful shutdown — cleanup all adapters.
   */
  async shutdown(): Promise<void> {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    for (const adapter of this.adapters.values()) {
      await adapter.cleanup();
    }
    this.adapters.clear();
    this.allDevices.clear();
    console.log("[DeviceControl] Shutdown complete");
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: DeviceControlManager | null = null;

export function getDeviceControlManager(config?: Partial<DeviceControlConfig>): DeviceControlManager {
  if (!_instance) {
    _instance = new DeviceControlManager(config);
  }
  return _instance;
}
