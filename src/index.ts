// ─── M.A.I. CLI Entry Point ─────────────────────────────────────────────────
// Terminal-based REPL interface for interacting with the agent.
// Supports slash commands: /quit, /clear, /history, /policy, /help, /providers, /audit

import dotenv from "dotenv";
dotenv.config();

import * as readline from "node:readline";
import { AgentLoop } from "./core/AgentLoop.js";
import { PolicyEngine } from "./security/PolicyEngine.js";
import { ActionRegistry } from "./actions/index.js";
import { INBOX_PATH } from "./core/constants.js";
import { initAuditLog, readAuditLog } from "./core/AuditLogger.js";
import fs from "node:fs";
import path from "node:path";
import type { LLMConfig, InboxEvent, AuditEntry } from "./types/index.js";

const llmConfig: LLMConfig = {
  baseURL: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
  apiKey: process.env.LLM_API_KEY ?? "ollama",
  model: process.env.LLM_MODEL ?? "llama3.2",
  provider: process.env.LLM_PROVIDER ?? "ollama",
};

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   M.A.I. — Multiple Array Intelligence      ║");
  console.log("║   CLI Mode (type /help for commands)         ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log();

  const audit = await initAuditLog();

  const policyEngine = await PolicyEngine.load();
  const registry = new ActionRegistry();

  const inboxAppender = async (event: InboxEvent): Promise<void> => {
    const line = `- [${event.timestamp}] ${event.type} | ${event.source}: ${event.detail}\n`;
    try {
      await fs.promises.mkdir(path.dirname(INBOX_PATH), { recursive: true });
      await fs.promises.appendFile(INBOX_PATH, line, "utf-8");
    } catch {
      // Non-fatal
    }
  };

  const loop = new AgentLoop(llmConfig, policyEngine, registry, {
    onText: (text) => {
      console.log(`\n🤖 M.A.I.: ${text}\n`);
    },
    onToken: (token) => {
      process.stdout.write(token);
    },
    onActionStart: (action) => {
      console.log(`  ▶ [${action.action}]`);
    },
    onActionResult: (_action, result) => {
      const status = result.ok ? "✓" : "✗";
      const preview = result.ok
        ? String(result.data ?? "").slice(0, 150)
        : result.error ?? "unknown error";
      console.log(`  ${status} ${preview}`);
    },
    onPolicyViolation: (action, reason) => {
      console.log(`  🚫 BLOCKED [${action.action}]: ${reason}`);
    },
    onApprovalRequired: (action) => {
      console.log(`  ⏳ Approval needed: ${action.action}`);
      console.log(`  Auto-approving in CLI mode...`);
      setTimeout(() => loop.resolveApproval(true), 100);
    },
    onError: (error) => {
      console.error(`  ❌ ${error}`);
    },
  });

  loop.setInboxAppender(inboxAppender);
  loop.setAudit(audit);

  const providerInfo = loop.getProviderInfo();
  console.log(`[LLM] ${providerInfo.count} provider(s): ${providerInfo.names.join(", ")}`);
  console.log();

  // REPL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "M.A.I. > ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input.startsWith("/")) {
      const cmd = input.toLowerCase();

      switch (cmd) {
        case "/quit":
        case "/exit":
          console.log("Shutting down...");
          registry.shutdown();
          process.exit(0);

        case "/clear":
          loop.clearHistory();
          console.log("Conversation history cleared.");
          break;

        case "/history": {
          const state = loop.getState();
          console.log(`[History] ${state.messages.length} messages, ${state.loopCount} loops`);
          break;
        }

        case "/policy": {
          const config = policyEngine.getConfig();
          console.log("\n── Current Policy ──");
          console.log(`deny_commands: ${JSON.stringify(config.deny_commands, null, 2)}`);
          console.log(`allow_network: ${JSON.stringify(config.allow_network, null, 2)}`);
          console.log(`require_approval: ${JSON.stringify(config.require_approval, null, 2)}`);
          console.log();
          break;
        }

        case "/actions":
          console.log(`Registered actions: ${registry.listActions().join(", ")}`);
          break;

        case "/providers": {
          const info = loop.getProviderInfo();
          console.log(`Providers (${info.count}): ${info.names.join(", ")}`);
          break;
        }

        case "/audit": {
          const log = await readAuditLog(20);
          console.log("\n── Recent Audit Log ──");
          console.log(log);
          console.log();
          break;
        }

        case "/state": {
          const st = loop.getState();
          console.log(`Running: ${st.isRunning} | Loops: ${st.loopCount} | Messages: ${st.messages.length} | Pending: ${st.pendingApproval !== null}`);
          break;
        }

        case "/help":
          console.log(`
  M.A.I. Commands:
    /help       Show this help message
    /quit       Exit the CLI
    /clear      Clear conversation history
    /history    Show message/loop count
    /policy     Display current policy config
    /actions    List registered actions
    /providers  Show configured LLM providers
    /audit      Show recent audit log (last 20 entries)
    /state      Show detailed agent state

  Or just type a message to chat with M.A.I.
          `);
          break;

        default:
          console.log(`Unknown command: ${cmd}. Type /help for commands.`);
      }

      rl.prompt();
      return;
    }

    // Regular message
    await loop.processUserMessage(input);
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye.");
    registry.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
