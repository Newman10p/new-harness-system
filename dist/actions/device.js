"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceRemoteCallAction = exports.deviceUsbInfoAction = exports.deviceUsbListAction = void 0;
exports.registerDeviceActions = registerDeviceActions;
const node_child_process_1 = require("node:child_process");
const actionsRegistry_1 = require("../registry/actionsRegistry");
class DeviceUsbListAction {
    name = "device.usb.list";
    description = "Enumerate USB devices via OS commands";
    async run(_input) {
        const devices = [];
        try {
            if (process.platform === "linux") {
                const out = (0, node_child_process_1.execSync)("lsusb 2>/dev/null || echo ''", { encoding: "utf8", timeout: 5000 });
                for (const line of out.trim().split("\n")) {
                    if (!line.trim())
                        continue;
                    const m = line.match(/Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+(\S+)\s+(.+)/);
                    if (m)
                        devices.push({ bus: m[1], device: m[2], id: m[3], description: m[4] });
                }
            }
            else if (process.platform === "darwin") {
                const out = (0, node_child_process_1.execSync)("system_profiler SPUSBDataType 2>/dev/null || echo ''", { encoding: "utf8", timeout: 10000 });
                for (const line of out.split("\n")) {
                    const m = line.match(/Product:\s+(.+)/);
                    if (m)
                        devices.push({ description: m[1].trim() });
                }
            }
            else if (process.platform === "win32") {
                const out = (0, node_child_process_1.execSync)('wmic path Win32_PnPEntity get DeviceID,Description /format:csv 2>nul || echo ""', { encoding: "utf8", timeout: 5000 });
                for (const line of out.trim().split("\n").slice(1)) {
                    const parts = line.split(",");
                    if (parts.length >= 3)
                        devices.push({ id: parts[2]?.trim(), description: parts[1]?.trim() });
                }
            }
        }
        catch { /* USB not available */ }
        return { devices };
    }
}
class DeviceUsbInfoAction {
    name = "device.usb.info";
    description = "Get detailed info about USB devices";
    async run(_input) {
        try {
            if (process.platform === "linux") {
                const out = (0, node_child_process_1.execSync)("lsusb -v 2>/dev/null | head -100", { encoding: "utf8", timeout: 10000 });
                return { info: out.trim() };
            }
            if (process.platform === "darwin") {
                const out = (0, node_child_process_1.execSync)("system_profiler SPUSBDataType 2>/dev/null | head -100", { encoding: "utf8", timeout: 10000 });
                return { info: out.trim() };
            }
            return { info: "USB detailed info not supported on this platform" };
        }
        catch {
            return { info: "USB info not available" };
        }
    }
}
class DeviceRemoteCallAction {
    name = "device.remote.call";
    description = "Call remote agents/devices via HTTP (requires config permission)";
    async run(input) {
        const { endpoint, method = "GET", payload } = input;
        if (!endpoint)
            throw new Error("device.remote.call requires 'endpoint'");
        const allowedDomains = global.__allowedRemoteDomains ?? [];
        try {
            const url = new URL(endpoint);
            if (allowedDomains.length > 0 && !allowedDomains.some((d) => url.hostname.includes(d))) {
                throw new Error(`Remote endpoint not in allowlist: ${url.hostname}`);
            }
        }
        catch (error) {
            if (error instanceof Error && error.message.startsWith("Remote endpoint"))
                throw error;
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
exports.deviceUsbListAction = new DeviceUsbListAction();
exports.deviceUsbInfoAction = new DeviceUsbInfoAction();
exports.deviceRemoteCallAction = new DeviceRemoteCallAction();
function registerDeviceActions() {
    actionsRegistry_1.globalActionRegistry.register(exports.deviceUsbListAction, {
        name: "device.usb.list", description: "Enumerate USB devices via OS commands", category: "device"
    });
    actionsRegistry_1.globalActionRegistry.register(exports.deviceUsbInfoAction, {
        name: "device.usb.info", description: "Get detailed info about USB devices", category: "device"
    });
    actionsRegistry_1.globalActionRegistry.register(exports.deviceRemoteCallAction, {
        name: "device.remote.call", description: "Call remote agents/devices via HTTP", requiresConfirmation: true, category: "device"
    });
}
//# sourceMappingURL=device.js.map