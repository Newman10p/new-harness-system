"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentState = void 0;
class AgentState {
    workflows = new Map();
    goals = [];
    devices = [];
    resourcePolicy;
    preferences;
    resourceHistory = [];
    constructor(config) {
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
    addWorkflow(wf) {
        this.workflows.set(wf.id, wf);
    }
    updateWorkflow(id, updates) {
        const existing = this.workflows.get(id);
        if (existing)
            Object.assign(existing, updates);
    }
    getWorkflows(status) {
        const all = Array.from(this.workflows.values());
        return status ? all.filter((w) => w.status === status) : all;
    }
    addGoal(goal) {
        this.goals.push(goal);
    }
    updateGoal(id, updates) {
        const goal = this.goals.find((g) => g.id === id);
        if (goal)
            Object.assign(goal, updates);
    }
    addDevice(device) {
        const existing = this.devices.find((d) => d.id === device.id);
        if (existing) {
            existing.lastSeen = device.lastSeen;
            existing.description = device.description ?? existing.description;
        }
        else {
            this.devices.push(device);
        }
    }
    recordResource(cpu, ram) {
        this.resourceHistory.push({ cpu, ram, timestamp: new Date() });
        if (this.resourceHistory.length > 1000)
            this.resourceHistory = this.resourceHistory.slice(-500);
    }
    getAverageResource(minutes = 5) {
        const cutoff = Date.now() - minutes * 60 * 1000;
        const recent = this.resourceHistory.filter((r) => r.timestamp.getTime() > cutoff);
        if (recent.length === 0)
            return { cpu: 0, ram: 0 };
        return {
            cpu: recent.reduce((s, r) => s + r.cpu, 0) / recent.length,
            ram: recent.reduce((s, r) => s + r.ram, 0) / recent.length
        };
    }
    shouldThrottle() {
        if (!this.resourcePolicy.throttleOnHighLoad)
            return false;
        const avg = this.getAverageResource(2);
        return avg.cpu > this.resourcePolicy.maxCpuPercent || avg.ram > this.resourcePolicy.maxRamPercent;
    }
    toJSON() {
        return {
            workflows: Array.from(this.workflows.values()),
            goals: this.goals,
            devices: this.devices,
            preferences: this.preferences,
            resourcePolicy: this.resourcePolicy
        };
    }
}
exports.AgentState = AgentState;
//# sourceMappingURL=agentState.js.map