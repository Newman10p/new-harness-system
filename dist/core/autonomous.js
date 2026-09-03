"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomousAgent = void 0;
/**
 * AutonomousAgent - Full free natural language autonomy engine.
 * Takes high-level goals expressed in natural language, breaks them into
 * actionable steps using the model adapter, then executes them through
 * the orchestrator with full policy/security/resource awareness.
 */
class AutonomousAgent {
    orchestrator;
    config;
    goals = [];
    isRunning = false;
    constructor(orchestrator, config) {
        this.orchestrator = orchestrator;
        this.config = config;
    }
    /**
     * Submit a natural language goal for autonomous execution.
     */
    async submitGoal(description) {
        const goal = {
            description,
            steps: [],
            status: "pending"
        };
        this.goals.push(goal);
        return goal;
    }
    /**
     * Run autonomous planning: uses the model to decompose a goal into steps.
     */
    async plan(goal) {
        const model = this.orchestrator.getModelAdapter();
        const availableActions = this.orchestrator.actions.list().map(({ meta }) => ({
            name: meta.name,
            description: meta.description,
            category: meta.category,
            requiresConfirmation: meta.requiresConfirmation ?? false
        }));
        const availableActionsStr = availableActions
            .map((a) => `  - ${a.name} (${a.category}): ${a.description}`)
            .join("\n");
        const policyPrompt = this.orchestrator.getPolicyPrompt();
        const prompt = `You are an autonomous planning AI for the Jarvis Harness system.

${policyPrompt}

Your task: Break down the following user goal into a sequence of concrete tool calls.

Available tools:
${availableActionsStr}

User goal: "${goal.description}"

IMPORTANT RULES:
1. Return ONLY a valid JSON array of steps - no other text, no markdown formatting.
2. Each step must be an object with: { "action": "tool.name", "input": { key: value }, "rationale": "why this step" }
3. Only use tools from the available list above.
4. Be conservative - prefer read-only actions first, destructive actions last.
5. If the goal is ambiguous, make a reasonable guess based on the tools available.
6. Always include a rationale for each step.

Example response format:
[{ "action": "pc.monitor", "input": {}, "rationale": "Check system resources before proceeding" }]`;
        const result = await model.generate({ prompt, maxTokens: 2048, temperature: 0.1 });
        try {
            // Extract JSON array from response
            const text = result.text.trim();
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                throw new Error("No JSON array found in model response");
            }
            const steps = JSON.parse(jsonMatch[0]);
            goal.steps = steps.map((s) => ({
                action: s.action,
                input: s.input ?? {},
                rationale: s.rationale ?? "No rationale provided",
                status: "pending"
            }));
            goal.status = "in_progress";
            return goal.steps;
        }
        catch (error) {
            goal.status = "failed";
            goal.result = `Planning failed: ${error instanceof Error ? error.message : String(error)}`;
            throw error;
        }
    }
    /**
     * Execute a planned goal step by step.
     */
    async execute(goal) {
        if (!goal.steps || goal.steps.length === 0) {
            await this.plan(goal);
        }
        if (!goal.steps || goal.steps.length === 0) {
            goal.status = "failed";
            goal.result = "No steps could be generated for this goal";
            return goal.result;
        }
        this.isRunning = true;
        const results = [];
        for (let i = 0; i < goal.steps.length; i++) {
            const step = goal.steps[i];
            if (!this.isRunning) {
                step.status = "failed";
                step.error = "Execution interrupted";
                break;
            }
            step.status = "running";
            results.push(`\n[Step ${i + 1}/${goal.steps.length}] ${step.action}: ${step.rationale}`);
            try {
                // Check if action exists
                if (!this.orchestrator.actions.has(step.action)) {
                    throw new Error(`Action '${step.action}' not found. Available: ${this.orchestrator.actions.list().map(({ meta }) => meta.name).join(", ")}`);
                }
                const output = await this.orchestrator.executeAction(step.action, step.input);
                step.output = output;
                step.status = "completed";
                // Format output for readability
                const outputStr = typeof output === "string" ? output : JSON.stringify(output, null, 2).slice(0, 500);
                results.push(`  ✓ Output: ${outputStr}`);
            }
            catch (error) {
                step.status = "failed";
                step.error = error instanceof Error ? error.message : String(error);
                results.push(`  ✗ Error: ${step.error}`);
                // Check if we should continue or abort based on error type
                if (step.error.includes("blocked by policy") || step.error.includes("not found")) {
                    results.push("  ⚠ Aborting plan due to policy/configuration error");
                    break;
                }
            }
        }
        this.isRunning = false;
        const allCompleted = goal.steps.every((s) => s.status === "completed");
        goal.status = allCompleted ? "completed" : "failed";
        goal.result = results.join("\n");
        return goal.result;
    }
    /**
     * High-level: submit a natural language goal and autonomously execute it.
     */
    async run(goalDescription) {
        console.log(`\n🧠 Autonomous Agent processing: "${goalDescription}"\n`);
        const goal = await this.submitGoal(goalDescription);
        return this.execute(goal);
    }
    /**
     * Stop the current execution.
     */
    stop() {
        this.isRunning = false;
    }
    /**
     * Get all goals.
     */
    getGoals() {
        return [...this.goals];
    }
    /**
     * Get the current running state.
     */
    get status() {
        return this.isRunning;
    }
}
exports.AutonomousAgent = AutonomousAgent;
//# sourceMappingURL=autonomous.js.map