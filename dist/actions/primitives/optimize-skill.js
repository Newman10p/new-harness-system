"use strict";
// ─── optimize-skill ────────────────────────────────────────
// Analyzes an existing skill and suggests improvements based on
// execution history. Applies safe improvements automatically.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optimizeSkill = optimizeSkill;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const ROOT = process.cwd();
const HISTORY_FILE = node_path_1.default.join(ROOT, "memory", "skill-history.md");
function parseHistory(content) {
    const entries = [];
    const lines = content.split("\n");
    let current = null;
    for (const line of lines) {
        if (line.startsWith("## ")) {
            if (current && current.skill) {
                entries.push(current);
            }
            current = { skill: line.replace(/^##\s+/, "").trim(), variables_used: {}, notes: "", executed_at: "", success: true };
        }
        else if (current) {
            const kvMatch = line.match(/^-\s+(\w+):\s*(.*)/);
            if (kvMatch) {
                const key = kvMatch[1].toLowerCase();
                const val = kvMatch[2].trim();
                if (key === "executed_at")
                    current.executed_at = val;
                else if (key === "success")
                    current.success = val === "true";
                else if (key === "notes")
                    current.notes = val;
            }
        }
    }
    if (current && current.skill) {
        entries.push(current);
    }
    return entries;
}
function analyzeImprovements(skill, history) {
    const improvements = [];
    if (history.length === 0) {
        return improvements;
    }
    const definedInputs = new Set(skill.inputs.map((i) => i.name));
    // Check for variables users frequently provide manually
    const manualVars = new Map();
    for (const h of history) {
        if (h.variables_used) {
            for (const key of Object.keys(h.variables_used)) {
                if (!definedInputs.has(key)) {
                    manualVars.set(key, (manualVars.get(key) ?? 0) + 1);
                }
            }
        }
    }
    for (const [varName, count] of manualVars) {
        if (count >= 2) {
            improvements.push({
                type: "add_input",
                description: `Consider adding input "${varName}" — users provide it in ${count}/${history.length} executions`,
                applied: false, // Safe mode: suggest but don't auto-add
            });
        }
    }
    // Check if template is very long
    if (skill.template.length > 3000) {
        improvements.push({
            type: "simplify_template",
            description: `Template is ${skill.template.length} chars. Consider simplifying for clarity.`,
            applied: false,
        });
    }
    // Check success rate
    const successCount = history.filter((h) => h.success).length;
    const failCount = history.length - successCount;
    if (failCount > successCount && history.length >= 3) {
        improvements.push({
            type: "low_success_rate",
            description: `Success rate is ${Math.round((successCount / history.length) * 100)}%. Consider reviewing the template or adding clearer instructions.`,
            applied: false,
        });
    }
    // Check for missing description
    if (!skill.description || skill.description.length < 10) {
        improvements.push({
            type: "add_description",
            description: "Skill lacks a meaningful description",
            applied: false,
        });
    }
    return improvements;
}
async function optimizeSkill(action, ctx) {
    const skillPath = String(action.path ?? "").trim();
    const basedOn = String(action.based_on ?? "execution_history");
    if (!skillPath) {
        return { ok: false, error: "Missing required field: path (skill file path)" };
    }
    try {
        // Read skill
        const raw = await promises_1.default.readFile(skillPath, "utf-8");
        const skill = js_yaml_1.default.load(raw);
        if (!skill.template) {
            return { ok: false, error: "Skill file missing required field: template" };
        }
        // Read history
        const historyContent = await promises_1.default.readFile(HISTORY_FILE, "utf-8").catch(() => "");
        const allHistory = parseHistory(historyContent);
        const skillHistory = allHistory.filter((h) => h.skill === skill.name || h.skill === node_path_1.default.basename(skillPath, ".yml"));
        const improvements = analyzeImprovements(skill, basedOn === "execution_history" ? skillHistory : []);
        // Apply safe improvements automatically
        const applied = [];
        if (!skill.description || skill.description.length < 10) {
            // Auto-add a placeholder description
            skill.description = `Auto-generated: ${skill.name} skill (needs human review)`;
            applied.push("Added description placeholder");
        }
        let changesMade = applied.length > 0;
        if (changesMade) {
            const newYaml = js_yaml_1.default.dump(skill, { lineWidth: 120 });
            // Validate before writing
            js_yaml_1.default.load(newYaml);
            await promises_1.default.writeFile(skillPath, newYaml, "utf-8");
        }
        await ctx.audit({
            type: "action_executed",
            action: "optimize-skill",
            detail: `Analyzed ${node_path_1.default.basename(skillPath)}, ${improvements.length} suggestions, ${applied.length} applied`,
            ok: true,
        });
        return {
            ok: true,
            data: {
                skill: skill.name,
                path: skillPath,
                executions_analyzed: skillHistory.length,
                improvements,
                auto_applied: applied,
                changes_made: changesMade,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Optimize-skill failed: ${message}` };
    }
}
//# sourceMappingURL=optimize-skill.js.map