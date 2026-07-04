import { loadConfig } from "./config";
import { loadAudioAdapters } from "./audio/audioLoader";
import { startWakeWordListener } from "./audio/wakeWord";
import { printBanner } from "./ui/banner";
import { spawn } from "node:child_process";

async function main(): Promise<void> {
  const config = loadConfig();
  printBanner(config.assistantName ?? "Jarvis");
  const audio = loadAudioAdapters(config);

  if (config.audio?.stt?.enabled && config.audio?.tts?.enabled) {
    console.log("Audio adapters initialized.");
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
