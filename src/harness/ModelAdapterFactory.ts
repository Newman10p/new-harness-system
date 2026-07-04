import { HarnessConfig } from "../config";
import { OllamaAdapter } from "./OllamaAdapter";
import { CloudModelAdapter } from "./CloudModelAdapter";
import { ModelAdapter } from "./ModelAdapter";

export function createModelAdapter(config: HarnessConfig): ModelAdapter {
  const provider = config.modelProvider ?? config.cloud?.provider ?? "ollama";
  const preferred = provider === "cloud" || provider === "ollama-cloud";

  if (preferred && config.cloud?.endpoint) {
    return new CloudModelAdapter({
      provider: "ollama-cloud",
      endpoint: config.cloud.endpoint,
      model: config.cloud?.model ?? "llama3.2"
    });
  }

  return new OllamaAdapter(config.ollama);
}
