import inquirer from "inquirer";
import { HarnessConfig, ModelProvider } from "../../config";
import chalk from "chalk";
import { updateEnv } from "../../config/env";

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
    },
    {
      type: "list",
      name: "primaryProvider",
      message: "Select your primary AI provider:",
      choices: [
        { name: "Ollama Cloud (cloud-first, falls back to local)", value: "ollama-cloud" },
        { name: "Ollama (local only)", value: "ollama" },
        { name: "OpenAI (requires API key)", value: "openai" },
        { name: "Anthropic (requires API key)", value: "anthropic" }
      ],
      default: existing.modelProvider ?? "ollama-cloud"
    }
  ]);

  const config: Partial<HarnessConfig> = {
    assistantName: answers.assistantName,
    modelProvider: answers.primaryProvider as ModelProvider,
    audio: {
      stt: { enabled: answers.mode === "text+voice", backend: "whisper" },
      tts: { enabled: answers.mode === "text+voice", backend: "http" }
    }
  };

  // Set provider-specific defaults and collect API keys
  switch (answers.primaryProvider) {
    case "ollama-cloud":
      config.cloud = {
        provider: "ollama-cloud",
        endpoint: "https://ollama.example.com",
        model: "llama3.2",
        creditBudget: 5
      };
      config.ollama = {
        endpoint: "http://127.0.0.1:11434",
        model: "llama3.2"
      };
      break;
    case "ollama":
      config.ollama = {
        endpoint: "http://127.0.0.1:11434",
        model: "llama3.2"
      };
      break;
    case "openai": {
      console.log(chalk.yellow("\nNote: You can also configure your API key later using: jarvis init → Configure API keys\n"));
      const openAiKey = await inquirer.prompt([
        {
          type: "password",
          name: "apiKey",
          message: "Enter your OpenAI API key (or press Enter to skip):",
          mask: "*",
          validate: (input: string) => {
            if (input.trim().length > 0 && input.trim().length < 10) return "API key must be at least 10 characters";
            return true;
          }
        }
      ]);
      
      if (openAiKey.apiKey && openAiKey.apiKey.trim().length > 0) {
        config.openai = {
          apiKey: openAiKey.apiKey,
          model: "gpt-4o-mini",
          baseUrl: "https://api.openai.com/v1",
          creditBudget: 10
        };
        // Save to .env file
        updateEnv({ OPENAI_API_KEY: openAiKey.apiKey }, ".env");
        console.log(chalk.green("✓ OpenAI API key saved to .env\n"));
      } else {
        console.log(chalk.yellow("⚠ OpenAI selected but no API key provided. You can add it later with: jarvis init\n"));
        config.openai = {
          model: "gpt-4o-mini",
          baseUrl: "https://api.openai.com/v1",
          creditBudget: 10
        };
      }
      break;
    }
    case "anthropic": {
      console.log(chalk.yellow("\nNote: You can also configure your API key later using: jarvis init → Configure API keys\n"));
      const anthropicKey = await inquirer.prompt([
        {
          type: "password",
          name: "apiKey",
          message: "Enter your Anthropic API key (or press Enter to skip):",
          mask: "*",
          validate: (input: string) => {
            if (input.trim().length > 0 && input.trim().length < 10) return "API key must be at least 10 characters";
            return true;
          }
        }
      ]);
      
      if (anthropicKey.apiKey && anthropicKey.apiKey.trim().length > 0) {
        config.anthropic = {
          apiKey: anthropicKey.apiKey,
          model: "claude-3-haiku-20240307",
          baseUrl: "https://api.anthropic.com/v1",
          creditBudget: 10
        };
        // Save to .env file
        updateEnv({ ANTHROPIC_API_KEY: anthropicKey.apiKey }, ".env");
        console.log(chalk.green("✓ Anthropic API key saved to .env\n"));
      } else {
        console.log(chalk.yellow("⚠ Anthropic selected but no API key provided. You can add it later with: jarvis init\n"));
        config.anthropic = {
          model: "claude-3-haiku-20240307",
          baseUrl: "https://api.anthropic.com/v1",
          creditBudget: 10
        };
      }
      break;
    }
  }

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