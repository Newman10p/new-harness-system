"use strict";
// ─── get-network-info ─────────────────────────────────────────────────
// Retrieves network interface information using Node.js os module.
// Attempts to get bandwidth stats via platform commands if available.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNetworkInfo = getNetworkInfo;
const node_os_1 = __importDefault(require("node:os"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
async function getNetworkInfo(_action, _ctx) {
    try {
        const ifaces = node_os_1.default.networkInterfaces();
        const interfaces = [];
        for (const [name, entries] of Object.entries(ifaces)) {
            if (!entries)
                continue;
            for (const entry of entries) {
                interfaces.push({
                    name,
                    internal: entry.internal,
                    family: entry.family,
                    address: entry.address,
                    netmask: entry.netmask ?? "",
                    mac: entry.mac ?? "",
                    cidr: entry.cidr ?? undefined,
                });
            }
        }
        // Try to get bandwidth stats on Linux
        const platform = node_os_1.default.platform();
        if (platform === "linux") {
            try {
                const { stdout } = await execAsync("cat /proc/net/dev 2>/dev/null | tail -n +3", { timeout: 3_000 });
                const bwMap = parseProcNetDev(stdout);
                for (const iface of interfaces) {
                    const bw = bwMap.get(iface.name);
                    if (bw) {
                        iface.bytesIn = bw.bytesIn;
                        iface.bytesOut = bw.bytesOut;
                        iface.packetsIn = bw.packetsIn;
                        iface.packetsOut = bw.packetsOut;
                    }
                }
            }
            catch {
                // /proc/net/dev not available
            }
        }
        const externalInterfaces = interfaces.filter((i) => !i.internal);
        const loopbackInterfaces = interfaces.filter((i) => i.internal);
        return {
            ok: true,
            data: {
                hostname: node_os_1.default.hostname(),
                total: interfaces.length,
                external: externalInterfaces.length,
                interfaces: externalInterfaces,
                loopback: loopbackInterfaces,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to get network info: ${message}` };
    }
}
function parseProcNetDev(stdout) {
    const map = new Map();
    for (const line of stdout.trim().split("\n")) {
        // Format: "  eth0:  1234  567  ...  890  123  ..."
        const match = line.match(/^(\s*)([\w.-]+):\s+(.+)/);
        if (!match)
            continue;
        const name = match[2];
        const fields = match[3].trim().split(/\s+/).map(Number);
        // /proc/net/dev columns:
        // 0: rx_bytes, 1: rx_packets, ..., 8: tx_bytes, 9: tx_packets
        if (fields.length >= 10) {
            map.set(name, {
                bytesIn: fields[0],
                packetsIn: fields[1],
                bytesOut: fields[8],
                packetsOut: fields[9],
            });
        }
    }
    return map;
}
//# sourceMappingURL=get-network-info.js.map