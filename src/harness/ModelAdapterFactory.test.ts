import test from "node:test";
import assert from "node:assert/strict";
import { createModelAdapter, createPrioritizedModelAdapter } from "./ModelAdapterFactory";
import { HarnessConfig } from "../config";

const baseConfig: HarnessConfig = {
  model: "llama3.2",
  assistantName: "Jarvis",
  modelProvider: "ollama-cloud",
  providerPriority: ["ollama-cloud", "ollama", "openai", "anthropic"],
  ollama: { endpoint: "http://127.0.0.1:11434", model: "llama3.2" },
  cloud: { provider: "ollama-cloud", endpoint: "https://ollama.example.com", model: "llama3.2", creditBudget: 5 },
  openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
  anthropic: { model: "claude-3-haiku-20240307", baseUrl: "https://api.anthropic.com/v1" },
  audio: {
    stt: { enabled: false, backend: "whisper" },
    tts: { enabled: false, backend: "http" }
  },
  vaultPath: "./vault",
  skillsPath: "./skills",
  permissions: { allowSandboxedSkills: true, allowedExternalCommands: [] }
};

test("createModelAdapter prefers ollama-cloud when configured", () => {
  const config = { ...baseConfig, modelProvider: "ollama-cloud" as const };
  const adapter = createModelAdapter(config);
  assert.equal(adapter.name, "cloud");
});

test("createModelAdapter creates ollama adapter when ollama provider selected", () => {
  const config = { ...baseConfig, modelProvider: "ollama" as const };
  const adapter = createModelAdapter(config);
  assert.equal(adapter.name, "ollama");
});

test("createPrioritizedModelAdapter returns prioritized adapter", () => {
  const config = { ...baseConfig };
  const adapter = createPrioritizedModelAdapter(config);
  assert.equal(adapter.name, "prioritized");
});

test("createPrioritizedModelAdapter falls back to ollama with no cloud config", () => {
  const config = {
    ...baseConfig,
    providerPriority: ["ollama-cloud" as const],
    cloud: undefined
  };
  const adapter = createPrioritizedModelAdapter(config);
  // Should fall back to ollama since cloud has no endpoint
  assert.equal(adapter.name, "ollama");
});