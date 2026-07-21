import { loadConfig } from "./config";
import { mergeEnvIntoConfig } from "./config/env";
import { loadAudioAdapters } from "./audio/audioLoader";
import { createPrioritizedModelAdapter } from "./harness/ModelAdapterFactory";
import { startWakeWordListener } from "./audio/wakeWord";
import { printBanner } from "./ui/banner";
import { spawn } from "node:child_process";
import { Orchestrator } from "./core/orchestrator";
import { UIGateway } from "./ui/gateway";

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
}

main().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
