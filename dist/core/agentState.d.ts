import { HarnessConfig } from "../config";
export interface WorkflowRecord {
    id: string;
    name: string;
    status: "pending" | "running" | "paused" | "completed" | "failed";
    steps: Array<{
        id: string;
        action: string;
        status: string;
    }>;
    createdAt: Date;
}
export interface ActiveGoal {
    id: string;
    description: string;
    status: "pending" | "in_progress" | "completed" | "failed";
    workflowId?: string;
}
export interface KnownDevice {
    kind: string;
    id: string;
    description?: string;
    firstSeen: Date;
    lastSeen: Date;
}
export interface ResourcePolicy {
    maxCpuPercent: number;
    maxRamPercent: number;
    throttleOnHighLoad: boolean;
}
export interface AgentPreferences {
    modelProvider: string;
    voiceMode: "builtIn" | "custom" | "disabled";
    riskLevel: "conservative" | "balanced" | "experimental";
}
export declare class AgentState {
    workflows: Map<string, WorkflowRecord>;
    goals: ActiveGoal[];
    devices: KnownDevice[];
    resourcePolicy: ResourcePolicy;
    preferences: AgentPreferences;
    private resourceHistory;
    constructor(config: HarnessConfig);
    addWorkflow(wf: WorkflowRecord): void;
    updateWorkflow(id: string, updates: Partial<WorkflowRecord>): void;
    getWorkflows(status?: string): WorkflowRecord[];
    addGoal(goal: ActiveGoal): void;
    updateGoal(id: string, updates: Partial<ActiveGoal>): void;
    addDevice(device: KnownDevice): void;
    recordResource(cpu: number, ram: number): void;
    getAverageResource(minutes?: number): {
        cpu: number;
        ram: number;
    };
    shouldThrottle(): boolean;
    toJSON(): Record<string, unknown>;
}
//# sourceMappingURL=agentState.d.ts.map