import fs from "node:fs";
import path from "node:path";
import { HarnessConfig } from "../config";

export function readEnv(filePath = ".env"): Record<string, string> {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    return {};
  }

  const raw = fs.readFileSync(resolved, "utf8");
  const env: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    env[key] = value;
  }

  return env;
}

export function writeEnv(env: Record<string, string>, filePath = ".env"): void {
  const resolved = path.resolve(process.cwd(), filePath);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(resolved, lines.join("\n") + "\n", "utf8");
}

export function updateEnv(updates: Record<string, string>, filePath = ".env"): void {
  const env = readEnv(filePath);
  Object.assign(env, updates);
  writeEnv(env, filePath);
}

/**
 * Loads API keys from .env into the config object.
 * Merges env vars into the config's openai/anthropic/cloud sections.
 */
export function mergeEnvIntoConfig(config: HarnessConfig): HarnessConfig {
  const env = readEnv();

  // OpenAI
  if (env.OPENAI_API_KEY) {
    config.openai = {
      ...(config.openai ?? {}),
      apiKey: env.OPENAI_API_KEY
    };
  }

  // Anthropic
  if (env.ANTHROPIC_API_KEY) {
    config.anthropic = {
      ...(config.anthropic ?? {}),
      apiKey: env.ANTHROPIC_API_KEY
    };
  }

  // Picovoice (wake word)
  if (env.PICOVOICE_ACCESS_KEY && config.audio?.wakeWord) {
    config.audio.wakeWord.accessKey = env.PICOVOICE_ACCESS_KEY;
  }

  // Ollama cloud auth
  if (env.OLLAMA_CLOUD_API_KEY && config.cloud) {
    config.cloud = {
      ...config.cloud,
      endpoint: config.cloud.endpoint?.replace("https://", `https://${env.OLLAMA_CLOUD_API_KEY}@`)
    };
  }

  return config;
}