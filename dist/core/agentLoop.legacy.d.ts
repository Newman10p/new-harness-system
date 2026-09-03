import { EventBus } from "./eventBus";
import { AgentState } from "./agentState";
import { WorkflowEngine } from "./workflowEngine";
import { Orchestrator } from "./orchestrator";
/**
 * Main agent loop. Subscribes to all events and routes them to workflows or actions.
 */
export declare function startAgentLoop(orchestrator: Orchestrator, agentState: AgentState, workflowEngine: WorkflowEngine, eventBus?: EventBus): Promise<() => void>;
//# sourceMappingURL=agentLoop.legacy.d.ts.map