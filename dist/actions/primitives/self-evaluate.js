"use strict";
// ─── self-evaluate ────────────────────────────────────────────────────────
// Evaluates M.A.I.'s own performance based on recent audit log entries.
// Analyzes success rate, common failures, execution times, and policy
// violations. Stores evaluation results in memory/evaluations/.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.selfEvaluate = selfEvaluate;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const ROOT = process.cwd();
const AUDIT_PATH = node_path_1.default.join(ROOT, "state", "audit.log.md");
const EVAL_DIR = node_path_1.default.join(ROOT, "memory", "evaluations");
const SCOPE_LIMITS = {
    last_10: 10,
    last_50: 50,
    last_100: 100,
    all: Infinity,
};
function parseAuditLine(line) {
    // Audit lines are markdown-style: [timestamp] TYPE action: detail
    const match = line.match(/\[(\d{4}-\d{2}-\d{2}[^\]]*)\]\s*(\S+)\s*(?:action=([^:]*))?\s*:?\s*(.*)/);
    if (!match)
        return null;
    return {
        timestamp: match[1],
        type: match[2],
        action: match[3] || "",
        detail: match[4],
    };
}
function computeScore(successRate, avgDuration, hasFailures) {
    let score = successRate * 80;
    // Bonus for fast execution
    if (avgDuration !== null) {
        if (avgDuration < 500)
            score += 15;
        else if (avgDuration < 2000)
            score += 10;
        else if (avgDuration < 5000)
            score += 5;
        else
            score -= 5;
    }
    // Penalty for failures
    if (hasFailures)
        score -= 10;
    return Math.max(0, Math.min(100, Math.round(score)));
}
async function selfEvaluate(action, ctx) {
    const scope = String(action.scope ?? "last_50");
    const focus = String(action.focus ?? "all");
    if (!(scope in SCOPE_LIMITS)) {
        return { ok: false, error: `Invalid scope: ${scope}. Valid: ${Object.keys(SCOPE_LIMITS).join(", ")}` };
    }
    const validFocuses = ["all", "failures", "slow", "policy", "provider"];
    if (!validFocuses.includes(focus)) {
        return { ok: false, error: `Invalid focus: ${focus}. Valid: ${validFocuses.join(", ")}` };
    }
    try {
        // Read audit log
        const auditContent = await promises_1.default.readFile(AUDIT_PATH, "utf-8").catch(() => "");
        const lines = auditContent
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
        const limit = SCOPE_LIMITS[scope];
        const recentLines = limit === Infinity ? lines : lines.slice(-limit);
        const entries = recentLines.map(parseAuditLine).filter((e) => e !== null);
        if (entries.length === 0) {
            return {
                ok: true,
                data: {
                    scope,
                    focus,
                    entries_analyzed: 0,
                    message: "No audit entries found to analyze",
                },
            };
        }
        // Analyze
        let totalActions = 0;
        let successfulActions = 0;
        let failedActions = 0;
        let policyViolations = 0;
        let providerErrors = 0;
        const durations = [];
        const failureMap = new Map();
        const slowActions = [];
        for (const entry of entries) {
            if (entry.type === "action_blocked" || entry.type === "action_denied") {
                policyViolations++;
                continue;
            }
            if (entry.type === "llm_error") {
                providerErrors++;
                continue;
            }
            if (entry.type !== "action_executed")
                continue;
            totalActions++;
            const isOk = entry.detail.includes("ok: true") || entry.ok === true;
            if (isOk) {
                successfulActions++;
            }
            else {
                failedActions++;
                const existing = failureMap.get(entry.action);
                failureMap.set(entry.action, {
                    count: (existing?.count ?? 0) + 1,
                    lastDetail: entry.detail,
                });
            }
            // Extract duration if present
            const durMatch = entry.detail.match(/(\d+)ms/);
            if (durMatch) {
                const ms = parseInt(durMatch[1], 10);
                durations.push(ms);
                if (ms > 3000) {
                    slowActions.push({ action: entry.action, duration_ms: ms, detail: entry.detail });
                }
            }
        }
        const successRate = totalActions > 0 ? successfulActions / totalActions : 1;
        const avgDuration = durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : null;
        // Sort failures by count
        const commonFailures = Array.from(failureMap.entries())
            .map(([action, info]) => ({ action, ...info }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        // Sort slow actions
        slowActions.sort((a, b) => b.duration_ms - a.duration_ms);
        const slowestActions = slowActions.slice(0, 5);
        // Generate recommendations
        const recommendations = [];
        if (successRate < 0.7) {
            recommendations.push("Success rate below 70%. Consider reviewing recent failures for patterns.");
        }
        if (providerErrors > 3) {
            recommendations.push("High LLM error rate detected. Consider switching provider or checking connectivity.");
        }
        if (slowestActions.length > 3) {
            recommendations.push("Multiple slow actions detected. Consider optimizing timeouts or breaking into smaller tasks.");
        }
        if (policyViolations > 0) {
            recommendations.push(`${policyViolations} policy violation(s) detected. Review policy.md if actions are being incorrectly blocked.`);
        }
        if (recommendations.length === 0) {
            recommendations.push("Performance looks healthy. No immediate actions needed.");
        }
        const score = computeScore(successRate, avgDuration, failedActions > 0);
        const now = new Date().toISOString();
        const result = {
            scope,
            focus,
            entries_analyzed: entries.length,
            success_rate: Math.round(successRate * 100),
            total_actions: totalActions,
            successful_actions: successfulActions,
            failed_actions: failedActions,
            average_duration_ms: avgDuration !== null ? Math.round(avgDuration) : null,
            slowest_actions: slowestActions,
            common_failures: commonFailures,
            policy_violations: policyViolations,
            provider_errors: providerErrors,
            recommendations,
            score,
            stored_at: now,
        };
        // Store evaluation
        await promises_1.default.mkdir(EVAL_DIR, { recursive: true });
        const evalFile = node_path_1.default.join(EVAL_DIR, `${now.replace(/[:.]/g, "-")}.md`);
        const evalMd = [
            `# Self-Evaluation — ${now}`,
            "",
            `- **Scope**: ${scope}`,
            `- **Focus**: ${focus}`,
            `- **Entries Analyzed**: ${entries.length}`,
            `- **Score**: ${score}/100`,
            `- **Success Rate**: ${Math.round(successRate * 100)}%`,
            `- **Avg Duration**: ${avgDuration !== null ? `${Math.round(avgDuration)}ms` : "N/A"}`,
            "",
            "## Failures",
            commonFailures.length > 0
                ? commonFailures.map((f) => `- **${f.action}**: ${f.count} failures — ${f.lastDetail}`).join("\n")
                : "None",
            "",
            "## Recommendations",
            ...recommendations.map((r) => `- ${r}`),
            "",
        ].join("\n");
        await promises_1.default.writeFile(evalFile, evalMd, "utf-8");
        await ctx.audit({
            type: "action_executed",
            action: "self-evaluate",
            detail: `Evaluated ${entries.length} entries, score=${score}, success_rate=${Math.round(successRate * 100)}%`,
            ok: true,
        });
        return { ok: true, data: result };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Self-evaluate failed: ${message}` };
    }
}
//# sourceMappingURL=self-evaluate.js.map