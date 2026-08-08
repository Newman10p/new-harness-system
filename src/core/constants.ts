// ─── M.A.I. Core Constants ────────────────────────────────────────────────────
// Central path constants — single place to change any brain-file location.

import path from "node:path";

export const PROJECT_ROOT = process.cwd();
export const AGENT_DIR = path.join(PROJECT_ROOT, "agent");
export const IDENTITY_PATH = path.join(AGENT_DIR, "identity.md");
export const POLICY_PATH = path.join(AGENT_DIR, "policy.md");
export const TOOLS_CATALOG_PATH = path.join(AGENT_DIR, "tools", "catalog.md");
export const DESIGN_SKILL_PATH = path.join(AGENT_DIR, "skills", "design-system.md");
export const CONTEXT_PATH = path.join(PROJECT_ROOT, "memory", "context.md");
export const INBOX_PATH = path.join(PROJECT_ROOT, "state", "inbox.md");
export const WORKFLOWS_DIR = path.join(PROJECT_ROOT, "workflows");
export const SKILLS_DIR = path.join(PROJECT_ROOT, "skills");
export const AUDIT_LOG_PATH = path.join(PROJECT_ROOT, "state", "audit.log.md");

// Intelligence & memory paths
export const USER_PROFILE_PATH = path.join(PROJECT_ROOT, "memory", "user-profile.md");
export const LONG_TERM_MEMORY_PATH = path.join(PROJECT_ROOT, "memory", "long-term.md");
export const SELF_IMPROVEMENTS_PATH = path.join(PROJECT_ROOT, "memory", "self-improvements.md");
export const LEARNED_PATTERNS_PATH = path.join(PROJECT_ROOT, "memory", "patterns.md");
export const BACKUPS_DIR = path.join(PROJECT_ROOT, "state", "backups");
export const EVALUATIONS_DIR = path.join(PROJECT_ROOT, "memory", "evaluations");
export const RUNTIME_CONFIG_PATH = path.join(PROJECT_ROOT, "state", "runtime-config.json");
export const CIRCUIT_BREAKER_PATH = path.join(PROJECT_ROOT, "state", "circuit-breaker.json");
export const PROACTIVE_RULES_PATH = path.join(PROJECT_ROOT, "memory", "proactive-rules.md");

// Gateway paths
export const GATEWAY_CONFIG_PATH = path.join(PROJECT_ROOT, "state", "gateway-config.json");
export const DEVICE_SESSIONS_PATH = path.join(PROJECT_ROOT, "state", "device-sessions.json");

// Auth paths
export const AUTH_STATE_PATH = path.join(PROJECT_ROOT, "state", "auth.json");

// Network / tunnel paths
export const TUNNEL_CONFIG_PATH = path.join(PROJECT_ROOT, "state", "tunnel-config.json");
export const RELAY_CONNECTIONS_PATH = path.join(PROJECT_ROOT, "state", "relay-connections.jsonl");

// Analytics paths
export const ANALYTICS_EVENTS_PATH = path.join(PROJECT_ROOT, "state", "analytics-events.jsonl");

// Notifications paths
export const NOTIFICATIONS_CONFIG_PATH = path.join(PROJECT_ROOT, "state", "notifications-config.json");
export const NOTIFICATIONS_AUDIT_PATH = path.join(PROJECT_ROOT, "state", "notifications-audit.jsonl");

// Events mesh paths
export const EVENTS_LOG_PATH = path.join(PROJECT_ROOT, "state", "events-log.jsonl");
export const EVENTS_DEADLETTER_PATH = path.join(PROJECT_ROOT, "state", "events-deadletter.jsonl");

// Macros paths
export const MACROS_DIR = path.join(PROJECT_ROOT, "macros");
export const MACRO_HISTORY_PATH = path.join(PROJECT_ROOT, "state", "macro-runs.json");

// Conversation index
export const CONVERSATION_INDEX_PATH = path.join(PROJECT_ROOT, "memory", "conversation-index.json");

// Sandbox paths
export const SANDBOX_CONFIG_PATH = path.join(PROJECT_ROOT, "state", "sandbox-config.json");

// Safety limits
export const MAX_LOOP_ITERATIONS = 8;
export const ACTION_TIMEOUT_MS = 60_000;
export const LLM_MAX_TOKENS = 4096;
export const HTTP_TIMEOUT_MS = 30_000;
export const MIN_TASK_INTERVAL_MS = 60_000; // 1 minute minimum for scheduled tasks
export const MAX_SCHEDULED_TASKS = 20;
