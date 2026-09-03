import { HarnessAction } from "./types";
export interface NetFetchInput {
    url: string;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
}
export interface NetFetchOutput {
    status: number;
    statusText: string;
    data: unknown;
    headers: Record<string, string>;
}
declare class NetFetchAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<NetFetchOutput>;
}
export declare const netFetchAction: NetFetchAction;
export declare function registerNetworkActions(): void;
export {};
//# sourceMappingURL=network.d.ts.map