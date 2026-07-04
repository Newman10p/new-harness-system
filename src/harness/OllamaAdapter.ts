import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export interface OllamaAdapterConfig {
  endpoint?: string;
  model: string;
}

export class OllamaAdapter implements ModelAdapter {
  readonly name = "ollama";

  constructor(private config: OllamaAdapterConfig) {}

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const prompt = options.prompt;

    if (this.config.endpoint) {
      try {
        return await this.generateViaHttp(prompt, options);
      } catch (error) {
        console.warn("Ollama HTTP request failed, falling back to ollama CLI:", error);
      }
    }

    return await this.generateViaCli(prompt, options);
  }

  private async generateViaHttp(prompt: string, options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const url = new URL("/v1/completions", this.config.endpoint).toString();
    const body = {
      model: this.config.model,
      prompt,
      max_tokens: options.maxTokens ?? 512,
      temperature: options.temperature ?? 0.2,
      stop: options.stop
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const text = Array.isArray(data?.choices) && data.choices[0]?.text ? data.choices[0].text : data?.output ?? "";
    return { text: String(text), metadata: { raw: data } };
  }

  private async generateViaCli(prompt: string, options: ModelGenerateOptions): Promise<ModelGenerateResult> {
    const args = ["predict", this.config.model, prompt, "--json", "--temperature", String(options.temperature ?? 0.2)];
    if (options.maxTokens) {
      args.push("--max-tokens", String(options.maxTokens));
    }

    const { stdout, stderr } = await execFileAsync("ollama", args, {
      cwd: process.cwd(),
      env: process.env
    });

    if (stderr) {
      console.warn(stderr);
    }

    let data;
    try {
      data = JSON.parse(stdout);
    } catch (error) {
      return { text: stdout.trim(), metadata: { raw: stdout } };
    }

    const text = Array.isArray(data?.choices) && data.choices[0]?.text ? data.choices[0].text : data?.output ?? "";
    return { text: String(text), metadata: { raw: data } };
  }
}
