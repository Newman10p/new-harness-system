import test from "node:test";
import assert from "node:assert/strict";
import { createModelAdapter } from "./ModelAdapterFactory";
import { HarnessConfig } from "../config";

test("createModelAdapter prefers ollama-cloud when configured", () => {
  const config: HarnessConfig = {
    model: "cloud",
    modelProvider: "cloud",
    ollama: { endpoint: "http://127.0.0.1:11434", model: "llama3.2" },
    cloud: { provider: "ollama-cloud", endpoint: "https://ollama.example.com", model: "llama3.2" },
    skillsPath: "./skills"
  } as HarnessConfig;

  const adapter = createModelAdapter(config);
  assert.equal(adapter.name, "cloud");
});
