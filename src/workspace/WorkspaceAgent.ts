import fs from "node:fs";
import path from "node:path";
import { ModelAdapter } from "../harness/ModelAdapter";
import { HarnessConfig } from "../config";

export interface WorkspacePlanStep {
  action: "create_file" | "create_dir" | "append_file" | "run_command" | "read_file" | "edit_file" | "search_files" | "list_dir";
  path?: string;
  content?: string;
  command?: string;
  cwd?: string;
  pattern?: string;
  oldContent?: string;
  newContent?: string;
}

export interface WorkspacePlan {
  goal: string;
  reasoning?: string;
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
      reasoning: parsed.reasoning,
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

  /**
   * Gathers context about the workspace to help the model make informed decisions.
   */
  private getWorkspaceContext(): string {
    const roots = this.getWorkspaceRoots();
    const parts: string[] = [];

    for (const root of roots) {
      if (!fs.existsSync(root)) {
        parts.push(`- ${root} (does not exist yet)`);
        continue;
      }
      try {
        const entries = fs.readdirSync(root);
        const files = entries.filter((e) => {
          const stat = fs.statSync(path.join(root, e));
          return stat.isFile();
        });
        const dirs = entries.filter((e) => {
          const stat = fs.statSync(path.join(root, e));
          return stat.isDirectory();
        });
        parts.push(`- ${root}: ${files.length} files, ${dirs.length} subdirectories`);
        if (files.length > 0) {
          parts.push(`  Files: ${files.slice(0, 10).join(", ")}${files.length > 10 ? `... (+${files.length - 10} more)` : ""}`);
        }
      } catch {
        parts.push(`- ${root} (inaccessible)`);
      }
    }

    return parts.join("\n");
  }

  async execute(request: string): Promise<string> {
    const projectRoots = this.getWorkspaceRoots();
    const workspaceContext = this.getWorkspaceContext();

    const prompt = `You are a workspace automation agent for a local project. The user request is: "${request}"

Available workspace directories:
${workspaceContext}

Allowed workspace roots: ${projectRoots.join(", ")}

You can perform these actions:
- create_file: Create a new file with content
- create_dir: Create a new directory
- append_file: Append content to an existing file
- read_file: Read the contents of a file (useful for understanding existing code)
- edit_file: Replace specific content in a file (provide oldContent and newContent)
- search_files: Search for a pattern in files (provide pattern and path)
- list_dir: List contents of a directory
- run_command: Execute a shell command (use sparingly)

Return STRICT JSON with this shape:
{
  "goal": "description of what you'll accomplish",
  "reasoning": "brief explanation of your approach",
  "steps": [
    {
      "action": "create_file|create_dir|append_file|read_file|edit_file|search_files|list_dir|run_command",
      "path": "relative/path",
      "content": "file content (for create_file/append_file)",
      "oldContent": "exact text to replace (for edit_file)",
      "newContent": "replacement text (for edit_file)",
      "pattern": "search pattern (for search_files)",
      "command": "shell command (for run_command)",
      "cwd": "working directory (optional)"
    }
  ]
}

IMPORTANT: All paths must be within the allowed workspace roots. Do not access files outside these directories.`;

    const result = await this.modelAdapter.generate({ prompt, maxTokens: 800, temperature: 0.1 });
    const plan = parseWorkspacePlan(result.text);

    if (!plan.steps.length) {
      return `I couldn't turn that into a workspace action. Model output: ${result.text}`;
    }

    const applied: string[] = [];
    if (plan.reasoning) {
      applied.push(`Reasoning: ${plan.reasoning}`);
    }

    for (const step of plan.steps) {
      const relativePath = step.path ? path.resolve(process.cwd(), step.path) : undefined;

      // Safety: ensure path is within allowed roots
      if (relativePath && !this.isPathAllowed(relativePath, projectRoots)) {
        applied.push(`⛔ blocked: ${step.path} is outside allowed workspace roots`);
        continue;
      }

      switch (step.action) {
        case "create_dir": {
          if (relativePath) {
            fs.mkdirSync(relativePath, { recursive: true });
            applied.push(`📁 created dir ${step.path}`);
          }
          break;
        }
        case "create_file": {
          if (!relativePath || step.content === undefined) {
            applied.push(`⛔ skipped create_file: missing path or content`);
            break;
          }
          fs.mkdirSync(path.dirname(relativePath), { recursive: true });
          fs.writeFileSync(relativePath, step.content, "utf8");
          applied.push(`📄 created file ${step.path}`);
          break;
        }
        case "append_file": {
          if (!relativePath || step.content === undefined) {
            applied.push(`⛔ skipped append_file: missing path or content`);
            break;
          }
          fs.mkdirSync(path.dirname(relativePath), { recursive: true });
          fs.appendFileSync(relativePath, step.content, "utf8");
          applied.push(`📝 appended to file ${step.path}`);
          break;
        }
        case "read_file": {
          if (!relativePath) {
            applied.push(`⛔ skipped read_file: missing path`);
            break;
          }
          if (!fs.existsSync(relativePath)) {
            applied.push(`⛔ file not found: ${step.path}`);
            break;
          }
          const content = fs.readFileSync(relativePath, "utf8");
          applied.push(`📖 read file ${step.path} (${content.length} chars)`);
          // Store in a way the next steps can reference
          break;
        }
        case "edit_file": {
          if (!relativePath || step.oldContent === undefined || step.newContent === undefined) {
            applied.push(`⛔ skipped edit_file: missing path, oldContent, or newContent`);
            break;
          }
          if (!fs.existsSync(relativePath)) {
            applied.push(`⛔ file not found: ${step.path}`);
            break;
          }
          const fileContent = fs.readFileSync(relativePath, "utf8");
          if (!fileContent.includes(step.oldContent)) {
            applied.push(`⛔ oldContent not found in ${step.path}`);
            break;
          }
          const updated = fileContent.replace(step.oldContent, step.newContent);
          fs.writeFileSync(relativePath, updated, "utf8");
          applied.push(`✏️ edited file ${step.path}`);
          break;
        }
        case "search_files": {
          if (!step.pattern || !relativePath) {
            applied.push(`⛔ skipped search_files: missing pattern or path`);
            break;
          }
          if (!fs.existsSync(relativePath)) {
            applied.push(`⛔ path not found: ${step.path}`);
            break;
          }
          const matches = this.searchInDir(relativePath, step.pattern);
          applied.push(`🔍 searched "${step.pattern}" in ${step.path}: ${matches.length} matches`);
          for (const match of matches.slice(0, 5)) {
            applied.push(`  ${match}`);
          }
          if (matches.length > 5) {
            applied.push(`  ... and ${matches.length - 5} more`);
          }
          break;
        }
        case "list_dir": {
          if (!relativePath) {
            applied.push(`⛔ skipped list_dir: missing path`);
            break;
          }
          if (!fs.existsSync(relativePath)) {
            applied.push(`⛔ path not found: ${step.path}`);
            break;
          }
          const entries = fs.readdirSync(relativePath);
          applied.push(`📂 contents of ${step.path}:`);
          for (const entry of entries) {
            const stat = fs.statSync(path.join(relativePath, entry));
            const prefix = stat.isDirectory() ? "📁" : "📄";
            applied.push(`  ${prefix} ${entry}`);
          }
          break;
        }
        case "run_command": {
          if (!step.command) {
            applied.push(`⛔ skipped run_command: missing command`);
            break;
          }
          const cwd = step.cwd ? path.resolve(process.cwd(), step.cwd) : process.cwd();
          try {
            const { execSync } = await import("node:child_process");
            const output = execSync(step.command, { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 });
            applied.push(`⚡ ran: ${step.command}`);
            if (output.trim()) {
              applied.push(`  Output: ${output.trim().split("\n").slice(0, 5).join("\n  ")}`);
            }
          } catch (error) {
            applied.push(`⛔ command failed: ${step.command} - ${error instanceof Error ? error.message : String(error)}`);
          }
          break;
        }
        default:
          applied.push(`⛔ unknown action: ${(step as any).action}`);
      }
    }

    return `Goal: ${plan.goal}\n${applied.join("\n")}`;
  }

  private isPathAllowed(targetPath: string, allowedRoots: string[]): boolean {
    const normalized = path.resolve(targetPath);
    for (const root of allowedRoots) {
      const normalizedRoot = path.resolve(root);
      if (normalized.startsWith(normalizedRoot + path.sep) || normalized === normalizedRoot) {
        return true;
      }
    }
    return false;
  }

  private searchInDir(dirPath: string, pattern: string): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.searchInDir(fullPath, pattern));
        } else if (entry.isFile()) {
          try {
            const content = fs.readFileSync(fullPath, "utf8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(pattern)) {
                const relative = path.relative(process.cwd(), fullPath);
                results.push(`${relative}:${i + 1}: ${lines[i].trim()}`);
              }
            }
          } catch {
            // skip binary files
          }
        }
      }
    } catch {
      // skip inaccessible directories
    }
    return results;
  }
}