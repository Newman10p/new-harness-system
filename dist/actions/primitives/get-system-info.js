"use strict";
// ─── get-system-info ────────────────────────────────────────────────────────
// Returns host system information: hostname, platform, CPU, memory.
// Pure os module — no external dependencies.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSystemInfo = getSystemInfo;
const node_os_1 = __importDefault(require("node:os"));
async function getSystemInfo(_action, _ctx) {
    const totalMem = node_os_1.default.totalmem();
    const freeMem = node_os_1.default.freemem();
    const usedMem = totalMem - freeMem;
    return {
        ok: true,
        data: {
            hostname: node_os_1.default.hostname(),
            platform: node_os_1.default.platform(),
            arch: node_os_1.default.arch(),
            release: node_os_1.default.release(),
            uptime: node_os_1.default.uptime(),
            cpu: {
                model: node_os_1.default.cpus()[0]?.model ?? "unknown",
                cores: node_os_1.default.cpus().length,
                speed: node_os_1.default.cpus()[0]?.speed ?? 0,
            },
            memory: {
                total: totalMem,
                free: freeMem,
                used: usedMem,
                usagePercent: Math.round((usedMem / totalMem) * 100),
            },
        },
    };
}
//# sourceMappingURL=get-system-info.js.map