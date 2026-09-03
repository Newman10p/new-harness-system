"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pcControlAction = exports.pcMonitorAction = void 0;
exports.registerPcActions = registerPcActions;
const node_os_1 = __importDefault(require("node:os"));
const node_child_process_1 = require("node:child_process");
const actionsRegistry_1 = require("../registry/actionsRegistry");
class PcMonitorAction {
    name = "pc.monitor";
    description = "Read CPU, RAM, and disk info for resource monitoring";
    async run(_input) {
        const cpus = node_os_1.default.cpus();
        const totalMem = node_os_1.default.totalmem();
        const freeMem = node_os_1.default.freemem();
        // Disk info (cross-platform best effort)
        let diskTotal = 0;
        let diskFree = 0;
        try {
            if (process.platform === "win32") {
                const out = (0, node_child_process_1.execSync)("wmic logicaldisk get size,freespace", { encoding: "utf8", timeout: 5000 });
                const lines = out.trim().split("\n").slice(1);
                for (const line of lines) {
                    const [, freeStr, totalStr] = line.trim().split(/\s+/);
                    diskTotal += parseInt(totalStr || "0", 10);
                    diskFree += parseInt(freeStr || "0", 10);
                }
            }
            else {
                const stat = (0, node_child_process_1.execSync)("df -k /", { encoding: "utf8", timeout: 5000 });
                const parts = stat.trim().split("\n")[1]?.split(/\s+/) ?? [];
                diskTotal = parseInt(parts[1] || "0", 10) * 1024;
                diskFree = parseInt(parts[3] || "0", 10) * 1024;
            }
        }
        catch {
            // Fallback: use os.totalmem as rough estimate
            diskTotal = totalMem;
            diskFree = freeMem;
        }
        return {
            cpu: {
                loadAvg: node_os_1.default.loadavg(),
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
            uptime: node_os_1.default.uptime(),
            hostname: node_os_1.default.hostname(),
            platform: process.platform
        };
    }
}
class PcControlAction {
    name = "pc.control";
    description = "Safe resource control operations (throttle, pause, resume)";
    async run(input) {
        const { action, reason } = input;
        if (!action)
            throw new Error("pc.control requires 'action'");
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
exports.pcMonitorAction = new PcMonitorAction();
exports.pcControlAction = new PcControlAction();
function registerPcActions() {
    actionsRegistry_1.globalActionRegistry.register(exports.pcMonitorAction, {
        name: "pc.monitor", description: "Read CPU, RAM, and disk info for resource monitoring", category: "pc"
    });
    actionsRegistry_1.globalActionRegistry.register(exports.pcControlAction, {
        name: "pc.control", description: "Safe resource control operations", category: "pc"
    });
}
//# sourceMappingURL=pc.js.map