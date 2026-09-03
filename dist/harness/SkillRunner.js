"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillRunner = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const js_yaml_1 = __importDefault(require("js-yaml"));
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
class SkillRunner {
    modelAdapter;
    config;
    constructor(modelAdapter, config) {
        this.modelAdapter = modelAdapter;
        this.config = config;
    }
    async loadSkill(skillPath) {
        const resolved = node_path_1.default.resolve(process.cwd(), skillPath);
        if (!node_fs_1.default.existsSync(resolved)) {
            throw new Error(`Skill file not found: ${resolved}`);
        }
        const raw = node_fs_1.default.readFileSync(resolved, "utf8");
        if (skillPath.endsWith(".yml") || skillPath.endsWith(".yaml")) {
            return js_yaml_1.default.load(raw);
        }
        return JSON.parse(raw);
    }
    async runSkill(skillPath, values = {}) {
        const skill = await this.loadSkill(skillPath);
        const prompt = this.interpolatePrompt(skill.prompt ?? "", skill.inputs ?? {}, values);
        const noteTitle = skill.noteTitle ? this.interpolatePrompt(skill.noteTitle, skill.inputs ?? {}, values) : undefined;
        let text;
        if (skill.script) {
            text = await this.runScriptSkill(skill, prompt, values);
        }
        else {
            if (!prompt) {
                throw new Error("Skill definition must include a prompt or script.");
            }
            const result = await this.modelAdapter.generate({ prompt });
            text = result.text.trim();
        }
        return { text, skill, noteTitle };
    }
    interpolatePrompt(template, inputs, values) {
        let prompt = template;
        for (const [key, defaultValue] of Object.entries(inputs)) {
            const replacement = values[key] ?? defaultValue ?? "";
            prompt = prompt.split(`{{${key}}}`).join(replacement);
        }
        return prompt;
    }
    async runScriptSkill(skill, prompt, values) {
        if (!skill.script) {
            throw new Error("Skill script is missing from the definition.");
        }
        const scriptPath = node_path_1.default.resolve(process.cwd(), skill.script);
        if (!node_fs_1.default.existsSync(scriptPath)) {
            throw new Error(`Skill script not found: ${scriptPath}`);
        }
        const payload = {
            prompt,
            values,
            skill
        };
        const env = {
            ...process.env,
            SKILL_INPUT_JSON: JSON.stringify(payload)
        };
        const runner = scriptPath.endsWith(".js") ? "node" : scriptPath;
        const args = scriptPath.endsWith(".js") ? [scriptPath] : [];
        const { stdout, stderr } = await execFileAsync(runner, args, { env, cwd: process.cwd() });
        if (stderr) {
            console.warn(stderr);
        }
        return stdout.trim();
    }
}
exports.SkillRunner = SkillRunner;
//# sourceMappingURL=SkillRunner.js.map