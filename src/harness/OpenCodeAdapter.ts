import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";

export interface OpenCodeAdapterConfig {
  baseUrl?: string;
  model: string; // e.g. "anthropic/claude-3-5-sonnet-20241022"
  apiKey?: string;
}

/**
 * Adapter for OpenCode.ai compatible servers.
 * Uses the @opencode-ai/sdk or raw HTTP to an opencode server.
 */
export class OpenCodeAdapter implements ModelAdapter {
  readonly name = "opencode";
  private baseUrl: string;
  private model: string;
  private apiKey?: string;

  constructor(config: OpenCodeAdapterConfig) {
    this.baseUrl = config.baseUrl ?? "http://localhost:4096";
    this.model = config.model;
    this.apiKey = config.apiKey;
  }

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const url = `${this.baseUrl}/api/session`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: options.prompt }],
        maxTokens: options.maxTokens ?? 512,
        temperature: options.temperature ?? 0.7,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenCode error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as any;
    const text =
      data?.messages?.[0]?.content ??
      data?.content ??
      data?.text ??
      "";

    return {
      text: String(text).trim(),
      metadata: {
        provider: "opencode",
        model: this.model,
        raw: data
      }
    };
  }
}