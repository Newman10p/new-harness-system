import { execSync } from "node:child_process";
import { HarnessAction, ActionMeta } from "./types";
import { globalActionRegistry } from "../registry/actionsRegistry";

export interface TerminalInput {
  command: string;
  cwd?: string;
  timeout?: number;
}

export interface TerminalOutput {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

class TerminalExecAction implements HarnessAction {
  name = "terminal.exec";
  description = "Execute a shell command with strong restrictions";

  async run(input: unknown): Promise<TerminalOutput> {
    const { command, cwd, timeout = 30000 } = input as TerminalInput;
    if (!command) throw new Error("terminal.exec requires 'command'");

    // Safety: block destructive commands unless explicitly allowed
    const destructivePatterns = [
      /^rm\s+-rf\s+\/\s*$/m, /^mkfs/m, /^dd\s+if=/m,
      /^:(){ :\|:& };:/m, /^chmod\s+777\s+\//m, /^sudo\s+rm/m
    ];
    for (const pattern of destructivePatterns) {
      if (pattern.test(command.trim())) {
        throw new Error(`Destructive command blocked: ${command}`);
      }
    }

    try {
      const output = execSync(command, {
        cwd: cwd ?? process.cwd(),
        timeout,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"]
      });
      return {
        command,
        stdout: output?.trim() ?? "",
        stderr: "",
        exitCode: 0
      };
    } catch (error: any) {
      return {
        command,
        stdout: error.stdout?.toString()?.trim() ?? "",
        stderr: error.stderr?.toString()?.trim() ?? error.message,
        exitCode: error.status ?? 1
      };
    }
  }
}

export const terminalExecAction = new TerminalExecAction();

export function registerTerminalActions(): void {
  globalActionRegistry.register(terminalExecAction, {
    name: "terminal.exec",
    description: "Execute a shell command with strong restrictions",
    requiresConfirmation: true,
    category: "terminal"
  });
}