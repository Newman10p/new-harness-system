import { HarnessConfig, ProviderEntryConfig } from "../config";
import { ModelAdapter } from "../harness/ModelAdapter";
import { OllamaAdapter } from "../harness/OllamaAdapter";
import { CloudModelAdapter } from "../harness/CloudModelAdapter";
import { OpenAiAdapter } from "../harness/OpenAiAdapter";
import { AnthropicAdapter } from "../harness/AnthropicAdapter";

export class ProviderRegistry {
  private providers: Map<string, ModelAdapter> = new Map();
  private configs: Map<string, ProviderEntryConfig> = new Map();
  private defaultProvider: string = "";

  constructor(config: HarnessConfig) {
    this.loadFromConfig(config);
  }

  private loadFromConfig(config: HarnessConfig): void {
    const modelSection = config.modelSection;
    if (!modelSection) return;
    this.defaultProvider = modelSection.defaultProvider;
    for (const [name, entry] of Object.entries(modelSection.providers)) {
      if (entry.enabled === false) continue;
      try {
        const adapter = this.createAdapter(entry, config);
        this.providers.set(name, adapter);
        this.configs.set(name, entry);
      } catch (error) {
        console.warn(`[ProviderRegistry] Failed to load '${name}': ${error}`);
      }
    }
  }

  private createAdapter(entry: ProviderEntryConfig, config: HarnessConfig): ModelAdapter {
    switch (entry.type) {
      case "ollamaLocal":
        return new OllamaAdapter({ endpoint: entry.baseUrl ?? "http://localhost:11434", model: entry.model });
      case "ollamaCloud":
        return new CloudModelAdapter({
          provider: "ollama-cloud", endpoint: entry.baseUrl ?? "https://ollama.example.com",
          model: entry.model, creditBudget: config.cloud?.creditBudget ?? 5
        });
      case "openaiStyle": {
        const apiKey = entry.apiKey ?? (entry.apiKeyEnv ? process.env[entry.apiKeyEnv] : undefined);
        if (!apiKey) throw new Error(`API key not found for provider '${entry.model}' (env: ${entry.apiKeyEnv})`);
        return new OpenAiAdapter({ apiKey, model: entry.model, baseUrl: entry.baseUrl });
      }
      case "anthropic": {
        const apiKey = entry.apiKey ?? (entry.apiKeyEnv ? process.env[entry.apiKeyEnv] : undefined);
        if (!apiKey) throw new Error(`API key not found for Anthropic (env: ${entry.apiKeyEnv})`);
        return new AnthropicAdapter({ apiKey, model: entry.model, baseUrl: entry.baseUrl });
      }
      case "mock":
        return new MockAdapter(entry.model);
      default:
        throw new Error(`Unknown provider type: ${(entry as any).type}`);
    }
  }

  getProvider(name: string): ModelAdapter | undefined {
    return this.providers.get(name);
  }

  getDefaultProvider(): ModelAdapter {
    const adapter = this.providers.get(this.defaultProvider);
    if (!adapter) {
      const first = this.providers.values().next().value;
      if (!first) throw new Error("No model providers configured");
      return first;
    }
    return adapter;
  }

  setDefaultProvider(name: string): void {
    if (!this.providers.has(name)) throw new Error(`Provider not found: ${name}`);
    this.defaultProvider = name;
  }

  listProviders(): Array<{ name: string; type: string; model: string; enabled: boolean }> {
    const result: Array<{ name: string; type: string; model: string; enabled: boolean }> = [];
    for (const [name, config] of this.configs) {
      result.push({ name, type: config.type, model: config.model, enabled: config.enabled !== false });
    }
    return result;
  }

  get defaultProviderName(): string {
    return this.defaultProvider;
  }
}

class MockAdapter implements ModelAdapter {
  readonly name = "mock";
  constructor(private modelName: string) {}
  async generate(options: { prompt: string; maxTokens?: number; temperature?: number; stop?: string[] }): Promise<{ text: string; metadata?: Record<string, unknown> }> {
    return { text: `[Mock ${this.modelName}] ${options.prompt.slice(0, 50)}...`, metadata: { provider: "mock" } };
  }
}