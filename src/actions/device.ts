import { execSync } from "node:child_process";
import { HarnessAction, ActionMeta } from "./types";
import { globalActionRegistry } from "../registry/actionsRegistry";

export interface UsbDeviceInfo {
  bus?: string;
  device?: string;
  id?: string;
  description?: string;
}

class DeviceUsbListAction implements HarnessAction {
  name = "device.usb.list";
  description = "Enumerate USB devices via OS commands";

  async run(_input: unknown): Promise<{ devices: UsbDeviceInfo[] }> {
    const devices: UsbDeviceInfo[] = [];
    try {
      if (process.platform === "linux") {
        const out = execSync("lsusb 2>/dev/null || echo ''", { encoding: "utf8", timeout: 5000 });
        for (const line of out.trim().split("\n")) {
          if (!line.trim()) continue;
          const m = line.match(/Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+(\S+)\s+(.+)/);
          if (m) devices.push({ bus: m[1], device: m[2], id: m[3], description: m[4] });
        }
      } else if (process.platform === "darwin") {
        const out = execSync("system_profiler SPUSBDataType 2>/dev/null || echo ''", { encoding: "utf8", timeout: 10000 });
        for (const line of out.split("\n")) {
          const m = line.match(/Product:\s+(.+)/);
          if (m) devices.push({ description: m[1].trim() });
        }
      } else if (process.platform === "win32") {
        const out = execSync('wmic path Win32_PnPEntity get DeviceID,Description /format:csv 2>nul || echo ""', { encoding: "utf8", timeout: 5000 });
        for (const line of out.trim().split("\n").slice(1)) {
          const parts = line.split(",");
          if (parts.length >= 3) devices.push({ id: parts[2]?.trim(), description: parts[1]?.trim() });
        }
      }
    } catch { /* USB not available */ }
    return { devices };
  }
}

class DeviceUsbInfoAction implements HarnessAction {
  name = "device.usb.info";
  description = "Get detailed info about USB devices";

  async run(_input: unknown): Promise<{ info: string }> {
    try {
      if (process.platform === "linux") {
        const out = execSync("lsusb -v 2>/dev/null | head -100", { encoding: "utf8", timeout: 10000 });
        return { info: out.trim() };
      }
      if (process.platform === "darwin") {
        const out = execSync("system_profiler SPUSBDataType 2>/dev/null | head -100", { encoding: "utf8", timeout: 10000 });
        return { info: out.trim() };
      }
      return { info: "USB detailed info not supported on this platform" };
    } catch {
      return { info: "USB info not available" };
    }
  }
}

interface DeviceRemoteInput {
  endpoint: string;
  method?: "GET" | "POST";
  payload?: unknown;
}

class DeviceRemoteCallAction implements HarnessAction {
  name = "device.remote.call";
  description = "Call remote agents/devices via HTTP (requires config permission)";

  async run(input: unknown): Promise<{ status: string; data?: unknown }> {
    const { endpoint, method = "GET", payload } = input as DeviceRemoteInput;
    if (!endpoint) throw new Error("device.remote.call requires 'endpoint'");

    const allowedDomains: string[] = (global as any).__allowedRemoteDomains ?? [];
    try {
      const url = new URL(endpoint);
      if (allowedDomains.length > 0 && !allowedDomains.some((d) => url.hostname.includes(d))) {
        throw new Error(`Remote endpoint not in allowlist: ${url.hostname}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Remote endpoint")) throw error;
      throw new Error(`Invalid endpoint URL: ${endpoint}`);
    }

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const data = response.ok ? await response.json() : await response.text();
    return { status: response.ok ? "ok" : "error", data };
  }
}

export const deviceUsbListAction = new DeviceUsbListAction();
export const deviceUsbInfoAction = new DeviceUsbInfoAction();
export const deviceRemoteCallAction = new DeviceRemoteCallAction();

export function registerDeviceActions(): void {
  globalActionRegistry.register(deviceUsbListAction, {
    name: "device.usb.list", description: "Enumerate USB devices via OS commands", category: "device"
  });
  globalActionRegistry.register(deviceUsbInfoAction, {
    name: "device.usb.info", description: "Get detailed info about USB devices", category: "device"
  });
  globalActionRegistry.register(deviceRemoteCallAction, {
    name: "device.remote.call", description: "Call remote agents/devices via HTTP", requiresConfirmation: true, category: "device"
  });
}