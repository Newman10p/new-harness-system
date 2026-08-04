// ─── SandboxExecutor ───────────────────────────────────────────────────────
// Sandboxed command execution with multiple defense layers:
//   1. Dangerous pattern detection (obfuscation-aware)
//   2. Restricted environment (only safe env vars)
//   3. Shell=false for simple commands (no shell operators)
//   4. Timeout + output limits (inherited from caller)
//   5. Dry-run audit logging of parsed command structure

import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// ── Safe environment whitelist ──────────────────────────────────────────────
const SAFE_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "LANG",
  "TERM",
  "USER",
  "SHELL",
]);

// ── Dangerous pattern matchers (obfuscation-aware) ─────────────────────────
// These regexes detect common shell obfuscation techniques.

interface DangerMatch {
  pattern: RegExp;
  reason: string;
}

const DANGEROUS_PATTERNS: DangerMatch[] = [
  // Pipe to sh/bash with -c flag
  { pattern: /\|\s*(\/\S*)?\s*(ba)?sh\s+-[a-zA-Z]*c/m, reason: "pipe to sh/bash -c detected" },
  // eval / exec / source / dot-source
  { pattern: /\b(eval|\bexec\b|\bsource\b)\s/m, reason: "eval/exec/source command detected" },
  // Dot-source (e.g., `. /path/to/script` or `. ~/file`)
  { pattern: /(?:^|[;|&\n])\s*\.[\s/~]/m, reason: "dot-source execution detected" },
  // IFS obfuscation: ${IFS}, $IFS
  { pattern: /\$\{?IFS\}?/m, reason: "IFS obfuscation detected" },
  // Command substitution used for obfuscation: $(...), backticks
  { pattern: /\$\([^)]*\)/m, reason: "command substitution $() detected" },
  { pattern: /`[^`]+`/m, reason: "backtick command substitution detected" },
  // Base64 decode pipe: base64 -d | ..., base64 --decode | ...
  { pattern: /base64\s+(-[dD]|--decode)\s*\|/m, reason: "base64 decode pipe detected" },
  // xxd reverse pipe: xxd -r | ..., xxd -r -p | ...
  { pattern: /xxd\s+(-r|--revert)\s*\|/m, reason: "xxd reverse pipe detected" },
  // Heredoc redirect to sh/bash: << EOF ... sh or <<'EOF' ... bash
  { pattern: /<<\s*['\"]?\w+['\"]?\s*.*\s*(ba)?sh\b/m, reason: "heredoc redirect to shell detected" },
  // Process substitution: <(...) or >(...)
  { pattern: /[<>]\([^)]+\)/m, reason: "process substitution detected" },
  // Arithmetic expansion used for obfuscation: $((...))
  { pattern: /\$\(\([^)]+\)\)/m, reason: "arithmetic expansion detected" },
  // Python/perl one-liner pipe: ... | python, ... | perl
  { pattern: /\|\s*(python3?|perl|ruby|node)\b/m, reason: "pipe to interpreter detected" },
  // Tee to privileged paths
  { pattern: /\|\s*tee\s+\//m, reason: "tee to root path detected" },
  // Curl/wget pipe to sh: curl ... | sh, wget ... | bash
  { pattern: /(curl|wget)\s+.*\|\s*(ba)?sh/m, reason: "remote script pipe to shell detected" },
];

// ── Shell operator detection ────────────────────────────────────────────────
const SHELL_OPERATOR_RE = /[|&;<>`$(){}]/;

// ── Parsed command structure for audit ───────────────────────────────────────
export interface ParsedCommand {
  raw: string;
  usesShell: boolean;
  shellReason?: string;
  command: string;
  args: string[];
  warnings: string[];
  blocked: boolean;
  blockReason?: string;
}

// ── SandboxExecutor class ───────────────────────────────────────────────────

export class SandboxExecutor {
  private readonly maxBuffer: number;

  constructor(maxBuffer: number = 10 * 1024 * 1024) {
    this.maxBuffer = maxBuffer;
  }

  /**
   * Build a sanitized environment with only safe vars.
   */
  private sanitizeEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const key of SAFE_ENV_KEYS) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key] as string;
      }
    }
    return env;
  }

  /**
   * Validate command against dangerous patterns.
   * Returns array of warning/block reasons.
   */
  validateCommand(command: string): { blocked: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let blocked = false;

    for (const { pattern, reason } of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        reasons.push(reason);
        blocked = true;
      }
    }

    return { blocked, reasons };
  }

  /**
   * Parse command into structure for audit logging.
   */
  parseCommand(command: string): ParsedCommand {
    const warnings: string[] = [];
    const validation = this.validateCommand(command);

    const usesShell = SHELL_OPERATOR_RE.test(command);
    let shellReason: string | undefined;

    if (usesShell) {
      // Determine which shell operators are present
      const operators: string[] = [];
      if (/\|/.test(command)) operators.push("pipe");
      if (/>[^>]/.test(command) || />>/.test(command)) operators.push("redirect");
      if (/&&/.test(command)) operators.push("&&");
      if (/\|\|/.test(command)) operators.push("||");
      if (/\$\(/.test(command)) operators.push("$()");
      if (/`[^`]+`/.test(command)) operators.push("backticks");
      if (/;[^;\n]/.test(command) || /;\s*$/m.test(command)) operators.push("semicolon");
      shellReason = `shell mode required for: ${operators.join(", ")}`;
      warnings.push(`WARNING: shell mode enabled — ${shellReason}`);
    }

    // Split into command + args for simple commands
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0] || "";
    const args = parts.slice(1);

    return {
      raw: command,
      usesShell,
      shellReason,
      command: cmd,
      args,
      warnings,
      blocked: validation.blocked,
      blockReason: validation.blocked ? validation.reasons.join("; ") : undefined,
    };
  }

  /**
   * Execute a command with sandboxing.
   */
  async execute(command: string, timeout: number): Promise<{ stdout: string; stderr: string; parsed: ParsedCommand }> {
    const parsed = this.parseCommand(command);
    const env = this.sanitizeEnv();

    // Dry-run validation: log the parsed command structure for audit
    console.log("[SandboxExecutor] Parsed command:", JSON.stringify({
      raw: parsed.raw,
      usesShell: parsed.usesShell,
      command: parsed.command,
      args: parsed.args,
      blocked: parsed.blocked,
      blockReason: parsed.blockReason,
      warnings: parsed.warnings,
    }, null, 2));

    // Block dangerous commands
    if (parsed.blocked) {
      throw new Error(`Command blocked by sandbox: ${parsed.blockReason}`);
    }

    if (parsed.usesShell) {
      // Shell mode required — use exec with restricted env
      console.log(`[SandboxExecutor] Using shell mode for: ${parsed.shellReason}`);
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: this.maxBuffer,
        env,
      });
      return { stdout, stderr, parsed };
    } else {
      // Simple command — use spawn with shell: false
      const args = parsed.args;
      return new Promise((resolve, reject) => {
        const child = spawn(parsed.command, args, {
          env,
          timeout,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let totalSize = 0;

        child.stdout?.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize <= this.maxBuffer) {
            stdoutChunks.push(chunk);
          }
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize <= this.maxBuffer) {
            stderrChunks.push(chunk);
          }
        });

        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);

        child.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
          const stderr = Buffer.concat(stderrChunks).toString("utf-8");

          if (code !== 0 && code !== null) {
            const err = new Error(`Command exited with code ${code}: ${stderr || "(no stderr)"}`) as Error & { stdout?: string; stderr?: string };
            err.stdout = stdout;
            err.stderr = stderr;
            reject(err);
          } else {
            resolve({ stdout, stderr, parsed });
          }
        });
      });
    }
  }
}
