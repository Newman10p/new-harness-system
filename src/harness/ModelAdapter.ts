export interface ModelAdapter {
  readonly name: string;
  generate(options: ModelGenerateOptions): Promise<ModelGenerateResult>;
}

export interface ModelGenerateOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
}

export interface ModelGenerateResult {
  text: string;
  metadata?: Record<string, unknown>;
}
