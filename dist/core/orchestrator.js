"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Orchestrator = exports.ProviderRegistry = exports.ActionRegistry = void 0;
const PolicyEngine_1 = require("../policy/PolicyEngine");
const SecurityMonitor_1 = require("../security/SecurityMonitor");
const actionsRegistry_1 = require("../registry/actionsRegistry");
Object.defineProperty(exports, "ActionRegistry", { enumerable: true, get: function () { return actionsRegistry_1.ActionRegistry; } });
const providersRegistry_1 = require("../registry/providersRegistry");
Object.defineProperty(exports, "ProviderRegistry", { enumerable: true, get: function () { return providersRegistry_1.ProviderRegistry; } });
/**
 * Central orchestrator that integrates actions, policy, security, and providers.
 */
class Orchestrator {
    actions;
    policy;
    security;
    providers;
    config;
    modelAdapter;
    resourceState = null;
    constructor(config) {
        this.config = config;
        this.actions = actionsRegistry_1.globalActionRegistry;
        this.policy = new PolicyEngine_1.PolicyEngine(config);
        this.security = new SecurityMonitor_1.SecurityMonitor(config);
        this.providers = new providersRegistry_1.ProviderRegistry(config);
        this.modelAdapter = this.providers.getDefaultProvider();
        // Start security monitoring
        this.security.start();
    }
    /**
     * Get the currently active model adapter.
     */
    getModelAdapter() {
        return this.modelAdapter;
    }
    /**
     * Switch the active model provider.
     */
    setProvider(name) {
        this.providers.setDefaultProvider(name);
        this.modelAdapter = this.providers.getProvider(name) ?? this.providers.getDefaultProvider();
    }
    /**
     * Execute an action through the orchestrator with policy + security checks.
     */
    async executeAction(actionName, input) {
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
        global.__allowedRemoteDomains = this.config.tools?.networkAccess
            ? ["*"]
            : this.config.permissions?.allowedExternalCommands ?? [];
        global.__allowedNetworkDomains = this.config.tools?.networkAccess
            ? ["*"]
            : [];
        global.__sim3dEnabled = this.config.tools?.sim3dEnabled ?? false;
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
    getPolicyPrompt() {
        return this.policy.toSystemPrompt();
    }
    /**
     * Refresh resource monitoring state.
     */
    async refreshResourceState() {
        try {
            const result = await this.actions.runAction("pc.monitor", {});
            this.resourceState = result;
            return this.resourceState;
        }
        catch {
            return null;
        }
    }
    /**
     * Get current resource state (cached).
     */
    getResourceState() {
        return this.resourceState;
    }
    /**
     * Clean shutdown.
     */
    shutdown() {
        this.security.stop();
    }
}
exports.Orchestrator = Orchestrator;
//# sourceMappingURL=orchestrator.js.map