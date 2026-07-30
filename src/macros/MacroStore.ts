// ─── M.A.I. Macro Store ──────────────────────────────────────────────────
// Persists macros as markdown files in the `macros/` directory.
// Format:
//   # macro: <name>
//   description: ...
//   tags: [a, b]
//   enabled: true
//
//   ## steps
//   1. message: <content>
//   2. delay: <ms>
//   3. action: <json>
//   4. condition: <expression> | <true-step> | <false-step>
//   5. loop: <count> | <step-type>:<content>

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Macro, MacroStep, MacroResult, ParsedMacroFile } from "./types.js";

const MACROS_DIR = path.resolve(process.cwd(), "macros");
const RUNS_FILE = path.resolve(process.cwd(), "state", "macro-runs.json");

/** Ensure the macros directory and state file exist */
export function ensureDirectories(): void {
  if (!fs.existsSync(MACROS_DIR)) {
    fs.mkdirSync(MACROS_DIR, { recursive: true });
  }
  const stateDir = path.dirname(RUNS_FILE);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  if (!fs.existsSync(RUNS_FILE)) {
    fs.writeFileSync(RUNS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

// ─── Macro File I/O ─────────────────────────────────────────────────────

/** Generate a stable ID from macro name */
function macroIdFromName(name: string): string {
  return crypto.createHash("sha256").update(name).digest("hex").slice(0, 12);
}

/** Convert a Macro object to markdown format */
export function macroToMarkdown(macro: Macro): string {
  const lines: string[] = [];
  lines.push(`# macro: ${macro.name}`);
  lines.push(`description: ${macro.description}`);
  lines.push(`tags: [${macro.tags.join(", ")}]`);
  lines.push(`enabled: ${macro.enabled}`);
  lines.push("");
  lines.push("## steps");

  macro.steps.forEach((step, i) => {
    const num = i + 1;
    switch (step.type) {
      case "message":
        lines.push(`${num}. message: ${step.content}`);
        break;
      case "delay":
        lines.push(`${num}. delay: ${step.content}`);
        break;
      case "action":
        lines.push(`${num}. action: ${step.content}`);
        break;
      case "condition":
        lines.push(
          `${num}. condition: ${step.condition || "true"} | ${step.content}`
        );
        break;
      case "loop":
        lines.push(
          `${num}. loop: ${step.maxIterations || 10} | ${step.content}`
        );
        break;
    }
  });

  lines.push("");
  return lines.join("\n");
}

/** Parse a markdown file into a ParsedMacroFile */
export function parseMacroMarkdown(content: string): ParsedMacroFile | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("# macro:")) return null;

  const nameMatch = trimmed.match(/^# macro: (.+)$/m);
  const descMatch = trimmed.match(/^description: (.+)$/m);
  const tagsMatch = trimmed.match(/^tags: \[(.+)\]$/m);
  const enabledMatch = trimmed.match(/^enabled: (true|false)$/m);

  const name = (nameMatch?.[1] || "").trim();
  if (!name) return null;

  const description = (descMatch?.[1] || "").trim();
  const tagsRaw = tagsMatch?.[1] || "";
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const enabled = enabledMatch?.[1] !== "false";

  // Parse steps section
  const stepsSection = trimmed.split("## steps")[1];
  const steps: MacroStep[] = [];

  if (stepsSection) {
    const stepLines = stepsSection
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+\./.test(l));

    for (const line of stepLines) {
      const step = parseStepLine(line);
      if (step) steps.push(step);
    }
  }

  return { name, description, tags, enabled, steps };
}

/** Parse a single step line like "1. message: Run tests" */
function parseStepLine(line: string): MacroStep | null {
  const stripped = line.replace(/^\d+\.\s*/, "");
  const colonIdx = stripped.indexOf(":");
  if (colonIdx === -1) return null;

  const type = stripped.slice(0, colonIdx).trim() as MacroStep["type"];
  const rest = stripped.slice(colonIdx + 1).trim();

  const validTypes = ["message", "action", "delay", "condition", "loop"];
  if (!validTypes.includes(type)) return null;

  if (type === "condition") {
    const pipeIdx = rest.indexOf("|");
    const condition = pipeIdx > 0 ? rest.slice(0, pipeIdx).trim() : "true";
    const content = pipeIdx > 0 ? rest.slice(pipeIdx + 1).trim() : rest;
    return { type, content, condition };
  }

  if (type === "loop") {
    const pipeIdx = rest.indexOf("|");
    const maxIter = pipeIdx > 0 ? parseInt(rest.slice(0, pipeIdx).trim(), 10) || 10 : 10;
    const content = pipeIdx > 0 ? rest.slice(pipeIdx + 1).trim() : rest;
    return { type, content, maxIterations: maxIter };
  }

  return { type, content: rest };
}

/** Load all macros from the macros directory */
export function loadAllMacros(): Macro[] {
  ensureDirectories();
  const macros: Macro[] = [];

  if (!fs.existsSync(MACROS_DIR)) return macros;

  const files = fs.readdirSync(MACROS_DIR).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(MACROS_DIR, file), "utf-8");
      const parsed = parseMacroMarkdown(content);
      if (!parsed) continue;

      // Check for existing metadata (createdAt, lastRun, runCount)
      const existing = macros.find((m) => m.name === parsed.name);
      const id = macroIdFromName(parsed.name);

      macros.push({
        id,
        name: parsed.name,
        description: parsed.description,
        steps: parsed.steps,
        createdAt: existing?.createdAt || Date.now(),
        lastRun: existing?.lastRun,
        runCount: existing?.runCount || 0,
        enabled: parsed.enabled,
        tags: parsed.tags,
      });
    } catch {
      // Skip malformed files
    }
  }

  return macros;
}

/** Save a macro to its markdown file */
export function saveMacro(macro: Macro): void {
  ensureDirectories();
  const filePath = path.join(MACROS_DIR, `${macro.name}.md`);
  fs.writeFileSync(filePath, macroToMarkdown(macro), "utf-8");
}

/** Delete a macro file by name */
export function deleteMacroFile(name: string): boolean {
  const filePath = path.join(MACROS_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

// ─── Run History I/O ─────────────────────────────────────────────────────

/** Append a macro run result to the history file */
export function appendRunResult(result: MacroResult): void {
  ensureDirectories();
  const history = loadRunHistory();
  history.push(result);
  // Keep last 1000 results
  const trimmed = history.length > 1000 ? history.slice(-1000) : history;
  fs.writeFileSync(RUNS_FILE, JSON.stringify(trimmed, null, 2), "utf-8");
}

/** Load all macro run results */
export function loadRunHistory(): MacroResult[] {
  ensureDirectories();
  try {
    const raw = fs.readFileSync(RUNS_FILE, "utf-8");
    return JSON.parse(raw) as MacroResult[];
  } catch {
    return [];
  }
}
