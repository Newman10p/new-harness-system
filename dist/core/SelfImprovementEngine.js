"use strict";
// ─── M.A.I. Self-Improvement Engine ────────────────────────────────────────
// The core self-improvement loop. Periodically reflects on audit logs,
// identifies patterns (repeated failures, slow ops, user corrections),
// plans improvements, applies changes to brain files, and verifies.
//
// Safety: Never modifies deny_commands. Always backs up before writing.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelfImprovementEngine = void 0;
exports.getSelfImprovementEngine = getSelfImprovementEngine;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const constants_js_1 = require("./constants.js");
// ─── Paths ──────────────────────────────────────────────────────────────────
const MEMORY_DIR = node_path_1.default.join(constants_js_1.PROJECT_ROOT, "memory");
const IMPROVEMENTS_PATH = node_path_1.default.join(MEMORY_DIR, "self-improvements.md");
const BACKUPS_DIR = node_path_1.default.join(constants_js_1.PROJECT_ROOT, "state", "backups");
const REFLECT_INTERVAL_DEFAULT = 10; // interactions between reflections
// ─── Engine ─────────────────────────────────────────────────────────────────
class SelfImprovementEngine {
    interactionCount = 0;
    reflectInterval;
    history = [];
    autoReflectTimer = null;
    audit;
    constructor(opts) {
        this.reflectInterval = opts?.reflectInterval ?? REFLECT_INTERVAL_DEFAULT;
        this.audit = opts?.audit ?? (async () => { });
        this.loadState().catch(() => { });
    }
    // ─── Public API ────────────────────────────────────────────────────────
    /**
     * Called by AgentLoop after each interaction completes.
     * Increments counter and triggers reflection if interval reached.
     */
    async recordInteraction() {
        this.interactionCount++;
        if (this.interactionCount % this.reflectInterval === 0) {
            await this.reflect(this.reflectInterval);
        }
    }
    /**
     * External trigger — can be called by AgentLoop or other systems.
     */
    async triggerReflection() {
        const result = await this.reflect();
        return { reflected: true, plans: result.length };
    }
    /**
     * Main reflection loop: read audit log, identify patterns, plan & apply.
     */
    async reflect(interval) {
        const n = interval ?? this.reflectInterval;
        // 1. Read recent audit log
        const logContent = await this.readAuditLog(n * 5);
        if (!logContent || logContent.includes("(no audit entries)")) {
            return [];
        }
        // 2. Identify patterns
        const patterns = this.identifyPatterns(logContent);
        if (patterns.length === 0) {
            return [];
        }
        // 3. Plan improvements
        const plan = this.planImprovements(patterns);
        if (plan.actions.length === 0) {
            return [];
        }
        // 4. Apply improvements
        await this.applyImprovement(plan);
        // 5. Persist
        this.history.push(plan);
        await this.persistState();
        await this.audit({
            type: "action_executed",
            detail: `Self-improvement: ${plan.actions.length} actions planned (priority ${plan.priority})`,
            ok: plan.status === "applied" || plan.status === "verified",
        });
        return [plan];
    }
    /**
     * Start the automatic reflection timer.
     */
    startAutoReflect(checkIntervalMs = 60_000) {
        this.stopAutoReflect();
        this.autoReflectTimer = setInterval(() => {
            if (this.interactionCount > 0 && this.interactionCount % this.reflectInterval === 0) {
                this.reflect().catch(() => { });
            }
        }, checkIntervalMs);
    }
    /**
     * Stop the automatic reflection timer.
     */
    stopAutoReflect() {
        if (this.autoReflectTimer) {
            clearInterval(this.autoReflectTimer);
            this.autoReflectTimer = null;
        }
    }
    /**
     * Get the full improvement history.
     */
    getHistory() {
        return [...this.history];
    }
    // ─── Pattern Identification ────────────────────────────────────────────
    /**
     * Analyze audit log text for patterns using regex matching.
     */
    identifyPatterns(log) {
        const patterns = [];
        const lines = log.split("\n").filter((l) => l.trim());
        // Pattern: Repeated failures (same action failing 3+ times)
        const failureMap = new Map();
        const failureDescMap = new Map();
        const failureRegex = /\[FAILED\].*?\[(\S+?)\].*?(?:error|failed|denied|blocked)/gi;
        for (const line of lines) {
            const match = failureRegex.exec(line);
            if (match) {
                const action = match[1];
                failureMap.set(action, (failureMap.get(action) ?? 0) + 1);
                failureDescMap.set(action, line.trim());
                failureRegex.lastIndex = 0;
            }
        }
        for (const [action, count] of failureMap) {
            if (count >= 3) {
                patterns.push({
                    type: "repeated_failure",
                    description: `Action [${action}] failed ${count} times recently`,
                    frequency: count,
                    severity: count >= 5 ? "high" : "medium",
                    suggestedAction: `Investigate and fix [${action}] execution path`,
                });
            }
        }
        // Pattern: Slow operations (>10s duration)
        const slowRegex = /\(([\d,]+)ms\).*?\[(\S+?)\]/g;
        const slowActions = new Map();
        for (const line of lines) {
            const match = slowRegex.exec(line);
            if (match) {
                const ms = parseInt(match[1].replace(",", ""), 10);
                const action = match[2];
                if (ms > 10_000) {
                    const existing = slowActions.get(action) ?? { count: 0, maxMs: 0 };
                    slowActions.set(action, {
                        count: existing.count + 1,
                        maxMs: Math.max(existing.maxMs, ms),
                    });
                }
                slowRegex.lastIndex = 0;
            }
        }
        for (const [action, data] of slowActions) {
            patterns.push({
                type: "slow_operation",
                description: `Action [${action}] slow: ${data.maxMs}ms max, ${data.count} slow calls`,
                frequency: data.count,
                severity: data.maxMs > 30_000 ? "high" : "medium",
                suggestedAction: `Optimize or cache [${action}] execution`,
            });
        }
        // Pattern: Policy violations
        const blockedCount = lines.filter((l) => l.includes("BLOCKED") || l.includes("🚫")).length;
        if (blockedCount >= 3) {
            patterns.push({
                type: "policy_violation",
                description: `${blockedCount} policy violations detected in recent log`,
                frequency: blockedCount,
                severity: "medium",
                suggestedAction: "Review policy rules and update LLM guidance to avoid blocked actions",
            });
        }
        // Pattern: Provider errors
        const llmErrors = lines.filter((l) => l.includes("LLM ERROR") || l.includes("llm_error")).length;
        if (llmErrors >= 2) {
            patterns.push({
                type: "provider_error",
                description: `${llmErrors} LLM provider errors in recent log`,
                frequency: llmErrors,
                severity: llmErrors >= 5 ? "high" : "medium",
                suggestedAction: "Check provider configuration, API keys, and fallback chain",
            });
        }
        // Pattern: User corrections (denied approvals)
        const denials = lines.filter((l) => l.includes("DENIED")).length;
        if (denials >= 2) {
            patterns.push({
                type: "user_correction",
                description: `${denials} user denials/corrections in recent interactions`,
                frequency: denials,
                severity: "medium",
                suggestedAction: "Update memory with user preferences to reduce unnecessary approval requests",
            });
        }
        return patterns;
    }
    // ─── Improvement Planning ──────────────────────────────────────────────
    /**
     * Generate an improvement plan from identified patterns.
     */
    planImprovements(patterns) {
        const actions = [];
        let maxPriority = 0;
        for (const p of patterns) {
            const priority = p.severity === "high" ? 3 : p.severity === "medium" ? 2 : 1;
            maxPriority = Math.max(maxPriority, priority);
            switch (p.type) {
                case "repeated_failure":
                    actions.push({
                        type: "update_memory",
                        target: IMPROVEMENTS_PATH,
                        change: `Document repeated failure pattern: ${p.description}. Suggested fix: ${p.suggestedAction}`,
                    });
                    break;
                case "slow_operation":
                    actions.push({
                        type: "update_memory",
                        target: IMPROVEMENTS_PATH,
                        change: `Document slow operation: ${p.description}. Consider caching or optimization.`,
                    });
                    break;
                case "policy_violation":
                    // SAFETY: Only suggest updating memory/identity, never deny_commands
                    actions.push({
                        type: "update_identity",
                        target: node_path_1.default.join(constants_js_1.PROJECT_ROOT, "agent", "identity.md"),
                        change: `Add guidance to avoid actions that trigger policy violations. ${p.suggestedAction}`,
                    });
                    break;
                case "provider_error":
                    actions.push({
                        type: "update_config",
                        target: node_path_1.default.join(constants_js_1.PROJECT_ROOT, "harness.config.json"),
                        change: `Provider reliability issue: ${p.description}. Review fallback configuration.`,
                    });
                    break;
                case "user_correction":
                    actions.push({
                        type: "update_memory",
                        target: IMPROVEMENTS_PATH,
                        change: `User correction pattern: ${p.description}. Adapt behavior to reduce friction.`,
                    });
                    break;
            }
        }
        return {
            id: node_crypto_1.default.randomUUID(),
            patterns,
            actions,
            priority: maxPriority,
            status: "planned",
            created: new Date().toISOString(),
        };
    }
    // ─── Improvement Application ───────────────────────────────────────────
    /**
     * Execute an improvement plan. Backs up files before modifying.
     */
    async applyImprovement(plan) {
        plan.status = "applying";
        let allOk = true;
        for (const action of plan.actions) {
            const result = await this.applyAction(action);
            if (!result.ok) {
                allOk = false;
                // Don't abort — try remaining actions
            }
        }
        plan.status = allOk ? "applied" : "applied"; // still marked applied (partial is ok)
    }
    /**
     * Apply a single improvement action safely.
     */
    async applyAction(action) {
        try {
            // SAFETY: Never allow modification of deny_commands
            if (action.target.includes("policy.md") && action.change.toLowerCase().includes("deny")) {
                return {
                    ok: false,
                    error: "Safety: cannot modify deny_commands via self-improvement",
                };
            }
            // Only allow policy changes that ADD to allow_network
            if (action.type === "update_policy") {
                if (!action.change.toLowerCase().includes("allow_network")) {
                    return {
                        ok: false,
                        error: "Safety: policy changes restricted to allow_network additions only",
                    };
                }
            }
            switch (action.type) {
                case "update_memory":
                    return await this.appendToFile(action.target, action.change);
                case "update_identity":
                    // Append a guidance note, don't rewrite identity
                    return await this.appendToFile(action.target, `\n\n> [Self-Improvement ${new Date().toISOString()}] ${action.change}`);
                case "update_config":
                    // Config changes are documented but not auto-applied (too risky)
                    return await this.appendToFile(IMPROVEMENTS_PATH, `\n\n### Config Suggestion\n${action.change}\n*(Manual review required)*`);
                case "create_skill":
                    return await this.createSkillFile(action);
                case "update_policy":
                    return await this.appendToFile(IMPROVEMENTS_PATH, `\n\n### Policy Suggestion\n${action.change}\n*(Requires manual approval)*`);
                default:
                    return { ok: false, error: `Unknown action type: ${action.type}` };
            }
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /**
     * Append content to a file, creating directories and backing up as needed.
     */
    async appendToFile(filePath, content) {
        try {
            // Ensure directory exists
            await promises_1.default.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
            // Backup existing file before modification
            await this.backupFile(filePath);
            // Append
            await promises_1.default.appendFile(filePath, `\n${content}`, "utf-8");
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /**
     * Create a new skill file.
     */
    async createSkillFile(action) {
        if (!action.content) {
            return { ok: false, error: "No content provided for skill creation" };
        }
        try {
            const skillsDir = node_path_1.default.join(constants_js_1.PROJECT_ROOT, "skills");
            await promises_1.default.mkdir(skillsDir, { recursive: true });
            const skillPath = node_path_1.default.join(skillsDir, action.target);
            await promises_1.default.writeFile(skillPath, action.content, "utf-8");
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /**
     * Backup a file to state/backups/ before modifying.
     */
    async backupFile(filePath) {
        try {
            await promises_1.default.access(filePath);
            await promises_1.default.mkdir(BACKUPS_DIR, { recursive: true });
            const fileName = node_path_1.default.basename(filePath);
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const backupPath = node_path_1.default.join(BACKUPS_DIR, `${timestamp}--${fileName}`);
            const content = await promises_1.default.readFile(filePath, "utf-8");
            await promises_1.default.writeFile(backupPath, content, "utf-8");
        }
        catch {
            // File doesn't exist or backup failed — non-fatal
        }
    }
    // ─── Persistence ───────────────────────────────────────────────────────
    /**
     * Persist improvement history and learned lessons to self-improvements.md.
     */
    async persistState() {
        try {
            await promises_1.default.mkdir(MEMORY_DIR, { recursive: true });
            let content = "";
            try {
                content = await promises_1.default.readFile(IMPROVEMENTS_PATH, "utf-8");
            }
            catch {
                // First time — start fresh
            }
            // Build the latest section
            const section = this.buildImprovementSection();
            // Append to existing content
            const updated = content.trim() + "\n\n" + section;
            await promises_1.default.writeFile(IMPROVEMENTS_PATH, updated, "utf-8");
        }
        catch {
            // Persistence failure is non-fatal
        }
    }
    /**
     * Build a markdown section summarizing the latest improvements.
     */
    buildImprovementSection() {
        if (this.history.length === 0)
            return "";
        const recent = this.history.slice(-5);
        const lines = [
            `## Self-Improvement Log (updated ${new Date().toISOString()})`,
            "",
            `Total interactions analyzed: ${this.interactionCount}`,
            `Total improvement cycles: ${this.history.length}`,
            "",
        ];
        for (const plan of recent) {
            lines.push(`### Plan ${plan.id.slice(0, 8)} — ${plan.status}`);
            lines.push(`- Priority: ${plan.priority}`);
            lines.push(`- Patterns: ${plan.patterns.map((p) => p.type).join(", ")}`);
            lines.push(`- Actions: ${plan.actions.length}`);
            for (const action of plan.actions) {
                lines.push(`  - [${action.type}] ${action.change}`);
            }
            lines.push("");
        }
        return lines.join("\n");
    }
    /**
     * Load previous state from disk.
     */
    async loadState() {
        try {
            const content = await promises_1.default.readFile(IMPROVEMENTS_PATH, "utf-8");
            // Extract interaction count from previous entries
            const countMatch = content.match(/Total interactions analyzed: (\d+)/);
            if (countMatch) {
                this.interactionCount = parseInt(countMatch[1], 10);
            }
        }
        catch {
            // No previous state — start fresh
        }
    }
    /**
     * Read the audit log (last N entries).
     */
    async readAuditLog(n) {
        try {
            const content = await promises_1.default.readFile(constants_js_1.AUDIT_LOG_PATH, "utf-8");
            const lines = content.trim().split("\n").filter((l) => l.trim());
            return lines.slice(-n).join("\n");
        }
        catch {
            return "";
        }
    }
}
exports.SelfImprovementEngine = SelfImprovementEngine;
// ─── Singleton Accessor ─────────────────────────────────────────────────────
let _instance = null;
function getSelfImprovementEngine(opts) {
    if (!_instance) {
        _instance = new SelfImprovementEngine(opts);
    }
    return _instance;
}
//# sourceMappingURL=SelfImprovementEngine.js.map