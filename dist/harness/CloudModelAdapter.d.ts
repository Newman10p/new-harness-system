import { ModelAdapter, ModelGenerateOptions, ModelGenerateResult } from "./ModelAdapter";
export interface CloudModelAdapterConfig {
    provider: "ollama-cloud";
    endpoint: string;
    model: string;
    maxRetries?: number;
    creditBudget?: number;
}
export declare class CloudModelAdapter implements ModelAdapter {
    readonly name = "cloud";
    private config;
    private creditsUsed;
    constructor(config: CloudModelAdapterConfig);
    get remainingCredits(): number;
    get hasCredits(): boolean;
    generate(options: ModelGenerateOptions): Promise<ModelGenerateResult>;
}
export declare class CreditExhaustedError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=CloudModelAdapter.d.ts.map