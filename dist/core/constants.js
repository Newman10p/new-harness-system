"use strict";
// ─── M.A.I. Core Constants ────────────────────────────────────────────────────
// Central path constants — single place to change any brain-file location.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_SCHEDULED_TASKS = exports.MIN_TASK_INTERVAL_MS = exports.HTTP_TIMEOUT_MS = exports.LLM_MAX_TOKENS = exports.ACTION_TIMEOUT_MS = exports.MAX_LOOP_ITERATIONS = exports.SANDBOX_CONFIG_PATH = exports.CONVERSATION_INDEX_PATH = exports.MACRO_HISTORY_PATH = exports.MACROS_DIR = exports.EVENTS_DEADLETTER_PATH = exports.EVENTS_LOG_PATH = exports.NOTIFICATIONS_AUDIT_PATH = exports.NOTIFICATIONS_CONFIG_PATH = exports.ANALYTICS_EVENTS_PATH = exports.RELAY_CONNECTIONS_PATH = exports.TUNNEL_CONFIG_PATH = exports.AUTH_STATE_PATH = exports.DEVICE_SESSIONS_PATH = exports.GATEWAY_CONFIG_PATH = exports.PROACTIVE_RULES_PATH = exports.CIRCUIT_BREAKER_PATH = exports.RUNTIME_CONFIG_PATH = exports.EVALUATIONS_DIR = exports.BACKUPS_DIR = exports.LEARNED_PATTERNS_PATH = exports.SELF_IMPROVEMENTS_PATH = exports.LONG_TERM_MEMORY_PATH = exports.USER_PROFILE_PATH = exports.AUDIT_LOG_PATH = exports.SKILLS_DIR = exports.WORKFLOWS_DIR = exports.INBOX_PATH = exports.CONTEXT_PATH = exports.TOOLS_CATALOG_PATH = exports.POLICY_PATH = exports.IDENTITY_PATH = exports.AGENT_DIR = exports.PROJECT_ROOT = void 0;
const node_path_1 = __importDefault(require("node:path"));
exports.PROJECT_ROOT = process.cwd();
exports.AGENT_DIR = node_path_1.default.join(exports.PROJECT_ROOT, "agent");
exports.IDENTITY_PATH = node_path_1.default.join(exports.AGENT_DIR, "identity.md");
exports.POLICY_PATH = node_path_1.default.join(exports.AGENT_DIR, "policy.md");
exports.TOOLS_CATALOG_PATH = node_path_1.default.join(exports.AGENT_DIR, "tools", "catalog.md");
exports.CONTEXT_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "memory", "context.md");
exports.INBOX_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "inbox.md");
exports.WORKFLOWS_DIR = node_path_1.default.join(exports.PROJECT_ROOT, "workflows");
exports.SKILLS_DIR = node_path_1.default.join(exports.PROJECT_ROOT, "skills");
exports.AUDIT_LOG_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "audit.log.md");
// Intelligence & memory paths
exports.USER_PROFILE_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "memory", "user-profile.md");
exports.LONG_TERM_MEMORY_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "memory", "long-term.md");
exports.SELF_IMPROVEMENTS_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "memory", "self-improvements.md");
exports.LEARNED_PATTERNS_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "memory", "patterns.md");
exports.BACKUPS_DIR = node_path_1.default.join(exports.PROJECT_ROOT, "state", "backups");
exports.EVALUATIONS_DIR = node_path_1.default.join(exports.PROJECT_ROOT, "memory", "evaluations");
exports.RUNTIME_CONFIG_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "runtime-config.json");
exports.CIRCUIT_BREAKER_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "circuit-breaker.json");
exports.PROACTIVE_RULES_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "memory", "proactive-rules.md");
// Gateway paths
exports.GATEWAY_CONFIG_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "gateway-config.json");
exports.DEVICE_SESSIONS_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "device-sessions.json");
// Auth paths
exports.AUTH_STATE_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "auth.json");
// Network / tunnel paths
exports.TUNNEL_CONFIG_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "tunnel-config.json");
exports.RELAY_CONNECTIONS_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "relay-connections.jsonl");
// Analytics paths
exports.ANALYTICS_EVENTS_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "analytics-events.jsonl");
// Notifications paths
exports.NOTIFICATIONS_CONFIG_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "notifications-config.json");
exports.NOTIFICATIONS_AUDIT_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "notifications-audit.jsonl");
// Events mesh paths
exports.EVENTS_LOG_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "events-log.jsonl");
exports.EVENTS_DEADLETTER_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "events-deadletter.jsonl");
// Macros paths
exports.MACROS_DIR = node_path_1.default.join(exports.PROJECT_ROOT, "macros");
exports.MACRO_HISTORY_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "macro-runs.json");
// Conversation index
exports.CONVERSATION_INDEX_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "memory", "conversation-index.json");
// Sandbox paths
exports.SANDBOX_CONFIG_PATH = node_path_1.default.join(exports.PROJECT_ROOT, "state", "sandbox-config.json");
// Safety limits
exports.MAX_LOOP_ITERATIONS = 20;
exports.ACTION_TIMEOUT_MS = 60_000;
exports.LLM_MAX_TOKENS = 4096;
exports.HTTP_TIMEOUT_MS = 30_000;
exports.MIN_TASK_INTERVAL_MS = 60_000; // 1 minute minimum for scheduled tasks
exports.MAX_SCHEDULED_TASKS = 20;
//# sourceMappingURL=constants.js.map