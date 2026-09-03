import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";
export interface AnthropicAdapterConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
    maxRetries?: number;
}
export declare class AnthropicAdapter implements ModelAdapter {
    readonly name = "anthropic";
    private apiKey;
    private model;
    private baseUrl;
    private maxRetries;
    constructor(config: AnthropicAdapterConfig);
    generate(options: ModelGenerateOptions): Promise<ModelGenerateResult>;
}
//# sourceMappingURL=AnthropicAdapter.d.ts.map