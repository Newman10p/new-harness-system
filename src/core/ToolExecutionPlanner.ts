// ─── M.A.I. Tool Execution Planner ──────────────────────────────────────────
// Adapted from Hermes Agent: execute_tool_calls_concurrent() segmentation logic
//
// Plans parallel execution of independent tool calls while serializing
// destructive operations. Rules:
//
//   1. Destructive actions (write-file, append-file, sandbox-execute, etc.)
//      are NEVER parallelized — each gets its own group.
//   2. Read-only actions (read-file, list-directory, search-files, etc.)
//      are grouped together and run in parallel.
//   3. Each group is bounded by maxParallelTools config.
//   4. Actions that touch the same file path are always in the same group.

import type { Action, ActionName, ToolExecutionPlan, ToolExecutionGroup, AgentLoopConfig } from "../types/index.js";
import { DEFAULT_LOOP_CONFIG } from "../types/index.js";

// Actions considered destructive — must run sequentially, one per group.
const DESTRUCTIVE_ACTIONS: ReadonlySet<ActionName> = new Set([
  "write-file",
  "append-file",
  "sandbox-execute",
  "execute-terminal",
  "manage-processes",
  "control-window",
  "input-inject",
  "system-setting",
  "device-control",
  "ui-adapt",
  "browser-control",
  "email-access",
  "self-modify",
  "self-repair",
  "rollback",
  "adaptive-config",
]);

// Actions that are always safe to parallelize (read-only, no side effects).
const READ_ONLY_ACTIONS: ReadonlySet<ActionName> = new Set([
  "read-file",
  "list-directory",
  "list-files-detailed",
  "search-files",
  "get-system-info",
  "get-process-list",
  "get-gpu-info",
  "get-network-info",
  "clipboard-read",
  "screenshot-capture",
  "semantic-recall",
  "recall",
  "self-evaluate",
  "self-diagnose",
  "dry-run",
  "search-conversations",
  "web-search",
  "web-scrape",
  "analyze-image",
  "get-network-info",
]);

/**
 * Extract file paths from an action for conflict detection.
 * Returns an array of absolute paths this action touches.
 */
function extractFilePaths(action: Action): string[] {
  const paths: string[] = [];
  const candidates = [
    action.path as string | undefined,
    action.file as string | undefined,
    action.filePath as string | undefined,
    action.target as string | undefined,
    action.dir as string | undefined,
    action.directory as string | undefined,
  ];
  for (const p of candidates) {
    if (p && typeof p === "string" && p.length > 0) {
      paths.push(p);
    }
  }
  return paths;
}

/**
 * Plan the execution of multiple tool calls, grouping by safety rules.
 *
 * Strategy:
 * - Destructive actions → one per group (sequential)
 * - Read-only actions → batched into parallel groups (bounded by maxParallelTools)
 * - Actions touching the same path → same group (serialized via mutation queue)
 * - Unknown actions → treated as destructive (conservative)
 */
export function planToolExecution(
  actions: Array<{ action: Action; index: number }>,
  config: AgentLoopConfig = DEFAULT_LOOP_CONFIG
): ToolExecutionPlan {
  if (!config.parallelTools || actions.length <= 1) {
    // No parallelism — everything sequential
    return {
      groups: actions.map(({ action, index }) => ({
        actions: [{ action, index }],
        isDestructive: true, // Treat as destructive so each runs alone
      })),
    };
  }

  const groups: ToolExecutionGroup[] = [];
  const pathToGroupIndex = new Map<string, number>();
  let readOnlyBuffer: Array<{ action: Action; index: number }> = [];

  const flushReadOnly = () => {
    if (readOnlyBuffer.length === 0) return;
    // Split into chunks of maxParallelTools
    for (let i = 0; i < readOnlyBuffer.length; i += config.maxParallelTools) {
      const chunk = readOnlyBuffer.slice(i, i + config.maxParallelTools);
      groups.push({
        actions: chunk,
        isDestructive: false,
      });
    }
    readOnlyBuffer = [];
  };

  for (const { action, index } of actions) {
    const isDestructive = DESTRUCTIVE_ACTIONS.has(action.action);
    const isReadOnly = READ_ONLY_ACTIONS.has(action.action);
    const filePaths = extractFilePaths(action);

    // Check if any file path conflicts with an existing group
    let conflictingGroup = -1;
    for (const fp of filePaths) {
      const existingGroup = pathToGroupIndex.get(fp);
      if (existingGroup !== undefined) {
        conflictingGroup = existingGroup;
        break;
      }
    }

    if (conflictingGroup >= 0) {
      // Same-file conflict — add to existing group
      flushReadOnly();
      groups[conflictingGroup].actions.push({ action, index });
    } else if (isDestructive || !isReadOnly) {
      // Destructive or unknown — flush read-only buffer, add to own group
      flushReadOnly();
      const groupIndex = groups.length;
      groups.push({
        actions: [{ action, index }],
        isDestructive: true,
      });
      for (const fp of filePaths) {
        pathToGroupIndex.set(fp, groupIndex);
      }
    } else {
      // Read-only — buffer for parallel execution
      readOnlyBuffer.push({ action, index });
    }
  }

  flushReadOnly();
  return { groups };
}

/** Check if an action is considered destructive. */
export function isDestructiveAction(action: ActionName): boolean {
  return DESTRUCTIVE_ACTIONS.has(action);
}

/** Check if an action is read-only. */
export function isReadOnlyAction(action: ActionName): boolean {
  return READ_ONLY_ACTIONS.has(action);
}
