import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";
export interface OpenAiAdapterConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
    maxRetries?: number;
}
export declare class OpenAiAdapter implements ModelAdapter {
    readonly name = "openai";
    private apiKey;
    private model;
    private baseUrl;
    private maxRetries;
    constructor(config: OpenAiAdapterConfig);
    generate(options: ModelGenerateOptions): Promise<ModelGenerateResult>;
}
//# sourceMappingURL=OpenAiAdapter.d.ts.map