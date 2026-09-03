import { EventBus } from "./eventBus";
import { AgentState } from "./agentState";
import { Orchestrator } from "./orchestrator";
export interface WorkflowStep {
    id: string;
    kind: "sequential" | "parallel";
    actions: {
        name: string;
        input: unknown;
    }[];
}
export interface Workflow {
    id: string;
    name: string;
    steps: WorkflowStep[];
    status: "pending" | "running" | "paused" | "completed" | "failed";
}
/**
 * WorkflowEngine runs sequential/parallel workflows with pause/resume/cancel.
 */
export declare class WorkflowEngine {
    private orchestrator;
    private eventBus;
    private agentState?;
    private workflows;
    private paused;
    constructor(orchestrator: Orchestrator, eventBus?: EventBus, agentState?: AgentState | undefined);
    start(wf: Workflow): Promise<void>;
    private executeStepAction;
    pause(id: string): void;
    resume(id: string): void;
    cancel(id: string): void;
    get(id: string): Workflow | undefined;
    list(): Workflow[];
}
//# sourceMappingURL=workflowEngine.d.ts.map