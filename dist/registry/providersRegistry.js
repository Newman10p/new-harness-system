"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRegistry = void 0;
const OllamaAdapter_1 = require("../harness/OllamaAdapter");
const CloudModelAdapter_1 = require("../harness/CloudModelAdapter");
const OpenAiAdapter_1 = require("../harness/OpenAiAdapter");
const AnthropicAdapter_1 = require("../harness/AnthropicAdapter");
class ProviderRegistry {
    providers = new Map();
    configs = new Map();
    defaultProvider = "";
    constructor(config) {
        this.loadFromConfig(config);
    }
    loadFromConfig(config) {
        const modelSection = config.modelSection;
        if (!modelSection)
            return;
        this.defaultProvider = modelSection.defaultProvider;
        for (const [name, entry] of Object.entries(modelSection.providers)) {
            if (entry.enabled === false)
                continue;
            try {
                const adapter = this.createAdapter(entry, config);
                this.providers.set(name, adapter);
                this.configs.set(name, entry);
            }
            catch (error) {
                console.warn(`[ProviderRegistry] Failed to load '${name}': ${error}`);
            }
        }
    }
    createAdapter(entry, config) {
        switch (entry.type) {
            case "ollamaLocal":
                return new OllamaAdapter_1.OllamaAdapter({ endpoint: entry.baseUrl ?? "http://localhost:11434", model: entry.model });
            case "ollamaCloud":
                return new CloudModelAdapter_1.CloudModelAdapter({
                    provider: "ollama-cloud", endpoint: entry.baseUrl ?? "https://ollama.example.com",
                    model: entry.model, creditBudget: config.cloud?.creditBudget ?? 5
                });
            case "openaiStyle": {
                const apiKey = entry.apiKey ?? (entry.apiKeyEnv ? process.env[entry.apiKeyEnv] : undefined);
                if (!apiKey)
                    throw new Error(`API key not found for provider '${entry.model}' (env: ${entry.apiKeyEnv})`);
                return new OpenAiAdapter_1.OpenAiAdapter({ apiKey, model: entry.model, baseUrl: entry.baseUrl });
            }
            case "anthropic": {
                const apiKey = entry.apiKey ?? (entry.apiKeyEnv ? process.env[entry.apiKeyEnv] : undefined);
                if (!apiKey)
                    throw new Error(`API key not found for Anthropic (env: ${entry.apiKeyEnv})`);
                return new AnthropicAdapter_1.AnthropicAdapter({ apiKey, model: entry.model, baseUrl: entry.baseUrl });
            }
            case "mock":
                return new MockAdapter(entry.model);
            default:
                throw new Error(`Unknown provider type: ${entry.type}`);
        }
    }
    getProvider(name) {
        return this.providers.get(name);
    }
    getDefaultProvider() {
        const adapter = this.providers.get(this.defaultProvider);
        if (!adapter) {
            const first = this.providers.values().next().value;
            if (!first)
                throw new Error("No model providers configured");
            return first;
        }
        return adapter;
    }
    setDefaultProvider(name) {
        if (!this.providers.has(name))
            throw new Error(`Provider not found: ${name}`);
        this.defaultProvider = name;
    }
    listProviders() {
        const result = [];
        for (const [name, config] of this.configs) {
            result.push({ name, type: config.type, model: config.model, enabled: config.enabled !== false });
        }
        return result;
    }
    get defaultProviderName() {
        return this.defaultProvider;
    }
}
exports.ProviderRegistry = ProviderRegistry;
class MockAdapter {
    modelName;
    name = "mock";
    constructor(modelName) {
        this.modelName = modelName;
    }
    async generate(options) {
        return { text: `[Mock ${this.modelName}] ${options.prompt.slice(0, 50)}...`, metadata: { provider: "mock" } };
    }
}
//# sourceMappingURL=providersRegistry.js.map