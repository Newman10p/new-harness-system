"use strict";
// ─── create-skill ───────────────────────────────────────────
// Generates a new YAML skill from a natural language description.
// Validates the YAML before writing. Writes to skills/<name>.yml.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSkill = createSkill;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const ROOT = process.cwd();
const SKILLS_DIR = node_path_1.default.join(ROOT, "skills");
async function createSkill(action, ctx) {
    const name = String(action.name ?? "").trim();
    const description = String(action.description ?? "").trim();
    const template = String(action.template ?? "").trim();
    const rawInputs = Array.isArray(action.inputs) ? action.inputs : [];
    const model = action.model ? String(action.model) : undefined;
    if (!name) {
        return { ok: false, error: "Missing required field: name" };
    }
    if (!template) {
        return { ok: false, error: "Missing required field: template" };
    }
    // Validate name (no path traversal)
    if (/[.\/]/.test(name)) {
        return { ok: false, error: "Skill name must not contain dots or slashes" };
    }
    // Validate and normalize inputs
    const inputs = [];
    for (const raw of rawInputs) {
        if (typeof raw !== "object" || raw === null)
            continue;
        const inp = raw;
        const inputName = String(inp.name ?? "");
        const prompt = String(inp.prompt ?? "");
        const defaultValue = inp.default ? String(inp.default) : undefined;
        if (!inputName)
            continue;
        inputs.push({ name: inputName, prompt, default: defaultValue });
    }
    // Build YAML document
    const doc = {
        name,
        description: description || "(no description)",
        template,
        inputs: inputs.length > 0
            ? Object.fromEntries(inputs.map((i) => [i.name, i.default ?? i.prompt]))
            : {},
    };
    if (model)
        doc.model = model;
    // Validate YAML by round-tripping
    let yamlContent;
    try {
        yamlContent = js_yaml_1.default.dump(doc, { lineWidth: 120 });
        // Verify it parses back cleanly
        js_yaml_1.default.load(yamlContent);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Generated YAML is invalid: ${message}` };
    }
    const skillPath = node_path_1.default.join(SKILLS_DIR, `${name}.yml`);
    try {
        await promises_1.default.mkdir(SKILLS_DIR, { recursive: true });
        // Check if skill already exists
        try {
            await promises_1.default.access(skillPath);
            return { ok: false, error: `Skill already exists: ${skillPath}` };
        }
        catch {
            // Doesn't exist — good
        }
        await promises_1.default.writeFile(skillPath, yamlContent, "utf-8");
        await ctx.audit({
            type: "action_executed",
            action: "create-skill",
            detail: `Created skill "${name}" with ${inputs.length} inputs at ${skillPath}`,
            ok: true,
        });
        ctx.emitHud("activity_log", {
            message: `New skill created: ${name}`,
            level: "info",
        });
        return {
            ok: true,
            data: {
                name,
                path: skillPath,
                inputs_count: inputs.length,
                model: model || null,
                size: yamlContent.length,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Create-skill failed: ${message}` };
    }
}
//# sourceMappingURL=create-skill.js.map