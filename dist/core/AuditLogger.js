"use strict";
// ─── M.A.I. Audit Logger ───────────────────────────────────────────────────
// Persistent append-only audit log of all significant system events.
// Written as markdown for human readability + git-trackability.
//
// Log entries are appended to state/audit.log.md with timestamps.
// Capped at 2000 entries to prevent unbounded growth.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAuditLog = initAuditLog;
exports.readAuditLog = readAuditLog;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const constants_js_1 = require("../core/constants.js");
const MAX_ENTRIES = 2000;
const TRIM_TO = 1500;
let lineCount = 0;
/**
 * Initialize the audit log. Reads existing file to count lines.
 */
async function initAuditLog() {
    try {
        const content = await promises_1.default.readFile(constants_js_1.AUDIT_LOG_PATH, "utf-8");
        lineCount = content.split("\n").filter((l) => l.trim()).length;
    }
    catch {
        lineCount = 0;
    }
    return auditLog;
}
/**
 * Write an audit entry to the persistent log.
 * Each entry is a single markdown-formatted line.
 */
async function auditLog(entry) {
    const typeIcons = {
        action_executed: "✓",
        action_blocked: "🚫",
        action_approved: "✓ APPROVED",
        action_denied: "✗ DENIED",
        action_timeout: "⏱ TIMEOUT",
        llm_call: "→",
        llm_error: "⚠ LLM ERROR",
        policy_loaded: "📋",
    };
    const ts = entry.timestamp ?? new Date().toISOString();
    const icon = typeIcons[entry.type] ?? "•";
    const duration = entry.durationMs ? ` (${Math.round(entry.durationMs)}ms)` : "";
    const status = entry.ok === true ? "" : entry.ok === false ? " [FAILED]" : "";
    const actionTag = entry.action ? ` [${entry.action}]` : "";
    const line = `- [${ts}] ${icon}${actionTag}${status} ${entry.detail}${duration}\n`;
    try {
        await promises_1.default.mkdir(node_path_1.default.dirname(constants_js_1.AUDIT_LOG_PATH), { recursive: true });
        await promises_1.default.appendFile(constants_js_1.AUDIT_LOG_PATH, line, "utf-8");
        lineCount++;
        // Trim if too long
        if (lineCount > MAX_ENTRIES) {
            const content = await promises_1.default.readFile(constants_js_1.AUDIT_LOG_PATH, "utf-8");
            const lines = content.split("\n");
            const trimmed = lines.slice(lines.length - TRIM_TO).join("\n");
            await promises_1.default.writeFile(constants_js_1.AUDIT_LOG_PATH, trimmed, "utf-8");
            lineCount = TRIM_TO;
        }
    }
    catch {
        // Audit logging should never crash the system
    }
}
/**
 * Read the last N entries from the audit log.
 */
async function readAuditLog(n = 50) {
    try {
        const content = await promises_1.default.readFile(constants_js_1.AUDIT_LOG_PATH, "utf-8");
        const lines = content.trim().split("\n").filter((l) => l.trim());
        return lines.slice(-n).join("\n");
    }
    catch {
        return "(no audit entries)";
    }
}
//# sourceMappingURL=AuditLogger.js.map