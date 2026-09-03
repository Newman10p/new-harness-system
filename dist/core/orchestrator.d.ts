import { HarnessConfig } from "../config";
import { PolicyEngine } from "../policy/PolicyEngine";
import { SecurityMonitor } from "../security/SecurityMonitor";
import { ActionRegistry } from "../registry/actionsRegistry";
import { ProviderRegistry } from "../registry/providersRegistry";
import { ModelAdapter } from "../harness/ModelAdapter";
import { PcMonitorOutput } from "../actions/pc";
export { ActionRegistry, ProviderRegistry };
/**
 * Central orchestrator that integrates actions, policy, security, and providers.
 */
export declare class Orchestrator {
    readonly actions: ActionRegistry;
    readonly policy: PolicyEngine;
    readonly security: SecurityMonitor;
    readonly providers: ProviderRegistry;
    readonly config: HarnessConfig;
    private modelAdapter;
    private resourceState;
    constructor(config: HarnessConfig);
    /**
     * Get the currently active model adapter.
     */
    getModelAdapter(): ModelAdapter;
    /**
     * Switch the active model provider.
     */
    setProvider(name: string): void;
    /**
     * Execute an action through the orchestrator with policy + security checks.
     */
    executeAction(actionName: string, input: unknown): Promise<unknown>;
    /**
     * Get the policy as a system prompt.
     */
    getPolicyPrompt(): string;
    /**
     * Refresh resource monitoring state.
     */
    refreshResourceState(): Promise<PcMonitorOutput | null>;
    /**
     * Get current resource state (cached).
     */
    getResourceState(): PcMonitorOutput | null;
    /**
     * Clean shutdown.
     */
    shutdown(): void;
}
//# sourceMappingURL=orchestrator.d.ts.map