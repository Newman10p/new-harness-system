"use strict";
// ─── run-skill ─────────────────────────────────────────────────────────────
// Executes a YAML or JSON skill definition file.
// Skills define a prompt template with {{variables}} that get filled in,
// then sent to the LLM. Optionally includes pre-defined actions to execute.
//
// Skill file format (YAML):
//   name: My Skill
//   description: What it does
//   model: gpt-4o-mini        (optional model override)
//   template: "Do {{task}} for {{target}}"
//   inputs:
//     - name: task
//       prompt: What task should I perform?
//       default: summarize
//     - name: target
//       prompt: What is the target?
//   actions:                   (optional pre-actions)
//     - action: read-file
//       path: /some/file.md
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSkill = runSkill;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
async function runSkill(action, ctx) {
    const skillPath = String(action.path ?? "");
    if (!skillPath) {
        return { ok: false, error: "Missing required field: path (skill file path)" };
    }
    // Variables provided directly (skip prompts)
    const directVars = action.variables;
    try {
        const raw = await promises_1.default.readFile(skillPath, "utf-8");
        const ext = node_path_1.default.extname(skillPath).toLowerCase();
        let skill;
        if (ext === ".json") {
            skill = JSON.parse(raw);
        }
        else {
            // YAML or YAML-with-frontmatter
            skill = js_yaml_1.default.load(raw);
        }
        // Validate
        if (!skill.template) {
            return { ok: false, error: "Skill file missing required field: template" };
        }
        // Fill in variables
        const variables = {};
        if (directVars && typeof directVars === "object") {
            Object.assign(variables, directVars);
        }
        // Check for missing variables
        for (const input of skill.inputs ?? []) {
            if (!variables[input.name]) {
                variables[input.name] = input.default ?? `[${input.name}]`;
            }
        }
        // Render template
        let prompt = skill.template;
        for (const [key, value] of Object.entries(variables)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
        }
        // Execute optional pre-actions
        const actionResults = [];
        if (skill.actions && skill.actions.length > 0) {
            // We can't call the registry directly from here (circular),
            // so we return the prompt + actions info for the agent loop to handle
            // This is a design choice — the agent processes the skill prompt
        }
        // If there's an LLM, use it to process the skill prompt
        if (ctx.llm && !skill.actions?.length) {
            const OpenAI = (await import("openai")).default;
            const llm = ctx.llm;
            const model = String(ctx.model ?? skill.model ?? "gpt-4o-mini");
            const response = await llm.chat.completions.create({
                model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 4096,
            });
            const result = response.choices[0]?.message?.content ?? "";
            await ctx.audit({
                type: "action_executed",
                action: "run-skill",
                detail: `Executed skill: ${skill.name ?? "unnamed"} with model ${model}`,
                ok: true,
            });
            return {
                ok: true,
                data: {
                    skill: skill.name ?? "unnamed",
                    model,
                    variables,
                    result,
                },
            };
        }
        // No LLM — return the rendered prompt for the agent to process
        await ctx.audit({
            type: "action_executed",
            action: "run-skill",
            detail: `Rendered skill: ${skill.name ?? "unnamed"} (no LLM, returning prompt)`,
            ok: true,
        });
        return {
            ok: true,
            data: {
                skill: skill.name ?? "unnamed",
                variables,
                prompt,
                note: "No LLM available — returning rendered prompt. Include actions in the skill definition to execute them via the agent loop.",
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to run skill: ${message}` };
    }
}
//# sourceMappingURL=run-skill.js.map