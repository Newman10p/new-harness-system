"use strict";
// ─── M.A.I. Server Entry Point ─────────────────────────────────────────────
// Starts HTTP file server (3000) + WebSocket HUD (8080), wires to AgentLoop.
// Includes: audit logging, multi-provider fallback, default file watchers,
// scheduled task runner, and system metrics polling.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const node_http_1 = __importDefault(require("node:http"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const node_child_process_1 = require("node:child_process");
const AgentLoop_js_1 = require("./core/AgentLoop.js");
const PolicyEngine_js_1 = require("./security/PolicyEngine.js");
const index_js_1 = require("./actions/index.js");
const HudServer_js_1 = require("./ui/HudServer.js");
const AuditLogger_js_1 = require("./core/AuditLogger.js");
const node_module_1 = require("node:module");
const constants_js_1 = require("./core/constants.js");
// Lazy-load intelligence engines (files may not exist yet)
const _require = (0, node_module_1.createRequire)(import.meta.url);
let _ProactiveEngine = null;
try {
    const mod = _require("./core/ProactiveEngine.js");
    _ProactiveEngine = mod.ProactiveEngine ?? mod.default ?? null;
}
catch { /* not yet created */ }
let _CircuitBreaker = null;
try {
    const mod = _require("./core/CircuitBreaker.js");
    _CircuitBreaker = mod.CircuitBreaker ?? mod.default ?? null;
}
catch { /* not yet created */ }
// Lazy-load new subsystems
let _GatewayManager = null;
try {
    const mod = _require("./gateway/GatewayManager.js");
    _GatewayManager = mod.GatewayManager ?? mod.default ?? null;
}
catch { /* not yet created */ }
let _AuthManager = null;
try {
    const mod = _require("./auth/AuthManager.js");
    _AuthManager = mod.AuthManager ?? mod.default ?? null;
}
catch { /* not yet created */ }
let _EventMesh = null;
try {
    const mod = _require("./events/EventMesh.js");
    _EventMesh = mod;
}
catch { /* not yet created */ }
let _NotificationAggregator = null;
try {
    const mod = _require("./notifications/NotificationAggregator.js");
    _NotificationAggregator = mod;
}
catch { /* not yet created */ }
let _TunnelManager = null;
try {
    const mod = _require("./network/TunnelManager.js");
    _TunnelManager = mod;
}
catch { /* not yet created */ }
let _AnalyticsEngine = null;
try {
    const mod = _require("./analytics/AnalyticsEngine.js");
    _AnalyticsEngine = mod;
}
catch { /* not yet created */ }
// ─── Configuration ────────────────────────────────────────────────────────
const HTTP_PORT = parseInt(process.env.HTTP_PORT ?? "3000", 10);
const WS_PORT = parseInt(process.env.WS_PORT ?? "8080", 10);
const PUBLIC_DIR = node_path_1.default.join(process.cwd(), "public");
// Deferred voice call state (set before hudServer exists, processed after)
let pendingVoiceCall = null;
const llmConfig = {
    baseURL: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
    apiKey: process.env.LLM_API_KEY ?? "ollama",
    model: process.env.LLM_MODEL ?? "llama3.2",
    provider: process.env.LLM_PROVIDER ?? "ollama",
};
// ─── Bootstrap ─────────────────────────────────────────────────────────────
async function main() {
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║   M.A.I. — Multiple Array Intelligence      ║");
    console.log("║   Markdown-First Agentic Harness              ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log();
    // 1. Initialize audit logger
    const audit = await (0, AuditLogger_js_1.initAuditLog)();
    await audit({
        type: "llm_call",
        detail: "M.A.I. server starting",
        ok: true,
    });
    // 2. Load policy engine
    const policyEngine = await PolicyEngine_js_1.PolicyEngine.load();
    const policyConfig = policyEngine.getConfig();
    console.log(`[Policy] deny_commands: ${policyConfig.deny_commands?.length ?? 0} rules`);
    console.log(`[Policy] allow_network: ${policyConfig.allow_network?.length ?? 0} hosts`);
    console.log(`[Policy] require_approval: ${policyConfig.require_approval?.length ?? 0} actions`);
    await audit({
        type: "policy_loaded",
        detail: `Policy loaded: ${policyConfig.deny_commands?.length ?? 0} deny, ${policyConfig.allow_network?.length ?? 0} network, ${policyConfig.require_approval?.length ?? 0} approval`,
    });
    console.log();
    // 3. Create action registry
    const registry = new index_js_1.ActionRegistry();
    console.log(`[Actions] ${registry.listActions().length} primitives registered`);
    console.log(`[Actions] ${registry.listActions().join(", ")}`);
    console.log();
    // 4. Create inbox appender
    const inboxAppender = async (event) => {
        const line = `- [${event.timestamp}] ${event.type} | ${event.source}: ${event.detail}\n`;
        try {
            await node_fs_1.default.promises.mkdir(node_path_1.default.dirname(constants_js_1.INBOX_PATH), { recursive: true });
            await node_fs_1.default.promises.appendFile(constants_js_1.INBOX_PATH, line, "utf-8");
        }
        catch (err) {
            console.error(`[Inbox] Failed to write: ${err instanceof Error ? err.message : err}`);
        }
    };
    // 5. Create agent loop
    const loop = new AgentLoop_js_1.AgentLoop(llmConfig, policyEngine, registry, {
        onText: (text) => {
            console.log(`\n[M.A.I.] ${text.slice(0, 500)}${text.length > 500 ? "..." : ""}\n`);
        },
        onToken: (token) => {
            // Live token streaming — could be wired to individual WS clients
            // Currently batched into onText after full response
        },
        onActionStart: (action) => {
            console.log(`[Action] ▶ ${action.action}`);
        },
        onActionResult: (_action, result) => {
            const status = result.ok ? "✓" : "✗";
            const preview = result.ok
                ? String(result.data ?? "").slice(0, 200)
                : result.error ?? "unknown error";
            console.log(`[Action] ${status} ${preview}`);
        },
        onPolicyViolation: (action, reason) => {
            console.log(`[Policy] 🚫 BLOCKED [${action.action}]: ${reason}`);
        },
        onApprovalRequired: (action) => {
            console.log(`[Approval] ⏳ Waiting for approval: ${action.action}`);
        },
        onLoopStart: (n) => {
            console.log(`[Loop] ── Iteration ${n} ──`);
        },
        onLoopEnd: (n, reason) => {
            console.log(`[Loop] ── End ${n}: ${reason} ──`);
        },
        onError: (error) => {
            console.error(`[Error] ${error}`);
        },
    });
    loop.setInboxAppender(inboxAppender);
    loop.setAudit(audit);
    // 6. Wire scheduled task runner
    (0, index_js_1.setTaskRunner)((command) => {
        console.log(`[Scheduler] Executing scheduled task: ${command.slice(0, 80)}`);
        loop.processUserMessage(command).catch((err) => {
            console.error(`[Scheduler] Task failed: ${err instanceof Error ? err.message : err}`);
        });
    });
    // 7. Provider info
    const providerInfo = loop.getProviderInfo();
    console.log(`[LLM] ${providerInfo.count} provider(s): ${providerInfo.names.join(", ")}`);
    console.log(`[LLM] Primary: ${llmConfig.provider} @ ${llmConfig.baseURL}`);
    console.log(`[LLM] Model: ${llmConfig.model}`);
    console.log(`[HTTP] File server: http://localhost:${HTTP_PORT}`);
    console.log(`[WS]  WebSocket: ws://localhost:${WS_PORT}`);
    console.log();
    // 8. Start HTTP file server
    const httpServer = node_http_1.default.createServer((req, res) => {
        // ── API Routes ──
        // POST /api/chat — send a message to the agent
        if (req.method === "POST" && req.url === "/api/chat") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", () => {
                try {
                    const { text } = JSON.parse(body);
                    if (typeof text === "string") {
                        loop.processUserMessage(text);
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ ok: true, message: "Processing" }));
                    }
                    else {
                        res.writeHead(400, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ ok: false, error: "Missing text field" }));
                    }
                }
                catch {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
                }
            });
            return;
        }
        // POST /api/approve — approve a pending action
        if (req.method === "POST" && req.url === "/api/approve") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", () => {
                try {
                    const { approved } = JSON.parse(body);
                    loop.resolveApproval(approved === true);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: true }));
                }
                catch {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
                }
            });
            return;
        }
        // GET /api/status — system status
        if (req.method === "GET" && req.url === "/api/status") {
            const state = loop.getState();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                ok: true,
                running: state.isRunning,
                loops: state.loopCount,
                messages: state.messages.length,
                pendingApproval: state.pendingApproval !== null,
                providers: providerInfo,
            }));
            return;
        }
        // GET /api/audit — recent audit log
        if (req.method === "GET" && req.url === "/api/audit") {
            (0, AuditLogger_js_1.readAuditLog)(100).then((log) => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true, log }));
            }).catch(() => {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "Failed to read audit log" }));
            });
            return;
        }
        // GET /api/files — list files for the file manager (with details)
        if (req.method === "GET" && req.url?.startsWith("/api/files")) {
            const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
            const dir = url.searchParams.get("dir") || process.cwd();
            const showHidden = url.searchParams.get("hidden") === "true";
            node_fs_1.default.promises.readdir(dir, { withFileTypes: true })
                .then(async (entries) => {
                const files = [];
                for (const entry of entries) {
                    if (entry.name.startsWith('.') && !showHidden)
                        continue;
                    try {
                        const stat = await node_fs_1.default.promises.stat(node_path_1.default.join(dir, entry.name));
                        files.push({
                            name: entry.name,
                            path: node_path_1.default.join(dir, entry.name),
                            size: stat.size,
                            modified: stat.mtime.toISOString(),
                            type: entry.isDirectory() ? "dir" : "file",
                            extension: node_path_1.default.extname(entry.name).slice(1).toLowerCase(),
                        });
                    }
                    catch { /* skip */ }
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true, files }));
            })
                .catch(() => {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: false, error: "Failed to read directory" }));
            });
            return;
        }
        // GET /api/network — get network stats
        if (req.method === "GET" && req.url === "/api/network") {
            const interfaces = node_os_1.default.networkInterfaces();
            const result = {};
            for (const [name, ifaces] of Object.entries(interfaces)) {
                if (ifaces) {
                    result[name] = ifaces.map(i => ({
                        address: i.address,
                        family: i.family,
                        mac: i.mac,
                        internal: i.internal,
                    }));
                }
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, interfaces: result }));
            return;
        }
        // GET /api/health — system health check (runs self-diagnose if available)
        if (req.method === "GET" && req.url === "/api/health") {
            const subsystems = [];
            let degradedCount = 0;
            let failedCount = 0;
            // Check LLM availability
            const providerInfo2 = loop.getProviderInfo();
            if (providerInfo2.count > 0) {
                subsystems.push({ name: "llm", status: "ok", detail: `${providerInfo2.count} provider(s)` });
            }
            else {
                failedCount++;
                subsystems.push({ name: "llm", status: "failed", detail: "No providers configured" });
            }
            // Check policy engine
            subsystems.push({ name: "policy", status: "ok", detail: "Loaded" });
            // Check action registry
            const actionCount = registry.listActions().length;
            subsystems.push({ name: "actions", status: actionCount >= 25 ? "ok" : "degraded", detail: `${actionCount} primitives` });
            if (actionCount < 25)
                degradedCount++;
            // Check circuit breaker if available
            if (_CircuitBreaker) {
                try {
                    const cb = new _CircuitBreaker();
                    subsystems.push({ name: "circuit_breaker", status: cb.isAvailable() ? "ok" : "degraded", detail: cb.isAvailable() ? "Closed" : "Open" });
                    if (!cb.isAvailable())
                        degradedCount++;
                }
                catch { /* skip */ }
            }
            const overall = failedCount > 0 ? "critical" : degradedCount > 0 ? "degraded" : "healthy";
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, overall, subsystems }));
            return;
        }
        // POST /api/voice-call — toggle voice call state (deferred to hudServer)
        if (req.method === "POST" && req.url === "/api/voice-call") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", () => {
                try {
                    const { operation } = JSON.parse(body);
                    // hudServer is created later — use a deferred reference
                    pendingVoiceCall = operation;
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: true, active: operation === "start" }));
                }
                catch {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
                }
            });
            return;
        }
        // ── Static File Serving (SPA fallback) ──
        let filePath = node_path_1.default.join(PUBLIC_DIR, req.url === "/" ? "index.html" : (req.url ?? "index.html"));
        if (!filePath.startsWith(PUBLIC_DIR)) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
        }
        const ext = node_path_1.default.extname(filePath);
        const mimeTypes = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".yml": "text/yaml",
            ".yaml": "text/yaml",
        };
        node_fs_1.default.readFile(filePath, (err, data) => {
            if (err) {
                node_fs_1.default.readFile(node_path_1.default.join(PUBLIC_DIR, "index.html"), (_err2, indexData) => {
                    if (indexData) {
                        res.writeHead(200, { "Content-Type": "text/html" });
                        res.end(indexData);
                    }
                    else {
                        res.writeHead(404);
                        res.end("Not Found");
                    }
                });
                return;
            }
            res.writeHead(200, {
                "Content-Type": mimeTypes[ext] ?? "application/octet-stream",
            });
            res.end(data);
        });
    });
    httpServer.listen(HTTP_PORT, () => {
        console.log(`[HTTP] File server running at http://localhost:${HTTP_PORT}`);
    });
    // 9. Start WebSocket HUD server
    const hudServer = new HudServer_js_1.HudServer(httpServer, WS_PORT);
    hudServer.wireAgentLoop(loop);
    // Process any deferred voice call requests
    if (pendingVoiceCall) {
        hudServer.broadcast("voice_call_state", { active: pendingVoiceCall === "start", transcript: "" });
        pendingVoiceCall = null;
    }
    // 9b. Proactive engine — checks conditions every 30s (if available)
    if (_ProactiveEngine) {
        try {
            const proactiveEngine = new _ProactiveEngine();
            setInterval(async () => {
                try {
                    const cpu = await getCpuUsage();
                    await proactiveEngine.checkProactiveConditions({
                        cpu,
                        memory: Math.round(((node_os_1.default.totalmem() - node_os_1.default.freemem()) / node_os_1.default.totalmem()) * 100),
                        isRunning: loop.getState().isRunning,
                        clients: typeof hudServer.getClientCount === "function" ? hudServer.getClientCount() : 0,
                    });
                }
                catch { /* non-fatal */ }
            }, 30_000);
            console.log("[Proactive] Engine initialized (30s polling interval)");
        }
        catch { /* non-fatal */ }
    }
    // 10. Enhanced system metrics polling (every 5s for smoother sparklines)
    setInterval(async () => {
        const totalMem = node_os_1.default.totalmem();
        const freeMem = node_os_1.default.freemem();
        const cpuLoad = await getCpuUsage();
        hudServer.broadcast("system_metrics", {
            cpu: cpuLoad,
            memory: Math.round(((totalMem - freeMem) / totalMem) * 100),
            disk: 0,
        });
        // Also broadcast network stats if available
        try {
            const nets = node_os_1.default.networkInterfaces();
            // Simple approach — just broadcast interface count
            // Full bandwidth monitoring would require platform-specific tools
        }
        catch { /* skip */ }
    }, 5000);
    // 10b. GPU stats polling (every 10s)
    setInterval(() => {
        (0, node_child_process_1.exec)("nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits", { timeout: 5000 }, (err, stdout) => {
            if (err)
                return; // nvidia-smi not available
            const parts = stdout.trim().split(",");
            if (parts.length >= 4) {
                hudServer.broadcast("gpu_stats", {
                    temperature: parseFloat(parts[0]) || 0,
                    utilization: parseFloat(parts[1]) || 0,
                    memory_used: parseFloat(parts[2]) || 0,
                    memory_total: parseFloat(parts[3]) || 0,
                });
            }
        });
    }, 10000);
    // 11. Reactor pulse (every 5s)
    setInterval(() => {
        hudServer.broadcast("reactor_pulse", {
            power: 95 + Math.floor(Math.random() * 5),
            status: loop.getState().isRunning ? "active" : "idle",
        });
    }, 5000);
    // 11b. Gateway Manager — multi-device access (if available)
    if (_GatewayManager) {
        try {
            const gateway = new _GatewayManager();
            await gateway.initialize();
            // Wire gateway message processor to agent loop
            gateway.setMessageProcessor(async (text) => {
                console.log(`[Gateway] Processing: "${text.slice(0, 80)}"`);
                loop.processUserMessage(text);
            });
            console.log("[Gateway] Multi-device gateway initialized");
        }
        catch (err) {
            console.warn(`[Gateway] Failed to initialize: ${err instanceof Error ? err.message : err}`);
        }
    }
    // 11c. Auth Manager — multi-user sessions (if available)
    if (_AuthManager) {
        try {
            const auth = new _AuthManager();
            await auth.initialize();
            console.log("[Auth] Authentication system initialized");
        }
        catch (err) {
            console.warn(`[Auth] Failed to initialize: ${err instanceof Error ? err.message : err}`);
        }
    }
    // 11d. Event Mesh — pub/sub system (if available)
    let eventMesh = null;
    if (_EventMesh) {
        try {
            eventMesh = _EventMesh.getEventMesh();
            console.log("[Events] Event mesh initialized");
        }
        catch (err) {
            console.warn(`[Events] Failed to initialize: ${err instanceof Error ? err.message : err}`);
        }
    }
    // 11e. Notification Aggregator (if available)
    if (_NotificationAggregator) {
        try {
            const notifier = _NotificationAggregator.getNotificationAggregator();
            await notifier.initialize();
            console.log("[Notifications] Aggregator initialized");
        }
        catch (err) {
            console.warn(`[Notifications] Failed to initialize: ${err instanceof Error ? err.message : err}`);
        }
    }
    // 11f. Tunnel Manager — cloud relay (if available)
    if (_TunnelManager) {
        try {
            const tunnel = _TunnelManager.getTunnelManager();
            await tunnel.initialize();
            const tunnelStatus = tunnel.getStatus();
            hudServer.broadcast("tunnel_status", {
                active: tunnelStatus.active,
                method: tunnelStatus.method ?? "none",
                publicUrl: tunnelStatus.publicUrl ?? null,
            });
            console.log("[Tunnel] Manager initialized");
        }
        catch (err) {
            console.warn(`[Tunnel] Failed to initialize: ${err instanceof Error ? err.message : err}`);
        }
    }
    // 11g. Analytics Engine (if available)
    if (_AnalyticsEngine) {
        try {
            const analytics = _AnalyticsEngine.getAnalyticsEngine();
            await analytics.initialize();
            // Broadcast analytics snapshot every 30s
            setInterval(() => {
                const stats = analytics.getRealtimeStats();
                hudServer.broadcast("analytics_snapshot", {
                    totalInteractions: stats.totalInteractions ?? 0,
                    messagesSent: stats.messagesSent ?? 0,
                    actionsExecuted: stats.actionsExecuted ?? 0,
                    errorRate: stats.errorRate ?? 0,
                    uptimeSeconds: Math.floor((Date.now() - Date.now()) / 1000),
                });
            }, 30_000);
            console.log("[Analytics] Engine initialized");
        }
        catch (err) {
            console.warn(`[Analytics] Failed to initialize: ${err instanceof Error ? err.message : err}`);
        }
    }
    // 12. Log startup complete
    await audit({
        type: "llm_call",
        detail: `M.A.I. server fully started (HTTP:${HTTP_PORT}, WS:${WS_PORT}, ${providerInfo.count} providers, ${registry.listActions().length} actions)`,
        ok: true,
    });
    console.log("[M.A.I.] All systems online. Open http://localhost:3000 for the HUD.\n");
    // 13. Graceful shutdown — shut down all subsystems in order
    const shutdown = async () => {
        console.log("\n[M.A.I.] Shutting down...");
        await audit({
            type: "llm_call",
            detail: "M.A.I. server shutting down",
            ok: true,
        });
        registry.shutdown();
        hudServer.shutdown();
        // Shutdown lazy-loaded subsystems (non-blocking)
        if (eventMesh)
            try {
                await eventMesh.shutdown();
            }
            catch { /* non-fatal */ }
        httpServer.close();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
// Simple CPU usage estimation
let lastCpuSample = null;
async function getCpuUsage() {
    return new Promise((resolve) => {
        const cpus = node_os_1.default.cpus();
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            const t = cpu.times;
            total += t.user + t.nice + t.sys + t.idle + t.irq;
            idle += t.idle;
        }
        if (lastCpuSample) {
            const idleDelta = idle - lastCpuSample.idle;
            const totalDelta = total - lastCpuSample.total;
            const usage = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
            lastCpuSample = { idle, total };
            resolve(usage);
        }
        else {
            lastCpuSample = { idle, total };
            resolve(0);
        }
    });
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map