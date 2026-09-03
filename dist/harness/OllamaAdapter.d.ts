import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";
export interface OllamaAdapterConfig {
    endpoint?: string;
    model: string;
}
export declare class OllamaAdapter implements ModelAdapter {
    private config;
    readonly name = "ollama";
    constructor(config: OllamaAdapterConfig);
    generate(options: ModelGenerateOptions): Promise<ModelGenerateResult>;
    private generateViaHttp;
    private generateViaCli;
}
//# sourceMappingURL=OllamaAdapter.d.ts.map