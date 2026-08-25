import { loadConfig } from "./config";
import { mergeEnvIntoConfig } from "./config/env";
import { loadAudioAdapters } from "./audio/audioLoader";
import { createPrioritizedModelAdapter } from "./harness/ModelAdapterFactory";
import { startWakeWordListener } from "./audio/wakeWord";
import { printBanner } from "./ui/banner";
import { spawn } from "node:child_process";
import { Orchestrator } from "./core/orchestrator";
import { UIGateway } from "./ui/gateway";
import { getSandboxManager } from "./sandbox2/SandboxManager";
import { getDeviceControlManager } from "./sandbox2/DeviceControlManager";
import type { HarnessConfig } from "./config";

async function main(): Promise<void> {
  const config = loadConfig();
  // Merge API keys from .env into config
  mergeEnvIntoConfig(config);

  printBanner(config.assistantName ?? "Jarvis");
  const audio = loadAudioAdapters(config);

  // Initialize the prioritized model adapter chain
  const modelAdapter = createPrioritizedModelAdapter(config);
  console.log(`Model provider chain: ${modelAdapter.name}`);

  if (config.audio?.stt?.enabled && config.audio?.tts?.enabled) {
    console.log("Audio adapters initialized.");
  }

  // ─── Initialize Sandbox System ────────────────────────────────────
  if (config.sandbox?.enabled !== false) {
    try {
      const sandboxManager = getSandboxManager(config.sandbox?.basePath);
      await sandboxManager.initialize();
      const stats = sandboxManager.getStats();
      console.log(
        `[Sandbox] Ready. Tiers: [${stats.availableTiers.join(", ")}] ` +
        `Docker: ${stats.dockerAvailable} Firejail: ${stats.firejailAvailable}`
      );
    } catch (err) {
      console.warn("[Sandbox] Initialization failed:", err instanceof Error ? err.message : err);
    }
  } else {
    console.log("[Sandbox] Disabled by configuration.");
  }

  // ─── Initialize Device Control System ────────────────────────────
  if (config.deviceControl?.enabled !== false) {
    try {
      const deviceManager = getDeviceControlManager({
        enabled: true,
        autoDiscover: config.deviceControl?.autoDiscover ?? true,
        scanIntervalMs: config.deviceControl?.scanIntervalMs ?? 0,
        homeAssistantUrl: config.deviceControl?.homeAssistantUrl,
        homeAssistantToken: config.deviceControl?.homeAssistantToken,
        mqttBrokerUrl: config.deviceControl?.mqttBrokerUrl,
        mqttUsername: config.deviceControl?.mqttUsername,
        mqttPassword: config.deviceControl?.mqttPassword,
        sshHosts: config.deviceControl?.sshHosts,
      });
      await deviceManager.initialize();
      const devStats = deviceManager.getStats();
      console.log(
        `[DeviceControl] Ready. ${devStats.totalDevices} devices across ` +
        `${devStats.adaptersCount} adapters. Protocols: [${devStats.protocols.join(", ")}]`
      );
    } catch (err) {
      console.warn("[DeviceControl] Initialization failed:", err instanceof Error ? err.message : err);
    }
  } else {
    console.log("[DeviceControl] Disabled by configuration.");
  }

  // Initialize orchestrator for gateway
  const orchestrator = new Orchestrator(config);

  // Start UI Gateway if enabled
  if (config.gateway?.enabled !== false) {
    const gateway = new UIGateway(config, orchestrator);
    const port = config.gateway?.port ?? 3096;
    await gateway.start({ port });
    console.log(`\n🌐 UI Gateway available at: http://localhost:${port}`);
    console.log("   Access the web console to chat, switch providers, and monitor status.\n");
  }

  try {
    await startWakeWordListener(() => {
      console.log("Wake word detected. Launching listen flow...");
      if (process.platform === "win32") {
        spawn("cmd.exe", ["/c", "npm run cli -- listen"], {
          cwd: process.cwd(),
          stdio: "inherit"
        });
      } else {
        spawn("npm", ["run", "cli", "--", "listen"], {
          cwd: process.cwd(),
          stdio: "inherit"
        });
      }
    });
  } catch (error) {
    console.error("Wake word listener error:", error);
    console.log("Continuing without wake word detection.");
  }

  // ─── Graceful Shutdown ─────────────────────────────────────────────
  const shutdown = async () => {
    console.log("\n[MAI] Shutting down...");
    try { getSandboxManager().shutdown(); } catch {}
    try { getDeviceControlManager().shutdown(); } catch {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
