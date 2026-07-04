import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";

export interface CloudModelAdapterConfig {
  provider: "ollama-cloud";
  endpoint: string;
  model: string;
}

export class CloudModelAdapter implements ModelAdapter {
  readonly name = "cloud";

  constructor(private config: CloudModelAdapterConfig) {}

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const url = new URL("/api/generate", this.config.endpoint).toString();
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
          temperature: options.temperature ?? 0.2
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama cloud model request failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as any;
    const text = typeof data?.response === "string" ? data.response : "";
    return { text: String(text), metadata: { raw: data } };
  }
}
