import { HarnessConfig } from "../config";
import { PolicyEngine } from "../policy/PolicyEngine";
import { SecurityMonitor } from "../security/SecurityMonitor";
import { ActionRegistry, globalActionRegistry } from "../registry/actionsRegistry";
import { ProviderRegistry } from "../registry/providersRegistry";
import { ModelAdapter } from "../harness/ModelAdapter";
import { PcMonitorOutput } from "../actions/pc";

export { ActionRegistry, ProviderRegistry };

/**
 * Central orchestrator that integrates actions, policy, security, and providers.
 */
export class Orchestrator {
  readonly actions: ActionRegistry;
  readonly policy: PolicyEngine;
  readonly security: SecurityMonitor;
  readonly providers: ProviderRegistry;
  readonly config: HarnessConfig;
  private modelAdapter: ModelAdapter;
  private resourceState: PcMonitorOutput | null = null;

  constructor(config: HarnessConfig) {
    this.config = config;
    this.actions = globalActionRegistry;
    this.policy = new PolicyEngine(config);
    this.security = new SecurityMonitor(config);
    this.providers = new ProviderRegistry(config);
    this.modelAdapter = this.providers.getDefaultProvider();

    // Start security monitoring
    this.security.start();
  }

  /**
   * Get the currently active model adapter.
   */
  getModelAdapter(): ModelAdapter {
    return this.modelAdapter;
  }

  /**
   * Switch the active model provider.
   */
  setProvider(name: string): void {
    this.providers.setDefaultProvider(name);
    this.modelAdapter = this.providers.getProvider(name) ?? this.providers.getDefaultProvider();
  }

  /**
   * Execute an action through the orchestrator with policy + security checks.
   */
  async executeAction(actionName: string, input: unknown): Promise<unknown> {
    const meta = this.actions.getMeta(actionName);
    const safetyLevel = this.config.tools?.safetyLevel ?? "balanced";

    // Policy check
    const policyCheck = this.policy.checkAction(actionName, safetyLevel);
    if (!policyCheck.allowed) {
      throw new Error(`Action blocked by policy: ${policyCheck.reason}`);
    }

    // Resource check for heavy actions
    if (actionName === "sim3d.run") {
      await this.refreshResourceState();
      if (this.resourceState && this.resourceState.memory.usedPercent > 85) {
        throw new Error("Resource constraint: memory too high for simulation");
      }
    }

    // Configure global state for actions
    (global as any).__allowedRemoteDomains = this.config.tools?.networkAccess
      ? ["*"]
      : this.config.permissions?.allowedExternalCommands ?? [];
    (global as any).__allowedNetworkDomains = this.config.tools?.networkAccess
      ? ["*"]
      : [];
    (global as any).__sim3dEnabled = this.config.tools?.sim3dEnabled ?? false;

    // Log action to security monitor
    this.security.logAction({
      timestamp: new Date(),
      action: actionName,
      input
    });

    // Execute
    const output = await this.actions.runAction(actionName, input);

    // Log output
    this.security.logAction({
      timestamp: new Date(),
      action: `${actionName}:output`,
      input: {},
      output
    });

    return output;
  }

  /**
   * Get the policy as a system prompt.
   */
  getPolicyPrompt(): string {
    return this.policy.toSystemPrompt();
  }

  /**
   * Refresh resource monitoring state.
   */
  async refreshResourceState(): Promise<PcMonitorOutput | null> {
    try {
      const result = await this.actions.runAction("pc.monitor", {});
      this.resourceState = result as PcMonitorOutput;
      return this.resourceState;
    } catch {
      return null;
    }
  }

  /**
   * Get current resource state (cached).
   */
  getResourceState(): PcMonitorOutput | null {
    return this.resourceState;
  }

  /**
   * Clean shutdown.
   */
  shutdown(): void {
    this.security.stop();
  }
}