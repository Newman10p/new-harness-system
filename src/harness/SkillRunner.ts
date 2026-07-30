import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import yaml from "js-yaml";
import { ModelAdapter } from "./ModelAdapter";
import { HarnessConfig } from "../config";

const execFileAsync = promisify(execFile);

export interface SkillDefinition {
  id?: string;
  name?: string;
  description?: string;
  prompt?: string;
  model?: string;
  script?: string;
  inputs?: Record<string, string>;
  outputNote?: string;
  noteTitle?: string;
  sandbox?: boolean;
  sandbox_root?: string;
  self_improvement?: boolean;
}

export interface SkillRunResult {
  text: string;
  skill: SkillDefinition;
  noteTitle?: string;
}

export class SkillRunner {
  constructor(private modelAdapter: ModelAdapter, private config: HarnessConfig) {}

  async loadSkill(skillPath: string): Promise<SkillDefinition> {
    const resolved = path.resolve(process.cwd(), skillPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Skill file not found: ${resolved}`);
    }

    const raw = fs.readFileSync(resolved, "utf8");
    if (skillPath.endsWith(".yml") || skillPath.endsWith(".yaml")) {
      return yaml.load(raw) as SkillDefinition;
    }

    return JSON.parse(raw) as SkillDefinition;
  }

  async runSkill(skillPath: string, values: Record<string, string> = {}): Promise<SkillRunResult> {
    const skill = await this.loadSkill(skillPath);
    const prompt = this.interpolatePrompt(skill.prompt ?? "", skill.inputs ?? {}, values);
    const noteTitle = skill.noteTitle ? this.interpolatePrompt(skill.noteTitle, skill.inputs ?? {}, values) : undefined;

    let text: string;
    if (skill.script) {
      text = await this.runScriptSkill(skill, prompt, values);
    } else {
      if (!prompt) {
        throw new Error("Skill definition must include a prompt or script.");
      }
      const result = await this.modelAdapter.generate({ prompt });
      text = result.text.trim();
    }

    return { text, skill, noteTitle };
  }

  private interpolatePrompt(template: string, inputs: Record<string, string>, values: Record<string, string>): string {
    let prompt = template;
    for (const [key, defaultValue] of Object.entries(inputs)) {
      const replacement = values[key] ?? defaultValue ?? "";
      prompt = prompt.split(`{{${key}}}`).join(replacement);
    }
    return prompt;
  }

  private async runScriptSkill(skill: SkillDefinition, prompt: string, values: Record<string, string>): Promise<string> {
    if (!skill.script) {
      throw new Error("Skill script is missing from the definition.");
    }

    const scriptPath = path.resolve(process.cwd(), skill.script);
    if (!fs.existsSync(scriptPath)) {
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
