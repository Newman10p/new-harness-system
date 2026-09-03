"use strict";
// ─── M.A.I. Context Assembler ───────────────────────────────────────────────
// Reads markdown "brain files" and assembles the system prompt + context
// payload that get injected into the LLM conversation.
//
// Architecture: All business logic (identity, policy, tools) lives in .md
// files, not hardcoded. The assembler just concatenates them with ───
// separators for the LLM to parse.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextAssembler = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const node_module_1 = require("node:module");
const constants_js_1 = require("./constants.js");
// Lazy-load UserModel (file may not exist yet)
const _require = (0, node_module_1.createRequire)(import.meta.url);
let _UserModel = null;
try {
    const mod = _require("./UserModel.js");
    _UserModel = mod.UserModel ?? mod.default ?? null;
}
catch { /* not yet created */ }
class ContextAssembler {
    /**
     * Build the system prompt from identity + policy body + tools catalog.
     * Policy frontmatter (YAML rules) is NOT included — only the human-readable
     * policy body, so the LLM understands intent, not enforcement mechanics.
     */
    static async assembleSystemPrompt(policyConfig) {
        const sections = [];
        // 1. Identity — who the agent is
        try {
            const identity = await promises_1.default.readFile(constants_js_1.IDENTITY_PATH, "utf-8");
            const parsed = (0, gray_matter_1.default)(identity);
            sections.push(parsed.content);
        }
        catch {
            sections.push("You are M.A.I., a helpful AI assistant.");
        }
        // 2. Policy body — rules and objectives (not the YAML frontmatter)
        try {
            const policy = await promises_1.default.readFile(constants_js_1.POLICY_PATH, "utf-8");
            const parsed = (0, gray_matter_1.default)(policy);
            if (parsed.content.trim()) {
                sections.push(parsed.content);
            }
        }
        catch {
            // No policy file — that's okay, PolicyEngine has fallback
        }
        // 3. Tools catalog — what actions are available
        try {
            const catalog = await promises_1.default.readFile(constants_js_1.TOOLS_CATALOG_PATH, "utf-8");
            const parsed = (0, gray_matter_1.default)(catalog);
            if (parsed.content.trim()) {
                sections.push(parsed.content);
            }
        }
        catch {
            // No catalog — actions will still be registered
        }
        // 4. Dynamic policy reminder — inject current deny/allow/approval rules
        //    so the LLM is aware of constraints even if it hasn't read the files
        if (policyConfig) {
            const reminders = [];
            if (policyConfig.deny_commands && policyConfig.deny_commands.length > 0) {
                reminders.push(`BLOCKED COMMANDS (never attempt): ${policyConfig.deny_commands.join(", ")}`);
            }
            if (policyConfig.allow_network &&
                policyConfig.allow_network.length > 0) {
                reminders.push(`ALLOWED NETWORK HOSTS: ${policyConfig.allow_network.join(", ")}`);
            }
            else if (policyConfig.allow_network === undefined) {
                reminders.push("NETWORK ACCESS: denied by default (empty allow_network)");
            }
            if (policyConfig.require_approval &&
                policyConfig.require_approval.length > 0) {
                reminders.push(`APPROVAL REQUIRED: ${policyConfig.require_approval.join(", ")}`);
            }
            if (reminders.length > 0) {
                sections.push("## Active Policy Constraints\n\n" + reminders.join("\n"));
            }
        }
        // 5. User profile (learned preferences from UserModel)
        if (_UserModel) {
            try {
                const userProfile = new _UserModel();
                const profileSummary = await userProfile.getProfileSummary();
                if (profileSummary) {
                    sections.push("## User Profile (Learned)\n\n" + profileSummary);
                }
            }
            catch { /* non-fatal */ }
        }
        return sections.join("\n\n---\n\n");
    }
    /**
     * Build the user-context payload from inbox + memory files.
     * These provide the LLM with real-time state: recent events,
     * user notes, accumulated context from prior loops.
     */
    static async assembleContextPayload() {
        const sections = [];
        // 1. Inbox — recent events (file watches, errors, notifications)
        try {
            const inbox = await promises_1.default.readFile(constants_js_1.INBOX_PATH, "utf-8");
            if (inbox.trim()) {
                sections.push("## Inbox (Recent Events)\n\n" + inbox.trim());
            }
        }
        catch {
            // No inbox yet
        }
        // 2. Context — long-term memory / accumulated context
        try {
            const context = await promises_1.default.readFile(constants_js_1.CONTEXT_PATH, "utf-8");
            if (context.trim()) {
                sections.push("## Memory (Accumulated Context)\n\n" + context.trim());
            }
        }
        catch {
            // No context yet
        }
        return sections.join("\n\n---\n\n");
    }
}
exports.ContextAssembler = ContextAssembler;
//# sourceMappingURL=ContextAssembler.js.map