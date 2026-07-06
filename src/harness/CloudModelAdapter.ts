import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";

export interface CloudModelAdapterConfig {
  provider: "ollama-cloud";
  endpoint: string;
  model: string;
  maxRetries?: number;
  creditBudget?: number; // max credits to spend per session
}

export class CloudModelAdapter implements ModelAdapter {
  readonly name = "cloud";

  private config: CloudModelAdapterConfig;
  private creditsUsed = 0;

  constructor(config: CloudModelAdapterConfig) {
    this.config = {
      ...config,
      maxRetries: config.maxRetries ?? 2,
      creditBudget: config.creditBudget ?? 100 // default budget
    };
  }

  get remainingCredits(): number {
    return Math.max(0, (this.config.creditBudget ?? 100) - this.creditsUsed);
  }

  get hasCredits(): boolean {
    return this.remainingCredits > 0;
  }

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    if (!this.hasCredits) {
      throw new CreditExhaustedError(
        `Cloud credit budget exhausted (used ${this.creditsUsed}/${this.config.creditBudget}). Falling back to local model.`
      );
    }

    const url = new URL("/api/generate", this.config.endpoint).toString();

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= (this.config.maxRetries ?? 2); attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: this.config.model,
            prompt: options.prompt,
            stream: false,
            options: {
              num_predict: options.maxTokens ?? 400,
              temperature: options.temperature ?? 0.2,
              ...(options.stop ? { stop: options.stop } : {})
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          if (response.status === 429 || response.status >= 500) {
            lastError = new Error(`Ollama cloud error ${response.status}: ${errorText}`);
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw new Error(`Ollama cloud request failed: ${response.status} ${errorText}`);
        }

        const data = (await response.json()) as any;
        const text = typeof data?.response === "string" ? data.response : "";

        // Estimate credits: ~1 credit per 1000 tokens generated
        const estimatedTokens = options.maxTokens ?? 400;
        this.creditsUsed += Math.ceil(estimatedTokens / 1000);

        return {
          text: String(text).trim(),
          metadata: {
            raw: data,
            model: this.config.model,
            provider: "ollama-cloud",
            creditsUsed: this.creditsUsed,
            remainingCredits: this.remainingCredits
          }
        };
      } catch (error) {
        if (error instanceof CreditExhaustedError) throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < (this.config.maxRetries ?? 2)) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError ?? new Error("Cloud model generation failed after retries");
  }
}

export class CreditExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditExhaustedError";
  }
}