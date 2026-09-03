"use strict";
// ─── get-gpu-info ──────────────────────────────────────────────────────
// Retrieves GPU information: name, temperature, memory, utilization.
// Tries nvidia-smi, lspci, and /sys/class/drm depending on platform.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGpuInfo = getGpuInfo;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_os_1 = __importDefault(require("node:os"));
const promises_1 = __importDefault(require("node:fs/promises"));
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
async function getGpuInfo(_action, _ctx) {
    const platform = node_os_1.default.platform();
    const gpus = [];
    // 1. Try nvidia-smi (works on Windows and Linux with NVIDIA drivers)
    try {
        const { stdout } = await execAsync("nvidia-smi --query-gpu=name,temperature.gpu,memory.used,memory.total,utilization.gpu,driver_version --format=csv,noheader,nounits", {
            timeout: 5_000,
        });
        const lines = stdout.trim().split("\n").filter(Boolean);
        for (const line of lines) {
            const parts = line.split(", ").map((s) => s.trim());
            if (parts.length >= 4) {
                gpus.push({
                    name: parts[0],
                    temperatureC: parts[1] !== "[N/A]" ? parseFloat(parts[1]) : undefined,
                    memoryUsed: parts[2] !== "[N/A]" ? parseFloat(parts[2]) : undefined,
                    memoryTotal: parts[3] !== "[N/A]" ? parseFloat(parts[3]) : undefined,
                    utilizationPercent: parts[4] !== "[N/A]" ? parseFloat(parts[4]) : undefined,
                    driverVersion: parts[5],
                });
            }
        }
        if (gpus.length > 0) {
            return {
                ok: true,
                data: {
                    source: "nvidia-smi",
                    gpus,
                },
            };
        }
    }
    catch {
        // nvidia-smi not available
    }
    // 2. Try lspci on Linux/macOS
    if (platform === "linux" || platform === "darwin") {
        try {
            const { stdout } = await execAsync("lspci 2>/dev/null | grep -i vga", {
                timeout: 5_000,
            });
            const vgaLines = stdout.trim().split("\n").filter(Boolean);
            for (const line of vgaLines) {
                const match = line.match(/VGA.*?: (.+)/i);
                if (match) {
                    gpus.push({ name: match[1].trim() });
                }
            }
        }
        catch {
            // lspci not available
        }
        // 3. Try /sys/class/drm on Linux
        if (platform === "linux") {
            try {
                const drmDir = "/sys/class/drm";
                const entries = await promises_1.default.readdir(drmDir);
                const cardDirs = entries.filter((e) => e.startsWith("card") && !e.includes("-"));
                for (const card of cardDirs) {
                    // Try reading device name from device/vendor files
                    const devicePath = `${drmDir}/${card}/device`;
                    try {
                        const vendor = await promises_1.default.readFile(`${devicePath}/vendor`, "utf-8").catch(() => "");
                        const device = await promises_1.default.readFile(`${devicePath}/device`, "utf-8").catch(() => "");
                        if (vendor || device) {
                            // Add if not already detected by lspci
                            const vendorHex = vendor.trim().replace("0x", "");
                            const deviceHex = device.trim().replace("0x", "");
                            gpus.push({
                                name: `PCI Device ${vendorHex}:${deviceHex}`,
                            });
                        }
                    }
                    catch {
                        // Cannot read device info
                    }
                    // Try reading GPU temperature from hwmon
                    const hwmonPath = `${devicePath}/hwmon`;
                    try {
                        const hwmons = await promises_1.default.readdir(hwmonPath);
                        for (const hwmon of hwmons) {
                            const tempFile = `${hwmonPath}/${hwmon}/temp1_input`;
                            const temp = await promises_1.default.readFile(tempFile, "utf-8").catch(() => "");
                            if (temp) {
                                const lastGpu = gpus[gpus.length - 1];
                                if (lastGpu) {
                                    lastGpu.temperatureC = Math.round(parseInt(temp.trim(), 10) / 1000);
                                }
                                break;
                            }
                        }
                    }
                    catch {
                        // No hwmon data
                    }
                }
            }
            catch {
                // /sys/class/drm not accessible
            }
        }
    }
    if (gpus.length > 0) {
        return {
            ok: true,
            data: {
                source: "lspci/sysfs",
                gpus,
            },
        };
    }
    return {
        ok: true,
        data: {
            source: "none",
            gpus: [],
            message: "GPU monitoring is not available on this system. Install nvidia-smi (NVIDIA drivers) or ensure lspci is available on Linux/macOS.",
        },
    };
}
//# sourceMappingURL=get-gpu-info.js.map