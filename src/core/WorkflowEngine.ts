// ─── M.A.I. Orchestrated Workflow Engine ─────────────────────────────────
// Predefined workflow templates with decision points.
//
// Design principles:
//   1. Templates are deterministic blueprints — the brain model only handles
//      decisions that the template CANNOT make (branching, analysis).
//   2. Every step produces progress events for the HUD.
//   3. If a workflow can't handle something, it falls back to the normal AgentLoop.
//   4. The brain model (120B) works alone or with optional small models.
//   5. Workflow results are injected into the conversation as assistant context.

import type {
  Action,
  ActionName,
  ActionContext,
  ActionResult,
  ChatMessage,
  HudEmitter,
  InboxEvent,
  AuditEntry,
  WorkflowTemplate,
  WorkflowStepDef,
  WorkflowAction,
  WorkflowDecision,
  WorkflowInstance,
  WorkflowStepState,
  WorkflowStepStatus,
  WorkflowStatus,
  WorkflowTrigger,
  WorkflowMatchResult,
  WorkflowEngineConfig,
  AuditLogger,
} from "../types/index.js";
import { WORKFLOWS_DIR } from "./constants.js";
import { getLogger } from "./MaiLogger.js";
import { formatToolResult } from "./ToolResultTruncator.js";
import { DEFAULT_LOOP_CONFIG } from "../types/index.js";
import { callWithFallback, type LLMInstance } from "./MultiProvider.js";

const log = getLogger("WorkflowEngine");

// ─── Brain query interface ─────────────────────────────────────────────────
// The engine needs a way to ask the brain model questions for decision steps.
// This is injected from AgentLoop at startup.

export interface BrainQueryFn {
  /** Ask the brain model a question, get a text response. */
  (messages: ChatMessage[]): Promise<string>;
}

// ─── Workflow Engine ────────────────────────────────────────────────────────

export class WorkflowEngine {
  private templates = new Map<string, WorkflowTemplate>();
  private activeWorkflows = new Map<string, WorkflowInstance>();
  private config: Required<WorkflowEngineConfig>;
  private hudEmitter: HudEmitter = () => {};
  private auditFn: AuditLogger = async () => {};
  private inboxAppender: (event: InboxEvent) => Promise<void> = async () => {};
  private brainQuery: BrainQueryFn | null = null;
  private actionExecutor: ((action: Action, ctx: ActionContext) => Promise<ActionResult>) | null = null;

  // Stats
  private stats = {
    workflowsStarted: 0,
    workflowsCompleted: 0,
    workflowsFailed: 0,
    workflowsCancelled: 0,
    totalStepsExecuted: 0,
    totalBrainQueries: 0,
  };

  constructor(config: WorkflowEngineConfig = {}) {
    this.config = {
      templatesDir: config.templatesDir ?? WORKFLOWS_DIR,
      maxConcurrent: config.maxConcurrent ?? 3,
      stepTimeoutMs: config.stepTimeoutMs ?? 120_000,
      workflowTimeoutMs: config.workflowTimeoutMs ?? 600_000,
    };
  }

  // ─── Wiring (called from server.ts / AgentLoop) ──────────────────────────

  setHudEmitter(fn: HudEmitter): void { this.hudEmitter = fn; }
  setAudit(fn: AuditLogger): void { this.auditFn = fn; }
  setInboxAppender(fn: (event: InboxEvent) => Promise<void>): void { this.inboxAppender = fn; }

  /** Inject the brain model query function (from AgentLoop's LLM client). */
  setBrainQuery(fn: BrainQueryFn): void { this.brainQuery = fn; }

  /** Inject the action executor (from ActionRegistry.execute). */
  setActionExecutor(fn: (action: Action, ctx: ActionContext) => Promise<ActionResult>): void {
    this.actionExecutor = fn;
  }

  // ─── Template Management ─────────────────────────────────────────────────

  /** Register a workflow template. */
  registerTemplate(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
    log.info("Registered workflow template", { data: { id: template.id, name: template.name, steps: template.steps.length } });
  }

  /** Load all templates from built-in registry + JSON files from disk. */
  async loadTemplates(): Promise<number> {
    // 1. Load built-in templates
    const builtins = await this.loadBuiltinTemplates();
    for (const t of builtins) this.registerTemplate(t);

    // 2. Load JSON files from disk
    const disk = await this.loadDiskTemplates();
    for (const t of disk) this.registerTemplate(t);

    log.info("Templates loaded", { data: { builtins: builtins.length, disk: disk.length, total: this.templates.size } });
    return this.templates.size;
  }

  /** Get all registered templates. */
  listTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  /** Get a specific template by ID. */
  getTemplate(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  // ─── Matching ────────────────────────────────────────────────────────────

  /**
   * Check if a user message matches any workflow template.
   * Returns the best match or null if no workflow applies.
   *
   * Matching is conservative: we'd rather fall through to the AgentLoop
   * than force a workflow that doesn't fit.
   */
  matchWorkflow(message: string, intentType?: string): WorkflowMatchResult | null {
    const lower = message.toLowerCase();
    let bestMatch: WorkflowMatchResult | null = null;

    for (const template of this.templates.values()) {
      let score = 0;
      let matchedTriggers = 0;

      for (const trigger of template.triggers) {
        let triggerMatched = false;

        // Keyword matching
        if (trigger.keywords) {
          for (const kw of trigger.keywords) {
            if (lower.includes(kw.toLowerCase())) {
              triggerMatched = true;
              score += 1;
            }
          }
        }

        // Intent type matching
        if (trigger.intentTypes && intentType) {
          if (trigger.intentTypes.includes(intentType)) {
            triggerMatched = true;
            score += 2;
          }
        }

        if (triggerMatched) matchedTriggers++;
      }

      // Require at least one trigger to match, with at least 1 keyword hit
      if (matchedTriggers > 0 && score >= 1) {
        const confidence = Math.min(1, score / 3);
        if (!bestMatch || confidence > bestMatch.confidence) {
          // Extract variables from the message
          const variables = this.extractVariables(template, message);
          bestMatch = { template, variables, confidence };
        }
      }
    }

    // Don't match with very low confidence — let AgentLoop handle it
    if (bestMatch && bestMatch.confidence < 0.2) return null;

    return bestMatch;
  }

  // ─── Execution ───────────────────────────────────────────────────────────

  /**
   * Execute a workflow template. Returns the summary text that should be
   * injected into the conversation as assistant context.
   */
  async executeWorkflow(match: WorkflowMatchResult, triggerMessage: string): Promise<string> {
    const { template, variables } = match;
    const instance = this.createInstance(template, variables, triggerMessage);
    this.activeWorkflows.set(instance.id, instance);
    this.stats.workflowsStarted++;

    log.info("Starting workflow", { data: { id: instance.id, template: template.id, steps: template.steps.length } });
    this.auditFn({ type: "action_executed", action: "workflow-start", detail: `Workflow ${template.id} started: ${triggerMessage.slice(0, 100)}`, ok: true });

    // Emit workflow started
    this.hudEmitter("workflow_started", {
      workflowId: instance.id,
      templateId: template.id,
      templateName: template.name,
      totalSteps: template.steps.length,
      estimatedDurationSec: template.estimatedDurationSec,
      triggerMessage,
    });
    this.hudEmitter("activity_log", {
      message: `Starting workflow: ${template.name} (${template.steps.length} steps)`,
      level: "info",
    });

    // Execute steps
    const workflowTimeout = setTimeout(() => {
      if (instance.status === "running") {
        instance.status = "failed";
        log.error("Workflow timed out", { data: { id: instance.id, timeout: this.config.workflowTimeoutMs } });
      }
    }, this.config.workflowTimeoutMs);

    try {
      await this.executeSteps(template.steps, instance);
    } catch (err) {
      instance.status = "failed";
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Workflow failed", { error: errMsg, data: { id: instance.id } });

      const failedStep = instance.steps[instance.currentStepIndex];
      this.hudEmitter("workflow_failed", {
        workflowId: instance.id,
        templateName: template.name,
        stepName: failedStep?.name ?? "unknown",
        error: errMsg,
        stepsCompleted: instance.currentStepIndex,
        stepsTotal: template.steps.length,
      });
      this.stats.workflowsFailed++;

      return `[Workflow ${template.name} failed at step "${failedStep?.name}": ${errMsg}]\n\nFalling back to standard processing.`;
    } finally {
      clearTimeout(workflowTimeout);
    }

    // Check final status
    if (instance.status === "running") {
      instance.status = "completed";
      instance.completedAt = Date.now();
      this.stats.workflowsCompleted++;

      this.hudEmitter("workflow_completed", {
        workflowId: instance.id,
        templateName: template.name,
        durationMs: (instance.completedAt ?? Date.now()) - (instance.startedAt ?? Date.now()),
        stepsCompleted: instance.steps.filter(s => s.status === "completed").length,
        stepsTotal: template.steps.length,
        summary: instance.summary,
      });

      log.info("Workflow completed", { data: { id: instance.id, duration: instance.completedAt! - instance.startedAt! } });
      this.auditFn({ type: "action_executed", action: "workflow-complete", detail: `Workflow ${template.id} completed successfully`, ok: true });
    } else if (instance.status === "cancelled") {
      this.stats.workflowsCancelled++;
      this.hudEmitter("workflow_cancelled", {
        workflowId: instance.id,
        templateName: template.name,
        stepsCompleted: instance.currentStepIndex,
        stepsTotal: template.steps.length,
      });
    }

    return instance.summary;
  }

  /** Cancel a running workflow. */
  cancelWorkflow(workflowId: string): boolean {
    const instance = this.activeWorkflows.get(workflowId);
    if (instance && instance.status === "running") {
      instance.status = "cancelled";
      log.info("Workflow cancelled", { data: { id: workflowId } });
      return true;
    }
    return false;
  }

  /** Get all active workflows. */
  getActiveWorkflows(): WorkflowInstance[] {
    return Array.from(this.activeWorkflows.values()).filter(w => w.status === "running");
  }

  /** Get a specific workflow instance. */
  getWorkflow(id: string): WorkflowInstance | undefined {
    return this.activeWorkflows.get(id);
  }

  /** Get engine statistics. */
  getStats() { return { ...this.stats, activeWorkflows: this.activeWorkflows.size, registeredTemplates: this.templates.size }; }

  // ─── Private: Step Execution ─────────────────────────────────────────────

  private async executeSteps(steps: WorkflowStepDef[], instance: WorkflowInstance): Promise<void> {
    for (let i = 0; i < steps.length; i++) {
      if (instance.status !== "running") return;

      const step = steps[i];
      instance.currentStepIndex = i;
      const stepState: WorkflowStepState = {
        stepId: step.id,
        name: step.name,
        status: "pending",
      };
      instance.steps.push(stepState);

      const percent = Math.round(((i) / steps.length) * 100);
      this.emitStepUpdate(instance, i, step.name, "running", percent, step.description);
      stepState.status = "running";
      stepState.startedAt = Date.now();

      try {
        switch (step.kind) {
          case "actions":
            await this.executeActionsStep(step.actions, instance, stepState);
            break;
          case "parallel":
            await this.executeParallelStep(step.actions, instance, stepState);
            break;
          case "decision":
            await this.executeDecisionStep(step.decision, instance, stepState);
            break;
          case "brain":
            await this.executeBrainStep(step.prompt, step.saveAs, instance, stepState);
            break;
        }

        stepState.status = "completed";
        stepState.completedAt = Date.now();
        this.stats.totalStepsExecuted++;

        const donePercent = Math.round(((i + 1) / steps.length) * 100);
        this.emitStepUpdate(instance, i, step.name, "completed", donePercent);

      } catch (err) {
        stepState.status = "failed";
        stepState.error = err instanceof Error ? err.message : String(err);
        stepState.completedAt = Date.now();
        instance.status = "failed";
        throw err;
      }
    }
  }

  private async executeActionsStep(
    actions: WorkflowAction[],
    instance: WorkflowInstance,
    stepState: WorkflowStepState
  ): Promise<void> {
    stepState.actionResults = [];
    const actionCtx = this.buildActionContext(instance);

    for (const wa of actions) {
      const result = await this.executeSingleWorkflowAction(wa, instance, actionCtx);
      stepState.actionResults.push(result);
      instance.summary += `${wa.label || wa.action}: ${result.ok ? "done" : result.truncated}\n`;
    }
  }

  private async executeParallelStep(
    actions: WorkflowAction[],
    instance: WorkflowInstance,
    stepState: WorkflowStepState
  ): Promise<void> {
    stepState.actionResults = [];
    const actionCtx = this.buildActionContext(instance);

    const results = await Promise.all(
      actions.map(wa => this.executeSingleWorkflowAction(wa, instance, actionCtx))
    );
    stepState.actionResults.push(...results);
    for (const r of results) {
      instance.summary += `${r.action}: ${r.ok ? "done" : r.truncated}\n`;
    }
  }

  private async executeDecisionStep(
    decision: WorkflowDecision,
    instance: WorkflowInstance,
    stepState: WorkflowStepState
  ): Promise<void> {
    stepState.status = "waiting_brain";
    this.emitStepUpdate(instance, instance.currentStepIndex, stepState.name, "waiting_brain", undefined, `Deciding: ${decision.question.slice(0, 80)}`);

    const chosenBranchId = await this.queryBrainForDecision(decision, instance);
    stepState.chosenBranch = chosenBranchId;

    // Find and execute the chosen branch
    const branch = decision.branches.find(b => b.id === chosenBranchId);
    if (!branch) {
      throw new Error(`Brain chose unknown branch "${chosenBranchId}" for decision "${decision.id}"`);
    }

    log.info("Decision made", { data: { decisionId: decision.id, branch: chosenBranchId, condition: branch.condition } });
    this.hudEmitter("activity_log", {
      message: `Decision: ${branch.condition}`,
      level: "info",
    });
    instance.summary += `Decision [${decision.id}]: ${branch.condition}\n`;

    stepState.status = "running";

    // Execute the branch actions
    if (branch.actions.length > 0) {
      stepState.actionResults = [];
      const actionCtx = this.buildActionContext(instance);
      for (const wa of branch.actions) {
        const result = await this.executeSingleWorkflowAction(wa, instance, actionCtx);
        stepState.actionResults.push(result);
        instance.summary += `  ${wa.label || wa.action}: ${result.ok ? "done" : result.truncated}\n`;
      }
    }

    // Execute sub-steps if any
    if (branch.then && branch.then.length > 0) {
      await this.executeSteps(branch.then, instance);
    }
  }

  private async executeBrainStep(
    prompt: string,
    saveAs: string | undefined,
    instance: WorkflowInstance,
    stepState: WorkflowStepState
  ): Promise<void> {
    stepState.status = "waiting_brain";
    this.emitStepUpdate(instance, instance.currentStepIndex, stepState.name, "waiting_brain", undefined, "Consulting brain model...");

    const response = await this.queryBrain(prompt, instance);
    stepState.brainResponse = response;
    stepState.status = "running";

    // Store in workflow variables if saveAs is specified
    if (saveAs) {
      instance.variables[saveAs] = response;
    }

    // Add to summary
    instance.summary += `[Brain]: ${response.slice(0, 500)}${response.length > 500 ? "..." : ""}\n`;
  }

  // ─── Private: Brain Query ────────────────────────────────────────────────

  private async queryBrainForDecision(
    decision: WorkflowDecision,
    instance: WorkflowInstance
  ): Promise<string> {
    if (!this.brainQuery) {
      log.warn("No brain query function — using fallback branch", { data: { decisionId: decision.id, fallback: decision.fallbackBranch } });
      return decision.fallbackBranch ?? decision.branches[0].id;
    }

    this.stats.totalBrainQueries++;

    const branchDescriptions = decision.branches
      .map(b => `  [${b.id}] ${b.condition}`)
      .join("\n");

    const prompt = `${decision.question}\n
Available branches:
${branchDescriptions}

Context: ${instance.triggerMessage.slice(0, 300)}

Respond with ONLY the branch ID (e.g., "${decision.branches[0].id}"). Nothing else.`;

    try {
      const response = await this.brainQuery([
        { role: "system", content: "You are a workflow decision router. Respond with ONLY the branch ID. No explanation." },
        { role: "user", content: prompt },
      ]);

      const chosen = response.trim().toLowerCase();
      // Validate it matches a branch
      if (decision.branches.some(b => b.id.toLowerCase() === chosen)) {
        return decision.branches.find(b => b.id.toLowerCase() === chosen)!.id;
      }

      // Try partial match
      for (const b of decision.branches) {
        if (chosen.includes(b.id.toLowerCase()) || b.id.toLowerCase().includes(chosen)) {
          return b.id;
        }
      }

      // Fallback
      log.warn("Brain returned invalid branch", { data: { response: chosen, fallback: decision.fallbackBranch } });
      return decision.fallbackBranch ?? decision.branches[0].id;
    } catch (err) {
      log.warn("Brain query failed for decision", { error: err, data: { decisionId: decision.id } });
      return decision.fallbackBranch ?? decision.branches[0].id;
    }
  }

  private async queryBrain(prompt: string, instance: WorkflowInstance): Promise<string> {
    if (!this.brainQuery) {
      return "[Brain unavailable — skipping analysis]";
    }

    this.stats.totalBrainQueries++;

    try {
      return await this.brainQuery([
        { role: "system", content: "You are M.A.I., an autonomous AI agent. Provide a concise, actionable response." },
        { role: "user", content: prompt },
      ]);
    } catch (err) {
      log.warn("Brain query failed", { error: err });
      return "[Brain query failed]";
    }
  }

  // ─── Private: Action Execution ───────────────────────────────────────────

  private async executeSingleWorkflowAction(
    wa: WorkflowAction,
    instance: WorkflowInstance,
    ctx: ActionContext
  ): Promise<{ action: string; ok: boolean; durationMs: number; truncated?: string }> {
    // Interpolate variables into params
    const params = this.interpolateParams(wa.params ?? {}, instance.variables);
    const action: Action = { action: wa.action, ...params };

    const label = wa.label || wa.action;
    this.hudEmitter("action_progress", {
      id: `${instance.id}_${wa.action}_${Date.now()}`,
      action: wa.action,
      step: label,
      detail: `Executing: ${label}`,
    });

    const start = Date.now();
    try {
      if (!this.actionExecutor) {
        throw new Error("No action executor configured");
      }

      const result = await Promise.race([
        this.actionExecutor(action, ctx),
        new Promise<ActionResult>((resolve) =>
          setTimeout(() => resolve({ ok: false, error: `Workflow action timeout after ${this.config.stepTimeoutMs}ms` }), this.config.stepTimeoutMs)
        ),
      ]);

      const duration = Date.now() - start;
      const truncated = result.ok
        ? await formatToolResult(wa.action, JSON.stringify(result.data) ?? "", DEFAULT_LOOP_CONFIG)
        : result.error;

      this.auditFn({
        type: "action_executed",
        action: wa.action,
        detail: `Workflow ${instance.templateId} step: ${label}`,
        durationMs: duration,
        ok: result.ok,
      });

      if (!result.ok && !wa.optional) {
        throw new Error(`Action ${wa.action} failed: ${result.error}`);
      }

      return { action: wa.action, ok: result.ok, durationMs: duration, truncated };
    } catch (err) {
      const duration = Date.now() - start;
      const errMsg = err instanceof Error ? err.message : String(err);

      if (wa.optional) {
        log.warn("Optional workflow action failed (continuing)", { data: { action: wa.action, error: errMsg } });
        return { action: wa.action, ok: false, durationMs: duration, truncated: errMsg };
      }
      throw err;
    }
  }

  // ─── Private: Helpers ────────────────────────────────────────────────────

  private buildActionContext(instance: WorkflowInstance): ActionContext {
    return {
      emitHud: this.hudEmitter,
      appendInbox: this.inboxAppender,
      audit: this.auditFn,
      state: {
        sessionId: instance.id,
        messages: [],
        loopCount: 0,
        isRunning: true,
        pendingApproval: null,
        pendingPromotion: null,
        consecutiveMalformed: 0,
        sandboxGranted: true, // Workflow actions are pre-approved by template
        createdAt: instance.createdAt,
        lastActivityAt: Date.now(),
        totalTokensUsed: 0,
        totalActionsExecuted: 0,
        compressionCount: 0,
        aborted: false,
        iterationBudget: 100,
      },
    };
  }

  private createInstance(
    template: WorkflowTemplate,
    variables: Record<string, string>,
    triggerMessage: string
  ): WorkflowInstance {
    return {
      id: `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      templateId: template.id,
      templateName: template.name,
      status: "running",
      variables: { ...variables },
      steps: [],
      currentStepIndex: 0,
      createdAt: Date.now(),
      startedAt: Date.now(),
      triggerMessage,
      summary: `Workflow: ${template.name}\n`,
    };
  }

  private emitStepUpdate(
    instance: WorkflowInstance,
    stepIndex: number,
    stepName: string,
    status: WorkflowStepStatus,
    percent?: number,
    detail?: string
  ): void {
    this.hudEmitter("workflow_step_update", {
      workflowId: instance.id,
      stepIndex,
      stepName,
      stepStatus: status,
      totalSteps: instance.steps.length || 1,
      detail,
      percent,
    });

    if (status === "running" || status === "waiting_brain") {
      this.hudEmitter("bg_activity", {
        id: `${instance.id}_step${stepIndex}`,
        action: `workflow:${instance.templateId}`,
        status: status === "waiting_brain" ? "running" : "started",
        detail: detail || `Step: ${stepName}`,
      });
    } else if (status === "completed") {
      this.hudEmitter("bg_activity", {
        id: `${instance.id}_step${stepIndex}`,
        action: `workflow:${instance.templateId}`,
        status: "completed",
        detail: `Step done: ${stepName}`,
      });
    }
  }

  /**
   * Extract variable values from a user message using simple heuristics.
   * For example, if the template has a "projectPath" variable and the
   * message contains a file path, extract it.
   */
  private extractVariables(
    template: WorkflowTemplate,
    message: string
  ): Record<string, string> {
    const vars: Record<string, string> = {};
    if (!template.variables) return vars;

    for (const v of template.variables) {
      // Try common extraction patterns
      // File paths: anything that looks like a path
      if (v.name.toLowerCase().includes("path") || v.name.toLowerCase().includes("dir")) {
        const pathMatch = message.match(/(?:at |in |to |from )([\w\/.\-~]+)/);
        if (pathMatch) { vars[v.name] = pathMatch[1]; continue; }
      }

      // URLs
      if (v.name.toLowerCase().includes("url") || v.name.toLowerCase().includes("link")) {
        const urlMatch = message.match(/(https?:\/\/[\S]+)/);
        if (urlMatch) { vars[v.name] = urlMatch[1]; continue; }
      }

      // Names: quoted strings
      if (v.name.toLowerCase().includes("name")) {
        const nameMatch = message.match(/["']([^"']+)["']/);
        if (nameMatch) { vars[v.name] = nameMatch[1]; continue; }
        // Also try "called X" or "named X"
        const calledMatch = message.match(/(?:called|named)\s+(\w+)/i);
        if (calledMatch) { vars[v.name] = calledMatch[1]; continue; }
      }

      // Use default if available
      if (v.default) vars[v.name] = v.default;
    }

    return vars;
  }

  /** Replace {{variable}} placeholders in action params. */
  private interpolateParams(
    params: Record<string, unknown>,
    variables: Record<string, string>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
        result[key] = value.replace(/\{\{(\w+)\}\}/g, (_, varName) => variables[varName] ?? `{{${varName}}}`);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  // ─── Private: Template Loading ───────────────────────────────────────────

  private async loadBuiltinTemplates(): Promise<WorkflowTemplate[]> {
    try {
      const { getBuiltinTemplates } = await import("./workflows/builtin.js");
      return getBuiltinTemplates();
    } catch {
      log.warn("No builtin workflow templates found");
      return [];
    }
  }

  private async loadDiskTemplates(): Promise<WorkflowTemplate[]> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const templates: WorkflowTemplate[] = [];

    try {
      await fs.mkdir(this.config.templatesDir, { recursive: true });
      const files = await fs.readdir(this.config.templatesDir);
      const jsonFiles = files.filter(f => f.endsWith(".json"));

      for (const file of jsonFiles) {
        try {
          const raw = await fs.readFile(path.join(this.config.templatesDir, file), "utf-8");
          const parsed = JSON.parse(raw);
          // Basic validation
          if (parsed.id && parsed.name && Array.isArray(parsed.steps)) {
            templates.push(parsed as WorkflowTemplate);
            log.info("Loaded workflow template from disk", { data: { file, id: parsed.id } });
          } else {
            log.warn("Invalid workflow template file", { data: { file } });
          }
        } catch (err) {
          log.warn("Failed to load workflow template", { data: { file, error: err instanceof Error ? err.message : err } });
        }
      }
    } catch {
      // Directory doesn't exist yet — not an error
    }

    return templates;
  }
}

// ─── Singleton accessor ─────────────────────────────────────────────────────

let _engine: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
  if (!_engine) {
    _engine = new WorkflowEngine();
  }
  return _engine;
}

export function initWorkflowEngine(config?: WorkflowEngineConfig): WorkflowEngine {
  _engine = new WorkflowEngine(config);
  return _engine;
}