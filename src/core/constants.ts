// ─── M.A.I. Core Constants ────────────────────────────────────────────────────
// Central path constants — single place to change any brain-file location.

import path from "node:path";

export const PROJECT_ROOT = process.cwd();
export const AGENT_DIR = path.join(PROJECT_ROOT, "agent");
export const IDENTITY_PATH = path.join(AGENT_DIR, "identity.md");
export const POLICY_PATH = path.join(AGENT_DIR, "policy.md");
export const TOOLS_CATALOG_PATH = path.join(AGENT_DIR, "tools", "catalog.md");
export const CONTEXT_PATH = path.join(PROJECT_ROOT, "memory", "context.md");
export const INBOX_PATH = path.join(PROJECT_ROOT, "state", "inbox.md");
export const WORKFLOWS_DIR = path.join(PROJECT_ROOT, "workflows");

// Safety limits
export const MAX_LOOP_ITERATIONS = 20;
export const ACTION_TIMEOUT_MS = 60_000;
export const LLM_MAX_TOKENS = 4096;
export const HTTP_TIMEOUT_MS = 30_000;
