import { HarnessConfig } from "../config";
import { ModelAdapter } from "../harness/ModelAdapter";
export declare class ProviderRegistry {
    private providers;
    private configs;
    private defaultProvider;
    constructor(config: HarnessConfig);
    private loadFromConfig;
    private createAdapter;
    getProvider(name: string): ModelAdapter | undefined;
    getDefaultProvider(): ModelAdapter;
    setDefaultProvider(name: string): void;
    listProviders(): Array<{
        name: string;
        type: string;
        model: string;
        enabled: boolean;
    }>;
    get defaultProviderName(): string;
}
//# sourceMappingURL=providersRegistry.d.ts.map