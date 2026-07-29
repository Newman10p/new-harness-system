// ─── M.A.I. Server Entry Point ─────────────────────────────────────────────
// Starts HTTP file server (3000) + WebSocket HUD (8080), wires to AgentLoop.
// Includes: audit logging, multi-provider fallback, default file watchers,
// scheduled task runner, and system metrics polling.

import dotenv from "dotenv";
dotenv.config();

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { AgentLoop } from "./core/AgentLoop.js";
import { PolicyEngine } from "./security/PolicyEngine.js";
import { ActionRegistry, setTaskRunner } from "./actions/index.js";
import { HudServer } from "./ui/HudServer.js";
import { initAuditLog, readAuditLog } from "./core/AuditLogger.js";
import {
  INBOX_PATH,
  AGENT_DIR,
  WORKFLOWS_DIR,
  CONTEXT_PATH,
} from "./core/constants.js";
import type { LLMConfig, InboxEvent, AuditEntry } from "./types/index.js";

// ─── Configuration ────────────────────────────────────────────────────────
const HTTP_PORT = parseInt(process.env.HTTP_PORT ?? "3000", 10);
const WS_PORT = parseInt(process.env.WS_PORT ?? "8080", 10);
const PUBLIC_DIR = path.join(process.cwd(), "public");

const llmConfig: LLMConfig = {
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
  const audit = await initAuditLog();
  await audit({
    type: "llm_call",
    detail: "M.A.I. server starting",
    ok: true,
  });

  // 2. Load policy engine
  const policyEngine = await PolicyEngine.load();
  const policyConfig = policyEngine.getConfig();
  console.log(
    `[Policy] deny_commands: ${policyConfig.deny_commands?.length ?? 0} rules`
  );
  console.log(
    `[Policy] allow_network: ${policyConfig.allow_network?.length ?? 0} hosts`
  );
  console.log(
    `[Policy] require_approval: ${policyConfig.require_approval?.length ?? 0} actions`
  );
  await audit({
    type: "policy_loaded",
    detail: `Policy loaded: ${policyConfig.deny_commands?.length ?? 0} deny, ${policyConfig.allow_network?.length ?? 0} network, ${policyConfig.require_approval?.length ?? 0} approval`,
  });
  console.log();

  // 3. Create action registry
  const registry = new ActionRegistry();
  console.log(`[Actions] ${registry.listActions().length} primitives registered`);
  console.log(`[Actions] ${registry.listActions().join(", ")}`);
  console.log();

  // 4. Create inbox appender
  const inboxAppender = async (event: InboxEvent): Promise<void> => {
    const line = `- [${event.timestamp}] ${event.type} | ${event.source}: ${event.detail}\n`;
    try {
      await fs.promises.mkdir(path.dirname(INBOX_PATH), { recursive: true });
      await fs.promises.appendFile(INBOX_PATH, line, "utf-8");
    } catch (err) {
      console.error(`[Inbox] Failed to write: ${err instanceof Error ? err.message : err}`);
    }
  };

  // 5. Create agent loop
  const loop = new AgentLoop(llmConfig, policyEngine, registry, {
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
  setTaskRunner((command: string) => {
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
  const httpServer = http.createServer((req, res) => {
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
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Missing text field" }));
          }
        } catch {
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
        } catch {
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
      readAuditLog(100).then((log) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, log }));
      }).catch(() => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Failed to read audit log" }));
      });
      return;
    }

    // ── Static File Serving (SPA fallback) ──
    let filePath = path.join(PUBLIC_DIR, req.url === "/" ? "index.html" : (req.url ?? "index.html"));

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
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

    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.join(PUBLIC_DIR, "index.html"), (_err2, indexData) => {
          if (indexData) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(indexData);
          } else {
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
  const hudServer = new HudServer(httpServer, WS_PORT);
  hudServer.wireAgentLoop(loop);

  // 10. System metrics polling (every 15s)
  setInterval(async () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpuLoad = await getCpuUsage();

    hudServer.broadcast("system_metrics", {
      cpu: cpuLoad,
      memory: Math.round(((totalMem - freeMem) / totalMem) * 100),
      disk: 0,
    });
  }, 15_000);

  // 11. Reactor pulse (every 5s)
  setInterval(() => {
    hudServer.broadcast("reactor_pulse", {
      power: 95 + Math.floor(Math.random() * 5),
      status: loop.getState().isRunning ? "active" : "idle",
    });
  }, 5000);

  // 12. Log startup complete
  await audit({
    type: "llm_call",
    detail: `M.A.I. server fully started (HTTP:${HTTP_PORT}, WS:${WS_PORT}, ${providerInfo.count} providers, ${registry.listActions().length} actions)`,
    ok: true,
  });

  console.log("[M.A.I.] All systems online. Open http://localhost:3000 for the HUD.\n");

  // 13. Graceful shutdown
  const shutdown = async () => {
    console.log("\n[M.A.I.] Shutting down...");
    await audit({
      type: "llm_call",
      detail: "M.A.I. server shutting down",
      ok: true,
    });
    registry.shutdown();
    hudServer.shutdown();
    httpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Simple CPU usage estimation
let lastCpuSample: { idle: number; total: number } | null = null;

async function getCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const cpus = os.cpus();
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
    } else {
      lastCpuSample = { idle, total };
      resolve(0);
    }
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
