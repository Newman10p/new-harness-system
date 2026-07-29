// ─── M.A.I. Server Entry Point ─────────────────────────────────────────────
// Starts both the HTTP file server (port 3000) and WebSocket HUD server
// (port 8080), wires them to the AgentLoop with real approval flow.
//
// Usage: npx tsx src/server.ts
//   or:  npm start (after build)

import dotenv from "dotenv";
dotenv.config();

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

import { AgentLoop } from "./core/AgentLoop.js";
import { PolicyEngine } from "./security/PolicyEngine.js";
import { ActionRegistry } from "./actions/index.js";
import { HudServer } from "./ui/HudServer.js";
import { INBOX_PATH } from "./core/constants.js";
import type { LLMConfig, InboxEvent, HudChannel, HudPayloads } from "./types/index.js";

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
  console.log(`[Config] LLM: ${llmConfig.provider} @ ${llmConfig.baseURL}`);
  console.log(`[Config] Model: ${llmConfig.model}`);
  console.log(`[Config] HTTP: http://localhost:${HTTP_PORT}`);
  console.log(`[Config] WS:   ws://localhost:${WS_PORT}`);
  console.log();

  // 1. Load policy engine
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
  console.log();

  // 2. Create action registry
  const registry = new ActionRegistry();
  console.log(`[Actions] ${registry.listActions().length} primitives registered`);
  console.log(`[Actions] ${registry.listActions().join(", ")}`);
  console.log();

  // 3. Create agent loop
  const inboxAppender = async (event: InboxEvent): Promise<void> => {
    const line = `- [${event.timestamp}] ${event.type} | ${event.source}: ${event.detail}\n`;
    try {
      await fs.promises.mkdir(path.dirname(INBOX_PATH), { recursive: true });
      await fs.promises.appendFile(INBOX_PATH, line, "utf-8");
    } catch (err) {
      console.error(`[Inbox] Failed to write: ${err instanceof Error ? err.message : err}`);
    }
  };

  const loop = new AgentLoop(llmConfig, policyEngine, registry, {
    onText: (text) => {
      console.log(`\n[M.A.I.] ${text}\n`);
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

  // 4. Start HTTP file server
  const httpServer = http.createServer((req, res) => {
    // API routes
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

    // Static file serving (SPA fallback to index.html)
    let filePath = path.join(PUBLIC_DIR, req.url === "/" ? "index.html" : (req.url ?? "index.html"));

    // Security: prevent directory traversal
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
    };

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA fallback: serve index.html for any unknown route
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

  // 5. Start WebSocket HUD server
  const hudServer = new HudServer(httpServer, WS_PORT);
  hudServer.wireAgentLoop(loop);

  // 6. Periodic reactor pulse
  setInterval(() => {
    hudServer.broadcast("reactor_pulse", {
      power: 95 + Math.floor(Math.random() * 5),
      status: loop.getState().isRunning ? "active" : "idle",
    });
  }, 5000);

  // 7. Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[M.A.I.] Shutting down...");
    registry.shutdown();
    hudServer.shutdown();
    httpServer.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[M.A.I.] Shutting down (SIGTERM)...");
    registry.shutdown();
    hudServer.shutdown();
    httpServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
