import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig } from "../config";
import { SkillDefinition, SkillRunner } from "../harness/SkillRunner";

const mkdirAsync = promisify(fs.mkdir);
const statAsync = promisify(fs.stat);

export interface SkillExecutionOptions {
  sandboxRoot: string;
  maxRuntimeMs?: number;
  allowedCommands?: string[];
}

export class SandboxedSkillRunner {
  constructor(private config = loadConfig()) {}

  async runSkill(skillPath: string, options: SkillExecutionOptions): Promise<void> {
    const root = path.resolve(process.cwd(), options.sandboxRoot);
    await mkdirAsync(root, { recursive: true });
    const skillRunner = new SkillRunner(new (require("../harness/OllamaAdapter").OllamaAdapter)(this.config.ollama), this.config);
    const source = path.resolve(process.cwd(), skillPath);
    const destination = path.join(root, path.basename(skillPath));
    fs.copyFileSync(source, destination);
    const env = {
      PATH: process.env.PATH ?? "",
      ...(options.allowedCommands ? { ALLOWED_COMMANDS: options.allowedCommands.join(",") } : {})
    };
    const child = spawn("node", ["../dist/cli.js", "run-skill", "--skill", destination], {
      cwd: root,
      env,
      stdio: ["ignore", "inherit", "inherit"]
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, options.maxRuntimeMs ?? 20000);

    return new Promise((resolve, reject) => {
      child.on("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Sandboxed skill exited with code ${code}`));
        }
      });
      child.on("error", reject);
    });
  }

  async promoteSkill(skillPath: string): Promise<boolean> {
    const source = path.resolve(process.cwd(), skillPath);
    const sandboxRoot = path.resolve(process.cwd(), `./sandbox/${path.basename(skillPath, path.extname(skillPath))}`);
    const sandboxFile = path.join(sandboxRoot, path.basename(skillPath));
    if (!fs.existsSync(sandboxFile)) {
      throw new Error(`Sandbox file not found: ${sandboxFile}`);
    }

    const original = fs.readFileSync(source, "utf8");
    const candidate = fs.readFileSync(sandboxFile, "utf8");
    console.log("Original skill:\n", original);
    console.log("Sandbox skill:\n", candidate);
    const approved = await new Promise<boolean>((resolve) => {
      process.stdin.once("data", (chunk) => {
        resolve(String(chunk).trim().toLowerCase().startsWith("y"));
      });
      process.stdout.write("Promote sandbox changes? (y/n): ");
    });

    if (approved) {
      fs.copyFileSync(sandboxFile, source);
      return true;
    }
    return false;
  }
}
