"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowEngine = void 0;
const eventBus_1 = require("./eventBus");
/**
 * WorkflowEngine runs sequential/parallel workflows with pause/resume/cancel.
 */
class WorkflowEngine {
    orchestrator;
    eventBus;
    agentState;
    workflows = new Map();
    paused = new Set();
    constructor(orchestrator, eventBus = eventBus_1.globalEventBus, agentState) {
        this.orchestrator = orchestrator;
        this.eventBus = eventBus;
        this.agentState = agentState;
    }
    async start(wf) {
        wf.status = "running";
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
            const currentStatus = wf.status;
            if (currentStatus === "failed")
                break;
            while (this.paused.has(wf.id)) {
                await new Promise((r) => setTimeout(r, 500));
            }
            const s = wf.status;
            if (s === "paused" || s === "failed")
                break;
            try {
                if (step.kind === "parallel") {
                    await Promise.all(step.actions.map((a) => this.executeStepAction(wf, step, a)));
                }
                else {
                    for (const action of step.actions) {
                        await this.executeStepAction(wf, step, action);
                    }
                }
            }
            catch (error) {
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
    async executeStepAction(wf, step, action) {
        if (this.agentState) {
            this.agentState.updateWorkflow(wf.id, {
                steps: [{ id: step.id, action: action.name, status: "running" }]
            });
        }
        await this.orchestrator.executeAction(action.name, action.input);
    }
    pause(id) {
        const wf = this.workflows.get(id);
        if (wf) {
            wf.status = "paused";
            this.paused.add(id);
            this.eventBus.emit({ type: "workflow_update", payload: { id, status: "paused" } });
        }
    }
    resume(id) {
        const wf = this.workflows.get(id);
        if (wf) {
            wf.status = "running";
            this.paused.delete(id);
            this.eventBus.emit({ type: "workflow_update", payload: { id, status: "running" } });
        }
    }
    cancel(id) {
        const wf = this.workflows.get(id);
        if (wf) {
            wf.status = "failed";
            this.paused.delete(id);
            this.eventBus.emit({ type: "workflow_update", payload: { id, status: "failed" } });
        }
    }
    get(id) {
        return this.workflows.get(id);
    }
    list() {
        return Array.from(this.workflows.values());
    }
}
exports.WorkflowEngine = WorkflowEngine;
//# sourceMappingURL=workflowEngine.js.map