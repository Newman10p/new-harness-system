import { HarnessConfig, ModelProvider } from "../config";
import { OllamaAdapter } from "./OllamaAdapter";
import { CloudModelAdapter, CreditExhaustedError } from "./CloudModelAdapter";
import { OpenAiAdapter } from "./OpenAiAdapter";
import { AnthropicAdapter } from "./AnthropicAdapter";
import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";

/**
 * Creates a single ModelAdapter based on the configured provider.
 * Used for direct provider selection.
 */
export function createModelAdapter(config: HarnessConfig): ModelAdapter {
  const provider = config.modelProvider ?? "ollama-cloud";
  return createAdapterForProvider(provider, config);
}

/**
 * Creates a prioritized chain of adapters that tries providers in order,
 * falling back to the next when credits are exhausted or the provider fails.
 */
export function createPrioritizedModelAdapter(config: HarnessConfig): ModelAdapter {
  const priority = config.providerPriority ?? ["ollama-cloud", "ollama", "openai", "anthropic"];
  const adapters = priority
    .map((provider) => {
      try {
        return createAdapterForProvider(provider, config);
      } catch {
        return null;
      }
    })
    .filter((a): a is ModelAdapter => a !== null);

  if (adapters.length === 0) {
    // Ultimate fallback: local Ollama
    return new OllamaAdapter(config.ollama);
  }

  return new PrioritizedModelAdapter(adapters);
}

/**
 * Wraps multiple adapters in a priority chain.
 * Tries the first adapter; if it throws CreditExhaustedError or fails,
 * falls through to the next adapter in the chain.
 */
class PrioritizedModelAdapter implements ModelAdapter {
  readonly name = "prioritized";

  constructor(private adapters: ModelAdapter[]) {}

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const errors: Array<{ provider: string; error: string }> = [];

    for (const adapter of this.adapters) {
      try {
        const result = await adapter.generate(options);
        // Annotate with which provider actually served the request
        return {
          ...result,
          metadata: {
            ...(result.metadata ?? {}),
            servingProvider: adapter.name,
            fallbackChain: errors.map((e) => `${e.provider}: ${e.error}`)
          }
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ provider: adapter.name, error: errorMsg });

        // If it's NOT a credit/fallback error, rethrow immediately
        if (!(error instanceof CreditExhaustedError) && adapter.name !== "ollama") {
          // For non-credit errors on non-ollama providers, log and continue
          console.warn(`[${adapter.name}] Provider failed, trying next: ${errorMsg}`);
        }

        // If this was the last adapter, throw with full context
        if (adapter === this.adapters[this.adapters.length - 1]) {
          throw new Error(
            `All providers exhausted:\n${errors.map((e) => `  - ${e.provider}: ${e.error}`).join("\n")}`
          );
        }
      }
    }

    throw new Error("No adapters available in priority chain");
  }
}

function createAdapterForProvider(provider: ModelProvider, config: HarnessConfig): ModelAdapter {
  switch (provider) {
    case "ollama":
      return new OllamaAdapter(config.ollama);

    case "ollama-cloud": {
      if (!config.cloud?.endpoint) {
        throw new Error("Ollama cloud endpoint not configured");
      }
      return new CloudModelAdapter({
        provider: "ollama-cloud",
        endpoint: config.cloud.endpoint,
        model: config.cloud?.model ?? "llama3.2",
        creditBudget: config.cloud?.creditBudget ?? 5
      });
    }

    case "openai": {
      if (!config.openai?.apiKey) {
        throw new Error("OpenAI API key not configured (set OPENAI_API_KEY in .env)");
      }
      return new OpenAiAdapter({
        apiKey: config.openai.apiKey,
        model: config.openai?.model ?? "gpt-4o-mini",
        baseUrl: config.openai?.baseUrl
      });
    }

    case "anthropic": {
      if (!config.anthropic?.apiKey) {
        throw new Error("Anthropic API key not configured (set ANTHROPIC_API_KEY in .env)");
      }
      return new AnthropicAdapter({
        apiKey: config.anthropic.apiKey,
        model: config.anthropic?.model ?? "claude-3-haiku-20240307",
        baseUrl: config.anthropic?.baseUrl
      });
    }

    default:
      throw new Error(`Unknown model provider: ${provider}`);
  }
}