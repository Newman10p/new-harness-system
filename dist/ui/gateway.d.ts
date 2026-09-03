import { HarnessConfig } from "../config";
import { Orchestrator } from "../core/orchestrator";
export interface GatewayOptions {
    port: number;
    hostname: string;
}
/**
 * UI Gateway - Serves the web console and provides REST API for the harness.
 */
export declare class UIGateway {
    private server;
    private orchestrator;
    private config;
    private agent;
    private memory;
    constructor(config: HarnessConfig, orchestrator: Orchestrator);
    start(options?: Partial<GatewayOptions>): Promise<void>;
    stop(): void;
    private handleRequest;
    private serveStatic;
    private handleChat;
    private handleGetProviders;
    private handleSetProvider;
    private handleGetStatus;
    private handleMemorySearch;
    private handleListActions;
    private handleRunAction;
    private handleListWorkflows;
    private readBody;
}
//# sourceMappingURL=gateway.d.ts.map