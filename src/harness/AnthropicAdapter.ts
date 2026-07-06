import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";

export interface AnthropicAdapterConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxRetries?: number;
}

export class AnthropicAdapter implements ModelAdapter {
  readonly name = "anthropic";

  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private maxRetries: number;

  constructor(config: AnthropicAdapterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
    this.maxRetries = config.maxRetries ?? 2;
  }

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const url = new URL("/messages", this.baseUrl).toString();

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: options.maxTokens ?? 512,
            temperature: options.temperature ?? 0.7,
            messages: [{ role: "user", content: options.prompt }],
            ...(options.stop ? { stop_sequences: options.stop } : {})
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          // Retry on 429 (rate limit) or 5xx (server error)
          if (response.status === 429 || response.status >= 500) {
            lastError = new Error(`Anthropic error ${response.status}: ${errorText}`);
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw new Error(`Anthropic error ${response.status}: ${errorText}`);
        }

        const data = (await response.json()) as any;
        const text =
          data?.content?.[0]?.text ??
          data?.completion ??
          "";

        return {
          text: String(text).trim(),
          metadata: { raw: data, model: this.model, provider: "anthropic" }
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError ?? new Error("Anthropic generation failed after retries");
  }
}