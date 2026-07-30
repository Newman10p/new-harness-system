// ─── profile-update ───────────────────────────────────────────
// Updates the user profile in memory/user-profile.md based on observed
// behavior. If a field exists, updates confidence and timestamp. If new,
// adds with initial confidence.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const ROOT = process.cwd();
const PROFILE_FILE = path.join(ROOT, "memory", "user-profile.md");

interface ProfileField {
  field: string;
  value: string;
  confidence: number;
  observed: string;
  observations: string[];
}

function parseProfile(content: string): ProfileField[] {
  const fields: ProfileField[] = [];
  const regex = /<--\s*profile:(\w+)\s*-->([\s\S]*?)<--\s*\/profile:\1\s*-->/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    try {
      fields.push(JSON.parse(match[2].trim()) as ProfileField);
    } catch {
      // Skip malformed entries
    }
  }
  return fields;
}

function formatProfile(fields: ProfileField[]): string {
  const header = "# User Profile\n\n> Managed by the profile-update primitive.\n\n";
  const blocks = fields.map((f) => {
    return `<-- profile:${f.field} -->\n${JSON.stringify(f, null, 2)}\n<-- /profile:${f.field} -->`;
  });
  return header + blocks.join("\n\n") + "\n";
}

export async function profileUpdate(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const observation = String(action.observation ?? "").trim();
  const field = String(action.field ?? "").trim();
  const value = String(action.value ?? "").trim();

  if (!field) {
    return { ok: false, error: "Missing required field: field" };
  }
  if (!value) {
    return { ok: false, error: "Missing required field: value" };
  }
  if (!observation) {
    return { ok: false, error: "Missing required field: observation" };
  }

  try {
    await fs.mkdir(path.dirname(PROFILE_FILE), { recursive: true });

    const content = await fs.readFile(PROFILE_FILE, "utf-8").catch(() => "");
    let fields = parseProfile(content);

    const now = new Date().toISOString();
    const existingIdx = fields.findIndex((f) => f.field === field);

    if (existingIdx >= 0) {
      // Update existing field
      const existing = fields[existingIdx];
      existing.value = value;
      existing.confidence = Math.min(1, Math.round((existing.confidence + 0.1) * 100) / 100);
      existing.observed = now;
      if (observation && !existing.observations.includes(observation)) {
        existing.observations.push(observation);
        // Keep only last 10 observations
        if (existing.observations.length > 10) {
          existing.observations = existing.observations.slice(-10);
        }
      }
    } else {
      // Add new field
      fields.push({
        field,
        value,
        confidence: 0.5,
        observed: now,
        observations: [observation],
      });
    }

    await fs.writeFile(PROFILE_FILE, formatProfile(fields), "utf-8");

    const updatedField = fields.find((f) => f.field === field)!;

    await ctx.audit({
      type: "action_executed",
      action: "profile-update",
      detail: `Updated profile field "${field}" = "${value}" (confidence=${updatedField.confidence})`,
      ok: true,
    });

    return {
      ok: true,
      data: {
        field: updatedField.field,
        value: updatedField.value,
        confidence: updatedField.confidence,
        observation_count: updatedField.observations.length,
        is_new: existingIdx < 0,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Profile-update failed: ${message}` };
  }
}
