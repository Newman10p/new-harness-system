// ─── M.A.I. Sandbox Types ─────────────────────────────────────────────
// Type definitions for the sandbox/replay system.
// Provides dry-run mode for testing dangerous commands safely.

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Sandbox configuration controls how commands are isolated.
 */
export interface SandboxConfig {
  /** Whether the sandbox is enabled */
  enabled: boolean;
  /** Isolation method: docker for full isolation, process for lightweight, simulation for pure prediction */
  method: "docker" | "process" | "simulation";
  /** Maximum execution time in milliseconds */
  timeoutMs: number;
  /** Maximum memory in megabytes (process method only) */
  memoryLimitMb: number;
  /** Whether the sandbox has network access (docker method only) */
  networkAccess: boolean;
}

// ─── Dry Run Result ─────────────────────────────────────────────────────────

/**
 * Result of a dry-run (simulated) command execution.
 */
export interface DryRunResult {
  /** The original action/command that was simulated */
  originalAction: string;
  /** Whether the command was simulated (always true for dry-run) */
  simulated: boolean;
  /** Whether the command would likely succeed */
  wouldSucceed: boolean;
  /** Predicted or captured output */
  output: string;
  /** List of predicted side effects */
  sideEffects: string[];
  /** Warnings about potentially dangerous operations */
  warnings: string[];
  /** How long the simulation took */
  duration: number;
}

// ─── Sandbox Execution Result ───────────────────────────────────────────────

/**
 * Result of an actual sandboxed command execution.
 */
export interface SandboxResult {
  /** The command that was executed */
  command: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Captured stdout */
  stdout: string;
  /** Captured stderr */
  stderr: string;
  /** Exit code */
  exitCode: number | null;
  /** Execution duration in ms */
  durationMs: number;
  /** Whether the command was killed by timeout */
  timedOut: boolean;
  /** Method used for isolation */
  method: "docker" | "process" | "simulation";
}

// ─── Side Effect Analysis ──────────────────────────────────────────────────

export type SideEffectCategory =
  | "file_write"
  | "file_delete"
  | "file_read"
  | "network_outbound"
  | "network_inbound"
  | "process_spawn"
  | "process_kill"
  | "system_config"
  | "package_install"
  | "environment_modify"
  | "unknown";

/**
 * An analyzed side effect from a command.
 */
export interface SideEffect {
  category: SideEffectCategory;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  targets: string[];
}

/**
 * Complete side effect analysis result.
 */
export interface SideEffectReport {
  command: string;
  effects: SideEffect[];
  hasCriticalEffects: boolean;
  riskScore: number; // 0-100
}
