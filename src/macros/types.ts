// ─── M.A.I. Macro System Types ─────────────────────────────────────────────
// Defines the type contracts for the user-defined macro/shortcut system.

/** Supported step types in a macro workflow */
export type MacroStepType = "message" | "action" | "delay" | "condition" | "loop";

/** Action execution status badge */
export type ActionStatus = "executed" | "blocked" | "pending";

/** A single step within a macro */
export interface MacroStep {
  /** The type of step to execute */
  type: MacroStepType;
  /** The content or payload for the step */
  content: string;
  /** Optional expression to evaluate (used by "condition" type) */
  condition?: string;
  /** Max iterations for loop type (default: 10) */
  maxIterations?: number;
}

/** A user-defined macro (one-word command that expands to a workflow) */
export interface Macro {
  /** Unique identifier */
  id: string;
  /** Trigger word, e.g. "deploy" */
  name: string;
  /** Human-readable description */
  description: string;
  /** Ordered steps to execute */
  steps: MacroStep[];
  /** Unix timestamp of creation */
  createdAt: number;
  /** Unix timestamp of last execution */
  lastRun?: number;
  /** Total number of times executed */
  runCount: number;
  /** Whether the macro is active */
  enabled: boolean;
  /** Organizational tags */
  tags: string[];
}

/** Result of a single step execution */
export interface StepResult {
  /** 1-based step index */
  step: number;
  /** Whether the step succeeded */
  success: boolean;
  /** Output text or error message */
  output: string;
  /** Duration in milliseconds */
  duration: number;
}

/** Full result of a macro execution */
export interface MacroResult {
  /** The macro that was executed */
  macroId: string;
  /** Whether the entire macro completed successfully */
  success: boolean;
  /** Per-step results */
  stepResults: StepResult[];
  /** Total execution time in milliseconds */
  totalDuration: number;
  /** Unix timestamp when execution completed */
  timestamp: number;
}

/** Filters for searching macro run history */
export interface MacroHistoryFilter {
  /** Filter to a specific macro */
  macroId?: string;
  /** Only successful runs */
  successOnly?: boolean;
  /** Only failed runs */
  failedOnly?: boolean;
  /** Minimum timestamp (inclusive) */
  from?: number;
  /** Maximum timestamp (inclusive) */
  to?: number;
  /** Maximum results to return */
  limit?: number;
}

/** Variables that can be substituted in macro steps */
export interface MacroVariables {
  [key: string]: string;
}

/** Parsed macro result from the markdown store format */
export interface ParsedMacroFile {
  name: string;
  description: string;
  tags: string[];
  enabled: boolean;
  steps: MacroStep[];
}
