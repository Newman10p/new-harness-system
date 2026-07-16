import { ActionRegistry } from "../registry/actionsRegistry";
import { EventBus, globalEventBus } from "./eventBus";
import { AgentState } from "./agentState";
import { Orchestrator } from "./orchestrator";

export interface WorkflowStep {
  id: string;
  kind: "sequential" | "parallel";
  actions: { name: string; input: unknown }[];
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
export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private paused = new Set<string>();

  constructor(
    private orchestrator: Orchestrator,
    private eventBus: EventBus = globalEventBus,
    private agentState?: AgentState
  ) {}

  async start(wf: Workflow): Promise<void> {
    (wf as any).status = "running";
    this.workflows.set(wf.id, wf);

    if (this.agentState) {
      this.agentState.addWorkflow({
        id: wf.id,
        name: wf.name,
        status: "running",
        steps: wf.steps.map((s) => ({ id: s.id, action: s.actions[0]?.name ?? "unknown", status: "pending" })),
        createdAt: new Date()
      });
    }

    this.eventBus.emit({ type: "workflow_update", payload: { id: wf.id, status: "running" } });

    for (const step of wf.steps) {
      const currentStatus = (wf as any).status as string;
      if (currentStatus === "failed") break;
      while (this.paused.has(wf.id)) {
        await new Promise((r) => setTimeout(r, 500));
      }
      const s = (wf as any).status as string;
      if (s === "paused" || s === "failed") break;

      try {
        if (step.kind === "parallel") {
          await Promise.all(step.actions.map((a) => this.executeStepAction(wf, step, a)));
        } else {
          for (const action of step.actions) {
            await this.executeStepAction(wf, step, action);
          }
        }
      } catch (error) {
        console.error(`[Workflow ${wf.id}] Step ${step.id} failed:`, error);
        wf.status = "failed";
        this.eventBus.emit({ type: "workflow_update", payload: { id: wf.id, status: "failed" } });
        return;
      }
    }

    if (wf.status === "running") {
      wf.status = "completed";
      this.eventBus.emit({ type: "workflow_update", payload: { id: wf.id, status: "completed" } });
    }
  }

  private async executeStepAction(wf: Workflow, step: WorkflowStep, action: { name: string; input: unknown }): Promise<void> {
    if (this.agentState) {
      this.agentState.updateWorkflow(wf.id, {
        steps: [{ id: step.id, action: action.name, status: "running" }]
      });
    }
    await this.orchestrator.executeAction(action.name, action.input);
  }

  pause(id: string): void {
    const wf = this.workflows.get(id);
    if (wf) {
      wf.status = "paused";
      this.paused.add(id);
      this.eventBus.emit({ type: "workflow_update", payload: { id, status: "paused" } });
    }
  }

  resume(id: string): void {
    const wf = this.workflows.get(id);
    if (wf) {
      wf.status = "running";
      this.paused.delete(id);
      this.eventBus.emit({ type: "workflow_update", payload: { id, status: "running" } });
    }
  }

  cancel(id: string): void {
    const wf = this.workflows.get(id);
    if (wf) {
      wf.status = "failed";
      this.paused.delete(id);
      this.eventBus.emit({ type: "workflow_update", payload: { id, status: "failed" } });
    }
  }

  get(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  list(): Workflow[] {
    return Array.from(this.workflows.values());
  }
}