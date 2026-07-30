// ─── create-skill ───────────────────────────────────────────
// Generates a new YAML skill from a natural language description.
// Validates the YAML before writing. Writes to skills/<name>.yml.

import fs from "node:fs/promises";
import path from "node:path";
import YAML from "js-yaml";
import type { Action, ActionContext, ActionResult, SkillInput } from "../../types/index.js";

const ROOT = process.cwd();
const SKILLS_DIR = path.join(ROOT, "skills");

export async function createSkill(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
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
  const inputs: SkillInput[] = [];
  for (const raw of rawInputs) {
    if (typeof raw !== "object" || raw === null) continue;
    const inp = raw as Record<string, unknown>;
    const inputName = String(inp.name ?? "");
    const prompt = String(inp.prompt ?? "");
    const defaultValue = inp.default ? String(inp.default) : undefined;

    if (!inputName) continue;
    inputs.push({ name: inputName, prompt, default: defaultValue });
  }

  // Build YAML document
  const doc: Record<string, unknown> = {
    name,
    description: description || "(no description)",
    template,
    inputs: inputs.length > 0
      ? Object.fromEntries(inputs.map((i) => [i.name, i.default ?? i.prompt]))
      : {},
  };

  if (model) doc.model = model;

  // Validate YAML by round-tripping
  let yamlContent: string;
  try {
    yamlContent = YAML.dump(doc, { lineWidth: 120 });
    // Verify it parses back cleanly
    YAML.load(yamlContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Generated YAML is invalid: ${message}` };
  }

  const skillPath = path.join(SKILLS_DIR, `${name}.yml`);

  try {
    await fs.mkdir(SKILLS_DIR, { recursive: true });

    // Check if skill already exists
    try {
      await fs.access(skillPath);
      return { ok: false, error: `Skill already exists: ${skillPath}` };
    } catch {
 // Doesn't exist — good
    }

    await fs.writeFile(skillPath, yamlContent, "utf-8");

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Create-skill failed: ${message}` };
  }
}
