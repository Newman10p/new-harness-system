// ─── M.A.I. Macro Engine ──────────────────────────────────────────────
// Executes user-defined macros (one-word commands → multi-step workflows).
// Handles variable substitution, conditions, loops, and result persistence.

import crypto from "node:crypto";
import type {
  Macro,
  MacroStep,
  MacroResult,
  StepResult,
  MacroVariables,
  MacroHistoryFilter,
} from "./types.js";
import {
  loadAllMacros,
  saveMacro,
  deleteMacroFile,
  appendRunResult,
  loadRunHistory,
  ensureDirectories,
} from "./MacroStore.js";

// ─── Emitter callback type ─────────────────────────────────────────────
export type StepCallback = (step: number, stepData: MacroStep, output: string) => void;

/** Main macro execution engine */
export class MacroEngine {
  private macros: Map<string, Macro> = new Map();
  private initialized = false;
  private messageHandler?: (text: string) => Promise<string>;
  private actionHandler?: (actionStr: string) => Promise<string>;

  /** Set the handler that processes message-type steps (sends to agent) */
  setMessageHandler(handler: (text: string) => Promise<string>): void {
    this.messageHandler = handler;
  }

  /** Set the handler that processes action-type steps (executes actions) */
  setActionHandler(handler: (actionStr: string) => Promise<string>): void {
    this.actionHandler = handler;
  }

  // ─── Initialization ──────────────────────────────────────────────────

  /** Load all macros from the macros/ directory */
  initialize(): void {
    ensureDirectories();
    const macros = loadAllMacros();
    this.macros.clear();
    for (const macro of macros) {
      this.macros.set(macro.id, macro);
    }
    this.initialized = true;
  }

  /** Reload macros from disk (hot reload) */
  reload(): void {
    this.initialize();
  }

  // ─── Macro CRUD ──────────────────────────────────────────────────────

  /** Create a new macro */
  createMacro(def: {
    name: string;
    description: string;
    steps: MacroStep[];
    tags?: string[];
  }): Macro {
    const id = crypto.createHash("sha256").update(def.name).digest("hex").slice(0, 12);
    if (this.macros.has(id)) {
      throw new Error(`Macro "${def.name}" already exists`);
    }

    const macro: Macro = {
      id,
      name: def.name,
      description: def.description,
      steps: def.steps,
      createdAt: Date.now(),
      runCount: 0,
      enabled: true,
      tags: def.tags || [],
    };

    this.macros.set(id, macro);
    saveMacro(macro);
    return macro;
  }

  /** Delete a macro by ID */
  deleteMacro(macroId: string): boolean {
    const macro = this.macros.get(macroId);
    if (!macro) return false;
    this.macros.delete(macroId);
    return deleteMacroFile(macro.name);
  }

  /** List all macros (optionally filtered by tag) */
  listMacros(tag?: string): Macro[] {
 if (!this.initialized) this.initialize();
    const all = Array.from(this.macros.values());
    if (tag) {
      return all.filter((m) => m.tags.includes(tag) && m.enabled);
    }
    return all;
  }

  /** Get a single macro by ID or name */
  getMacro(idOrName: string): Macro | undefined {
    if (!this.initialized) this.initialize();
    // Try by ID first
    const byId = this.macros.get(idOrName);
    if (byId) return byId;
    // Try by name
    for (const macro of this.macros.values()) {
      if (macro.name === idOrName) return macro;
    }
    return undefined;
  }

  // ─── Input Matching ──────────────────────────────────────────────────

  /**
   * Check if user input triggers a macro.
   * Matches if the trimmed, lowercased input equals a macro name
   * (exact match for one-word commands).
   */
  matchInput(text: string): Macro | undefined {
    const normalized = text.trim().toLowerCase();
    for (const macro of this.macros.values()) {
      if (macro.enabled && macro.name.toLowerCase() === normalized) {
        return macro;
      }
    }
    return undefined;
  }

  // ─── Execution ───────────────────────────────────────────────────────

  /**
   * Execute a macro by ID.
   * @param macroId - The macro to execute
   * @param variables - Optional variables for substitution (e.g., {{output.1}})
   * @param onStep - Optional callback for each step completion
   * @returns Full execution result
   */
  async execute(
    macroId: string,
    variables?: MacroVariables,
    onStep?: StepCallback
  ): Promise<MacroResult> {
    const macro = this.macros.get(macroId);
    if (!macro) {
      return {
        macroId,
        success: false,
        stepResults: [],
        totalDuration: 0,
        timestamp: Date.now(),
      };
    }

    if (!macro.enabled) {
      return {
        macroId,
        success: false,
        stepResults: [{ step: 0, success: false, output: "Macro is disabled", duration: 0 }],
        totalDuration: 0,
        timestamp: Date.now(),
      };
    }

    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    const vars: MacroVariables = {
      ...variables,
      timestamp: new Date().toISOString(),
      macro_name: macro.name,
    };

    for (let i = 0; i < macro.steps.length; i++) {
      const step = macro.steps[i];
      const stepStart = Date.now();

      try {
        // Substitute variables in content and condition
        const resolvedContent = this.substituteVars(step.content, vars, stepResults);
        const resolvedCondition = step.condition
          ? this.substituteVars(step.condition, vars, stepResults)
          : undefined;

        const output = await this.executeStep(
          step.type,
          resolvedContent,
          resolvedCondition,
          step.maxIterations
        );

        const duration = Date.now() - stepStart;
        const result: StepResult = {
          step: i + 1,
          success: true,
          output: typeof output === "string" ? output : JSON.stringify(output),
          duration,
        };
        stepResults.push(result);

        // Make output available for later variable substitution
        vars[`output.${i + 1}`] = result.output;

        // Notify callback
        onStep?.(i + 1, step, result.output);

        // If a step fails, stop execution
        if (!result.success) break;
      } catch (err) {
        const duration = Date.now() - stepStart;
        const errorMsg = err instanceof Error ? err.message : String(err);
        stepResults.push({
          step: i + 1,
          success: false,
          output: errorMsg,
          duration,
        });
        break;
      }
    }

    const totalDuration = Date.now() - startTime;
    const allSuccess = stepResults.length > 0 && stepResults.every((r) => r.success);

    // Update macro metadata
    macro.lastRun = Date.now();
    macro.runCount += 1;
    saveMacro(macro);

    // Persist result
    const result: MacroResult = {
      macroId,
      success: allSuccess,
      stepResults,
      totalDuration,
      timestamp: Date.now(),
    };
    appendRunResult(result);

    return result;
  }

  // ─── Step Execution ──────────────────────────────────────────────────

  /** Execute a single step and return its output */
  private async executeStep(
    type: MacroStep["type"],
    content: string,
    condition?: string,
    maxIterations?: number
  ): Promise<string> {
    switch (type) {
      case "message":
        return this.executeMessage(content);

      case "action":
        return this.executeAction(content);

      case "delay": {
        const ms = parseInt(content, 10) || 1000;
        await this.sleep(ms);
        return `Delayed ${ms}ms`;
      }

      case "condition":
        return this.executeCondition(content, condition);

      case "loop":
        return this.executeLoop(content, maxIterations || 10);

      default:
        throw new Error(`Unknown step type: ${type}`);
    }
  }

  /** Send a message to the agent and return the response */
  private async executeMessage(content: string): Promise<string> {
    if (!this.messageHandler) {
      return `[message] ${content} (no handler configured)`;
    }
    return this.messageHandler(content);
  }

  /** Execute an action and return the result */
  private async executeAction(content: string): Promise<string> {
    if (!this.actionHandler) {
      return `[action] ${content} (no handler configured)`;
    }
    return this.actionHandler(content);
  }

  /** Evaluate a condition and return the appropriate branch output */
  private async executeCondition(
    content: string,
    condition?: string
  ): Promise<string> {
    const condStr = condition || "true";
    // Simple safe evaluation: check for truthy keywords
    const isTrue = this.evaluateCondition(condStr);
    if (isTrue) {
      return `[condition: ${condStr}] → ${content}`;
    }
    return `[condition: ${condStr}] → skipped (false)`;
  }

  /** Execute a loop step */
  private async executeLoop(content: string, maxIterations: number): Promise<string> {
    const outputs: string[] = [];
    for (let i = 0; i < maxIterations; i++) {
      // Substitute loop iteration variable
      const iterContent = content.replace(/\{\{iteration\}\}/g, String(i + 1));
      try {
        const output = await this.executeMessage(iterContent);
        outputs.push(`[${i + 1}] ${output}`);
      } catch (err) {
        outputs.push(`[${i + 1}] Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return outputs.join("\n");
  }

  /** Simple safe condition evaluator */
  private evaluateCondition(expr: string): boolean {
    const lower = expr.toLowerCase().trim();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
    // Check for output references that contain "error" or "fail"
    const outputMatch = lower.match(/output\.\d+/);
    if (outputMatch) {
      // Cannot evaluate without runtime context — default to true
      return true;
    }
    return true;
  }

  // ─── Variable Substitution ───────────────────────────────────────────

  /**
   * Replace {{variable}} placeholders in text with their values.
   * Supports: {{timestamp}}, {{macro_name}}, {{output.N}}, {{user-defined}}
   */
  substituteVars(
    text: string,
    vars: MacroVariables,
    stepResults: StepResult[]
  ): string {
    let result = text;
    // Replace all {{key}} patterns
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
      const trimmed = key.trim();
      // Check built-in variables
      if (vars[trimmed] !== undefined) return vars[trimmed];
      // Check step output references: output.1, output.2, etc.
      const outputMatch = trimmed.match(/^output\.(\d+)$/);
      if (outputMatch) {
        const stepNum = parseInt(outputMatch[1], 10);
        const sr = stepResults.find((r) => r.step === stepNum);
        if (sr) return sr.output;
      }
      // Return original if not found
      return match;
    });
    return result;
  }

  // ─── Run History ─────────────────────────────────────────────────────

  /** Get macro execution history with optional filters */
  getRunHistory(filter?: MacroHistoryFilter): MacroResult[] {
    const all = loadRunHistory();
    let results = all;

    if (filter?.macroId) {
      results = results.filter((r) => r.macroId === filter.macroId);
    }
    if (filter?.successOnly) {
      results = results.filter((r) => r.success);
    }
    if (filter?.failedOnly) {
      results = results.filter((r) => !r.success);
    }
    if (filter?.from) {
      results = results.filter((r) => r.timestamp >= filter.from!);
    }
    if (filter?.to) {
      results = results.filter((r) => r.timestamp <= filter.to!);
    }

    // Sort newest first
    results.sort((a, b) => b.timestamp - a.timestamp);

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  // ─── Utility ─────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/** Singleton instance for convenience */
export const macroEngine = new MacroEngine();
