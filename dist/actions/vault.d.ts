import { HarnessAction } from "./types";
export declare function setMemoryInstance(memory: any): void;
declare class VaultSearchAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        results: any[];
    }>;
}
declare class VaultReadAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        content: string;
    }>;
}
declare class VaultWriteAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        path: string;
    }>;
}
export declare const vaultSearchAction: VaultSearchAction;
export declare const vaultReadAction: VaultReadAction;
export declare const vaultWriteAction: VaultWriteAction;
export declare function registerVaultActions(): void;
export {};
//# sourceMappingURL=vault.d.ts.map