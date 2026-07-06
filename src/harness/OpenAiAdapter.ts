import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";

export interface OpenAiAdapterConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxRetries?: number;
}

export class OpenAiAdapter implements ModelAdapter {
  readonly name = "openai";

  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private maxRetries: number;

  constructor(config: OpenAiAdapterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
    this.maxRetries = config.maxRetries ?? 2;
  }

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const url = new URL("/chat/completions", this.baseUrl).toString();

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: options.maxTokens ?? 512,
            temperature: options.temperature ?? 0.7,
            messages: [{ role: "user", content: options.prompt }],
            ...(options.stop ? { stop: options.stop } : {})
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          // Retry on 429 (rate limit) or 5xx (server error)
          if (response.status === 429 || response.status >= 500) {
            lastError = new Error(`OpenAI error ${response.status}: ${errorText}`);
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw new Error(`OpenAI error ${response.status}: ${errorText}`);
        }

        const data = (await response.json()) as any;
        const text =
          data?.choices?.[0]?.message?.content ??
          data?.choices?.[0]?.text ??
          "";

        return {
          text: String(text).trim(),
          metadata: { raw: data, model: this.model, provider: "openai" }
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError ?? new Error("OpenAI generation failed after retries");
  }
}