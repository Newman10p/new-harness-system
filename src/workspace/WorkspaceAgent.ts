import fs from "node:fs";
import path from "node:path";
import { ModelAdapter } from "../harness/ModelAdapter";
import { HarnessConfig } from "../config";

export interface WorkspacePlanStep {
  action: "create_file" | "create_dir" | "append_file" | "run_command";
  path?: string;
  content?: string;
  command?: string;
  cwd?: string;
}

export interface WorkspacePlan {
  goal: string;
  steps: WorkspacePlanStep[];
}

export function parseWorkspacePlan(text: string): WorkspacePlan {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { goal: "Workspace task", steps: [] };
  }

  try {
    const parsed = JSON.parse(match[0]);
    return {
      goal: parsed.goal ?? "Workspace task",
      steps: Array.isArray(parsed.steps) ? parsed.steps : []
    };
  } catch {
    return { goal: "Workspace task", steps: [] };
  }
}

export class WorkspaceAgent {
  constructor(private modelAdapter: ModelAdapter, private config: HarnessConfig) {}

  private getWorkspaceRoots(): string[] {
    const roots = new Set<string>();
    const add = (value?: string) => {
      if (!value) return;
      const resolved = path.resolve(process.cwd(), value);
      roots.add(resolved);
    };

    add(this.config.vaultPath);
    add(this.config.skillsPath);
    for (const project of this.config.projects ?? []) {
      add(project.path);
    }

    return Array.from(roots);
  }

  async execute(request: string): Promise<string> {
    const projectRoots = this.getWorkspaceRoots();
    const prompt = `You are a workspace automation agent for this local project. The user request is: ${request}\n\nUse only these workspace directories: ${projectRoots.join(", ")}\n\nReturn STRICT JSON with this shape: {"goal":"...","steps":[{"action":"create_file|create_dir|append_file|run_command","path":"relative/path","content":"...","command":"...","cwd":"relative/path"}]}`;

    const result = await this.modelAdapter.generate({ prompt, maxTokens: 400, temperature: 0.1 });
    const plan = parseWorkspacePlan(result.text);

    if (!plan.steps.length) {
      return `I couldn't turn that into a workspace action. Model output: ${result.text}`;
    }

    const applied: string[] = [];
    for (const step of plan.steps) {
      const relativePath = step.path ? path.resolve(process.cwd(), step.path) : undefined;
      switch (step.action) {
        case "create_dir": {
          if (relativePath) {
            fs.mkdirSync(relativePath, { recursive: true });
            applied.push(`created dir ${step.path}`);
          }
          break;
        }
        case "create_file": {
          if (!relativePath || !step.content) {
            throw new Error("create_file requires path and content");
          }
          fs.mkdirSync(path.dirname(relativePath), { recursive: true });
          fs.writeFileSync(relativePath, step.content, "utf8");
          applied.push(`created file ${step.path}`);
          break;
        }
        case "append_file": {
          if (!relativePath || !step.content) {
            throw new Error("append_file requires path and content");
          }
          fs.mkdirSync(path.dirname(relativePath), { recursive: true });
          fs.appendFileSync(relativePath, step.content, "utf8");
          applied.push(`appended file ${step.path}`);
          break;
        }
        case "run_command": {
          if (!step.command) {
            throw new Error("run_command requires command");
          }
          const cwd = step.cwd ? path.resolve(process.cwd(), step.cwd) : process.cwd();
          const { execSync } = await import("node:child_process");
          execSync(step.command, { cwd, stdio: "inherit" });
          applied.push(`ran command ${step.command}`);
          break;
        }
      }
    }

    return `Plan: ${plan.goal}\n${applied.join("\n")}`;
  }
}
