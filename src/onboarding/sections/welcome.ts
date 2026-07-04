import inquirer from "inquirer";
import { HarnessConfig } from "../../config";
import chalk from "chalk";

export async function onboardWelcome(existing: Partial<HarnessConfig>): Promise<Partial<HarnessConfig>> {
  console.log(chalk.cyan("\n=== Welcome to Jarvis Harness ===\n"));
  console.log(chalk.gray("Let's set up your personal AI operator.\n"));

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "assistantName",
      message: "What would you like to name your assistant?",
      default: existing.assistantName ?? "Jarvis",
      validate: (input: string) => input.trim().length > 0 || "Name cannot be empty"
    },
    {
      type: "list",
      name: "mode",
      message: "Select your preferred mode:",
      choices: [
        { name: "Text only", value: "text-only" },
        { name: "Text + Voice (STT/TTS)", value: "text+voice" }
      ],
      default: existing.audio?.stt?.enabled ? "text+voice" : "text-only"
    }
  ]);

  const config: Partial<HarnessConfig> = {
    assistantName: answers.assistantName,
    audio: {
      stt: { enabled: answers.mode === "text+voice", backend: "whisper" },
      tts: { enabled: answers.mode === "text+voice", backend: "http" }
    }
  };

  return config;
}

export async function onboardAudio(existing: Partial<HarnessConfig>, enableAudio: boolean): Promise<Partial<HarnessConfig>> {
  if (!enableAudio) {
    return { audio: { stt: { enabled: false, backend: "whisper" }, tts: { enabled: false, backend: "http" } } };
  }

  console.log(chalk.cyan("\n=== Audio Setup ===\n"));

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "sttBackend",
      message: "Speech-to-Text backend:",
      choices: [
        { name: "Whisper (local)", value: "whisper" },
        { name: "Skip STT", value: "skip" }
      ],
      default: existing.audio?.stt?.backend ?? "whisper"
    },
    {
      type: "list",
      name: "ttsBackend",
      message: "Text-to-Speech backend:",
      choices: [
        { name: "HTTP endpoint", value: "http" },
        { name: "Skip TTS", value: "skip" }
      ],
      default: existing.audio?.tts?.backend ?? "http"
    }
  ]);

  const updates: Partial<HarnessConfig> = {
    audio: {
      stt: {
        enabled: answers.sttBackend !== "skip",
        backend: answers.sttBackend === "skip" ? "whisper" : answers.sttBackend,
        modelPath: "base"
      },
      tts: {
        enabled: answers.ttsBackend !== "skip",
        backend: answers.ttsBackend === "skip" ? "http" : answers.ttsBackend
      }
    }
  };

  if (answers.ttsBackend === "http") {
    const ttsEndpoint = await inquirer.prompt([
      {
        type: "input",
        name: "endpoint",
        message: "TTS HTTP endpoint URL:",
        default: existing.audio?.tts?.endpoint ?? "http://localhost:5002/api/tts",
        validate: (input: string) => {
          try {
            new URL(input);
            return true;
          } catch {
            return "Please enter a valid URL";
          }
        }
      }
    ]);
    if (updates.audio?.tts) {
      updates.audio.tts.endpoint = ttsEndpoint.endpoint;
    }
  }

  return updates;
}
