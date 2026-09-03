import type { Action, ActionResult, AgentState, LLMConfig, HudEmitter, InboxEvent, AuditEntry } from "../types/index.js";
import { PolicyEngine } from "../security/PolicyEngine.js";
import { ActionRegistry } from "../actions/index.js";
export interface AgentLoopCallbacks {
    onText?: (text: string) => void;
    onToken?: (token: string) => void;
    onActionStart?: (action: Action) => void;
    onActionResult?: (action: Action, result: ActionResult) => void;
    onPolicyViolation?: (action: Action, reason: string) => void;
    onApprovalRequired?: (action: Action) => void;
    onLoopStart?: (loopNumber: number) => void;
    onLoopEnd?: (loopNumber: number, reason: string) => void;
    onError?: (error: string) => void;
}
export declare class AgentLoop {
    private clients;
    private primaryModel;
    private policyEngine;
    private registry;
    private state;
    private callbacks;
    private hudEmitter;
    private inboxAppender;
    private audit;
    private useFallback;
    private interactionCount;
    private sessionStart;
    private recentErrors;
    private selfEngine;
    private userModel;
    constructor(llmConfig: LLMConfig, policyEngine: PolicyEngine, registry: ActionRegistry, callbacks?: AgentLoopCallbacks);
    /**
     * Main entry point: process a user message through the full loop.
     */
    processUserMessage(input: string): Promise<void>;
    /**
     * Inject an approval response from the WebSocket HUD.
     */
    resolveApproval(approved: boolean): void;
    setHudEmitter(fn: HudEmitter): void;
    setInboxAppender(fn: (event: InboxEvent) => Promise<void>): void;
    setAudit(fn: (entry: AuditEntry) => Promise<void>): void;
    clearHistory(): void;
    getState(): Readonly<AgentState>;
    getProviderInfo(): {
        count: number;
        names: string[];
    };
    private runLoop;
    /**
     * Call LLM with live token streaming to the HUD.
     * Falls back to next provider on failure.
     */
    private callLLMStreaming;
    /**
     * Stream pre-fetched text as simulated tokens to the HUD.
     */
    private streamAsTokens;
    /**
     * Trigger self-improvement reflection (non-blocking, non-fatal).
     */
    private triggerSelfReflection;
    private waitForApproval;
}
//# sourceMappingURL=AgentLoop.d.ts.map