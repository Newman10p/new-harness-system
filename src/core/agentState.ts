import { HarnessConfig } from "../config";

export interface WorkflowRecord {
  id: string;
  name: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  steps: Array<{ id: string; action: string; status: string }>;
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

export class AgentState {
  workflows: Map<string, WorkflowRecord> = new Map();
  goals: ActiveGoal[] = [];
  devices: KnownDevice[] = [];
  resourcePolicy: ResourcePolicy;
  preferences: AgentPreferences;
  private resourceHistory: Array<{ cpu: number; ram: number; timestamp: Date }> = [];

  constructor(config: HarnessConfig) {
    this.resourcePolicy = {
      maxCpuPercent: 80,
      maxRamPercent: 90,
      throttleOnHighLoad: true
    };
    this.preferences = {
      modelProvider: config.modelProvider ?? "ollama-cloud",
      voiceMode: config.audio?.mode ?? "disabled",
      riskLevel: config.tools?.safetyLevel ?? "balanced"
    };
  }

  addWorkflow(wf: WorkflowRecord): void {
    this.workflows.set(wf.id, wf);
  }

  updateWorkflow(id: string, updates: Partial<WorkflowRecord>): void {
    const existing = this.workflows.get(id);
    if (existing) Object.assign(existing, updates);
  }

  getWorkflows(status?: string): WorkflowRecord[] {
    const all = Array.from(this.workflows.values());
    return status ? all.filter((w) => w.status === status) : all;
  }

  addGoal(goal: ActiveGoal): void {
    this.goals.push(goal);
  }

  updateGoal(id: string, updates: Partial<ActiveGoal>): void {
    const goal = this.goals.find((g) => g.id === id);
    if (goal) Object.assign(goal, updates);
  }

  addDevice(device: KnownDevice): void {
    const existing = this.devices.find((d) => d.id === device.id);
    if (existing) {
      existing.lastSeen = device.lastSeen;
      existing.description = device.description ?? existing.description;
    } else {
      this.devices.push(device);
    }
  }

  recordResource(cpu: number, ram: number): void {
    this.resourceHistory.push({ cpu, ram, timestamp: new Date() });
    if (this.resourceHistory.length > 1000) this.resourceHistory = this.resourceHistory.slice(-500);
  }

  getAverageResource(minutes = 5): { cpu: number; ram: number } {
    const cutoff = Date.now() - minutes * 60 * 1000;
    const recent = this.resourceHistory.filter((r) => r.timestamp.getTime() > cutoff);
    if (recent.length === 0) return { cpu: 0, ram: 0 };
    return {
      cpu: recent.reduce((s, r) => s + r.cpu, 0) / recent.length,
      ram: recent.reduce((s, r) => s + r.ram, 0) / recent.length
    };
  }

  shouldThrottle(): boolean {
    if (!this.resourcePolicy.throttleOnHighLoad) return false;
    const avg = this.getAverageResource(2);
    return avg.cpu > this.resourcePolicy.maxCpuPercent || avg.ram > this.resourcePolicy.maxRamPercent;
  }

  toJSON(): Record<string, unknown> {
    return {
      workflows: Array.from(this.workflows.values()),
      goals: this.goals,
      devices: this.devices,
      preferences: this.preferences,
      resourcePolicy: this.resourcePolicy
    };
  }
}