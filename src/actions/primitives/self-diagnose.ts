// ─── self-diagnose ────────────────────────────────────────────────────────
// Runs health checks on all M.A.I. subsystems: LLM connectivity, file system,
// WebSocket, memory files, policy engine, disk space, and network.
// Returns a structured health report and emits threat_level if degraded.

import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const execAsync = promisify(exec);
const ROOT = process.cwd();

interface SubsystemCheck {
  name: string;
  status: "pass" | "fail" | "degraded" | "skip";
  detail: string;
  latency_ms?: number;
}

interface DiagnosisResult {
  timestamp: string;
  overall: "healthy" | "degraded" | "critical";
  subsystems: SubsystemCheck[];
  summary: string;
}

async function checkLLMConnectivity(): Promise<SubsystemCheck> {
  try {
    const start = Date.now();
    const configPath = path.join(ROOT, "harness.config.json");
    let baseURL = "";

    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(raw);
      baseURL = config?.llm?.baseURL || config?.baseURL || "";
    } catch {
      // No config file — try environment
      baseURL = process.env.OPENAI_BASE_URL || process.env.OLLAMA_BASE_URL || "";
    }

    if (!baseURL) {
      return { name: "llm_connectivity", status: "skip", detail: "No LLM endpoint configured" };
    }

    // Try a simple TCP connection
    const url = new URL(baseURL);
    const host = url.hostname;
    const port = url.port || (url.protocol === "https:" ? "443" : "80");

    // Use curl to check reachability (faster than a full API call)
    await execAsync(`curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 ${baseURL.replace(/\/$/, "")}/models`, {
      timeout: 10_000,
    });

    const latency = Date.now() - start;
    return {
      name: "llm_connectivity",
      status: "pass",
      detail: `LLM endpoint reachable at ${host}:${port}`,
      latency_ms: latency,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name: "llm_connectivity", status: "fail", detail: `LLM unreachable: ${message}` };
  }
}

async function checkFileSystem(): Promise<SubsystemCheck> {
  try {
    const start = Date.now();
    const testFile = path.join(ROOT, "state", ".health-check");
    await fs.writeFile(testFile, "ok", "utf-8");
    const read = await fs.readFile(testFile, "utf-8");
    await fs.unlink(testFile);
    const latency = Date.now() - start;

    if (read !== "ok") {
      return { name: "file_system", status: "fail", detail: "Read/write mismatch" };
    }
    return {
      name: "file_system",
      status: "pass",
      detail: "Read/write to project root works",
      latency_ms: latency,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name: "file_system", status: "fail", detail: `File system error: ${message}` };
  }
}

async function checkWebSocket(): Promise<SubsystemCheck> {
  try {
    const start = Date.now();
    // Check if HUD server port is listening (default 3700)
    const port = process.env.HUD_PORT || "3700";
    const { stdout } = await execAsync(
      `lsof -i :${port} -sTCP:LISTEN 2>/dev/null | wc -l`,
      { timeout: 5_000 }
    );
    const latency = Date.now() - start;
    const listeners = parseInt(stdout.trim(), 10);

    if (listeners > 0) {
      return {
        name: "websocket",
        status: "pass",
        detail: `HUD server listening on port ${port}`,
        latency_ms: latency,
      };
    }
    return {
      name: "websocket",
      status: "degraded",
      detail: `No listener on port ${port} — HUD server may not be running`,
      latency_ms: latency,
    };
  } catch {
    return {
      name: "websocket",
      status: "skip",
      detail: "Could not check WebSocket port (lsof unavailable?)",
    };
  }
}

async function checkMemoryFiles(): Promise<SubsystemCheck> {
  const files = [
    "memory/context.md",
    "state/inbox.md",
    "agent/identity.md",
    "agent/policy.md",
  ];

  const results: string[] = [];
  let allGood = true;

  for (const rel of files) {
    const full = path.join(ROOT, rel);
    try {
      const content = await fs.readFile(full, "utf-8");
      if (!content.trim()) {
        results.push(`${rel}: empty`);
        allGood = false;
      } else {
        results.push(`${rel}: ok (${content.length} chars)`);
      }
    } catch {
      results.push(`${rel}: missing`);
      allGood = false;
    }
  }

  return {
    name: "memory_files",
    status: allGood ? "pass" : "degraded",
    detail: results.join("; "),
  };
}

async function checkPolicyEngine(): Promise<SubsystemCheck> {
  try {
    const policyPath = path.join(ROOT, "agent", "policy.md");
    const content = await fs.readFile(policyPath, "utf-8");
    const hasDeny = content.includes("deny_commands") || content.includes("deny");
    const hasAllow = content.includes("allow") || content.includes("require_approval");

    if (content.trim().length < 10) {
      return { name: "policy_engine", status: "degraded", detail: "Policy file exists but is nearly empty" };
    }

    return {
      name: "policy_engine",
      status: "pass",
      detail: `Policy loaded (${content.length} chars, deny=${hasDeny}, approval=${hasAllow})`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name: "policy_engine", status: "fail", detail: `Cannot load policy: ${message}` };
  }
}

async function checkDiskSpace(): Promise<SubsystemCheck> {
  try {
    const { stdout } = await execAsync("df -k --output=avail,target . 2>/dev/null | tail -1", {
      timeout: 5_000,
    });
    const availKb = parseInt(stdout.trim(), 10);
    const availMb = Math.round(availKb / 1024);

    if (availMb < 50) {
      return { name: "disk_space", status: "fail", detail: `Only ${availMb}MB available — critically low` };
    }
    if (availMb < 500) {
      return { name: "disk_space", status: "degraded", detail: `${availMb}MB available — getting low` };
    }
    return { name: "disk_space", status: "pass", detail: `${availMb}MB available` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name: "disk_space", status: "skip", detail: `Could not check disk: ${message}` };
  }
}

async function checkNetwork(): Promise<SubsystemCheck> {
  try {
    const start = Date.now();
    await execAsync("curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 https://api.openai.com 2>/dev/null", {
      timeout: 5_000,
    });
    const latency = Date.now() - start;
    return {
      name: "network",
      status: "pass",
      detail: "Network connectivity confirmed",
      latency_ms: latency,
    };
  } catch {
    return { name: "network", status: "fail", detail: "Cannot reach external endpoints" };
  }
}

export async function selfDiagnose(
  _action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const start = Date.now();

  try {
    const subsystems = await Promise.all([
      checkLLMConnectivity(),
      checkFileSystem(),
      checkWebSocket(),
      checkMemoryFiles(),
      checkPolicyEngine(),
      checkDiskSpace(),
      checkNetwork(),
    ]);

    const failCount = subsystems.filter((s) => s.status === "fail").length;
    const degradedCount = subsystems.filter((s) => s.status === "degraded").length;

    let overall: "healthy" | "degraded" | "critical";
    if (failCount >= 2) {
      overall = "critical";
    } else if (failCount >= 1 || degradedCount >= 2) {
      overall = "degraded";
    } else {
      overall = "healthy";
    }

    const totalMs = Date.now() - start;
    const summary = [
      `Diagnosis complete in ${totalMs}ms`,
      `Overall: ${overall.toUpperCase()}`,
      `Pass: ${subsystems.filter((s) => s.status === "pass").length}, ` +
        `Degraded: ${degradedCount}, Fail: ${failCount}, Skip: ${subsystems.filter((s) => s.status === "skip").length}`,
    ].join(". ");

    // Emit threat level based on health
    if (overall === "critical") {
      ctx.emitHud("threat_level", { level: "red", detail: "Critical subsystem failures detected" });
    } else if (overall === "degraded") {
      ctx.emitHud("threat_level", { level: "yellow", detail: "Some subsystems degraded" });
    }

    const result: DiagnosisResult = {
      timestamp: new Date().toISOString(),
      overall,
      subsystems,
      summary,
    };

    await ctx.audit({
      type: "action_executed",
      action: "self-diagnose",
      detail: `Diagnosis: ${overall}, pass=${subsystems.filter((s) => s.status === "pass").length}, fail=${failCount}`,
      ok: overall !== "critical",
    });

    return { ok: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Self-diagnose failed: ${message}` };
  }
}
