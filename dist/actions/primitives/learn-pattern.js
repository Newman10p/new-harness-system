"use strict";
// ─── learn-pattern ─────────────────────────────────────────────
// Detects and saves a repeated workflow pattern to memory/patterns.md.
// If auto_execute is true, also creates a corresponding YAML skill file.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.learnPattern = learnPattern;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const ROOT = process.cwd();
const PATTERNS_FILE = node_path_1.default.join(ROOT, "memory", "patterns.md");
const SKILLS_DIR = node_path_1.default.join(ROOT, "skills");
function parsePatterns(content) {
    const patterns = [];
    const regex = /<--\s*pattern:(\S+)\s*-->([\s\S]*?)<--\s*\/pattern:\1\s*-->/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        try {
            patterns.push(JSON.parse(match[2].trim()));
        }
        catch {
            // Skip malformed
        }
    }
    return patterns;
}
function formatPatterns(patterns) {
    const header = "# Learned Patterns\n\n> Managed by the learn-pattern primitive.\n\n";
    const blocks = patterns.map((p) => {
        return `<-- pattern:${p.name} -->\n${JSON.stringify(p, null, 2)}\n<-- /pattern:${p.name} -->`;
    });
    return header + blocks.join("\n\n") + "\n";
}
function patternToYamlSkill(pattern) {
    const doc = {
        name: pattern.name,
        description: pattern.description,
        prompt: `Execute the following workflow pattern:\n\n${pattern.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nThis pattern was automatically learned from user behavior. Execute each step in order.`,
        inputs: {
            trigger_context: `The situation that triggered this pattern: ${pattern.trigger}`,
        },
    };
    return js_yaml_1.default.dump(doc, { lineWidth: 120 });
}
async function learnPattern(action, ctx) {
    const name = String(action.name ?? "").trim();
    const description = String(action.description ?? "").trim();
    const steps = Array.isArray(action.steps) ? action.steps.map(String) : [];
    const trigger = String(action.trigger ?? "").trim();
    const autoExecute = Boolean(action.auto_execute ?? false);
    if (!name) {
        return { ok: false, error: "Missing required field: name" };
    }
    if (!description) {
        return { ok: false, error: "Missing required field: description" };
    }
    if (steps.length === 0) {
        return { ok: false, error: "Missing required field: steps (must be non-empty array)" };
    }
    try {
        await promises_1.default.mkdir(node_path_1.default.dirname(PATTERNS_FILE), { recursive: true });
        const content = await promises_1.default.readFile(PATTERNS_FILE, "utf-8").catch(() => "");
        let patterns = parsePatterns(content);
        const now = new Date().toISOString();
        const existingIdx = patterns.findIndex((p) => p.name === name);
        if (existingIdx >= 0) {
            // Update existing pattern
            patterns[existingIdx].description = description;
            patterns[existingIdx].steps = steps;
            patterns[existingIdx].trigger = trigger;
            patterns[existingIdx].auto_execute = autoExecute;
            patterns[existingIdx].updated = now;
            patterns[existingIdx].execution_count++;
        }
        else {
            // Add new pattern
            patterns.push({
                name,
                description,
                steps,
                trigger,
                auto_execute: autoExecute,
                created: now,
                updated: now,
                execution_count: 1,
            });
        }
        await promises_1.default.writeFile(PATTERNS_FILE, formatPatterns(patterns), "utf-8");
        // If auto_execute, also create a YAML skill
        let skillPath = null;
        if (autoExecute) {
            await promises_1.default.mkdir(SKILLS_DIR, { recursive: true });
            const pattern = patterns.find((p) => p.name === name);
            skillPath = node_path_1.default.join(SKILLS_DIR, `${name}.yml`);
            const yamlContent = patternToYamlSkill(pattern);
            await promises_1.default.writeFile(skillPath, yamlContent, "utf-8");
        }
        await ctx.audit({
            type: "action_executed",
            action: "learn-pattern",
            detail: `Learned pattern "${name}" with ${steps.length} steps, auto_execute=${autoExecute}`,
            ok: true,
        });
        return {
            ok: true,
            data: {
                name,
                steps_count: steps.length,
                auto_execute: autoExecute,
                stored_in: PATTERNS_FILE,
                skill_created: skillPath,
                is_new: existingIdx < 0,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Learn-pattern failed: ${message}` };
    }
}
//# sourceMappingURL=learn-pattern.js.map