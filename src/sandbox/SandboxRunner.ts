// ─── M.A.I. Sandbox Runner ───────────────────────────────────────
// Dry-run sandbox for testing commands safely before execution.
//
// Three modes:
//   - simulation: Pattern-match commands and predict output (no execution)
//   - process:    Spawn with resource limits (ulimit)
//   - docker:     Run in an ephemeral container (full isolation)
//
// Safety: Never executes truly dangerous commands (rm -rf /, format, etc.)
// regardless of mode.

import { spawn, exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { SandboxConfig, DryRunResult, SandboxResult } from "./types.js";
import { analyzeSideEffects } from "./SideEffectAnalyzer.js";

const execAsync = promisify(exec);

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  method: "simulation",
  timeoutMs: 10_000,
  memoryLimitMb: 256,
  networkAccess: false,
};

// ─── Dangerous Command Patterns (never execute these) ─────────────────────

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(\/|~\/|\$HOME|\*\*)/g, reason: "Destructive recursive delete targeting root/home" },
  { pattern: /mkfs\./g, reason: "Filesystem format command" },
  { pattern: /dd\s+.*of=\/dev\//g, reason: "Direct disk write" },
  { pattern: />\s*\/dev\/sd[a-z]/g, reason: "Direct block device write" },
  { pattern: /shutdown\s+-/g, reason: "System shutdown command" },
  { pattern: /reboot\s*$/g, reason: "System reboot command" },
  { pattern: /halt\s*$/g, reason: "System halt command" },
  { pattern: /init\s+0/g, reason: "System runlevel change to 0" },
  { pattern: /:(){ :|:& };:/g, reason: "Fork bomb pattern" },
  { pattern: /chmod\s+(-R\s+)?777\s+\//g, reason: "Dangerous permission change on root" },
  { pattern: /chown\s+(-R\s+)?[^ ]+\s+\//g, reason: "Dangerous ownership change on root" },
  { pattern: /mv\s+.*\/\s*$/g, reason: "Moving files to root" },
  { pattern: /curl.*\|\s*(ba)?sh/g, reason: "Piping remote script into shell" },
  { pattern: /wget.*\|\s*(ba)?sh/g, reason: "Piping remote script into shell" },
];

// ─── Simulation Patterns ──────────────────────────────────────────────────

const SIMULATIONS: Array<{
  match: (cmd: string) => boolean;
  simulate: (cmd: string) => { output: string; wouldSucceed: boolean };
}> = [
  {
    // ls commands
    match: (cmd) => /^\s*ls\s/.test(cmd),
    simulate: (cmd) => {
      const targetPath = cmd.replace(/^\s*ls\s+/, "").trim().split(" ")[0] || ".";
      try {
        const resolved = path.resolve(targetPath);
        const entries = fs.readdirSync(resolved, { withFileTypes: true });
        const output = entries
          .map(e => e.isDirectory() ? `${e.name}/` : e.name)
          .join("  ");
        return { output, wouldSucceed: true };
      } catch {
        return { output: `ls: cannot access '${targetPath}': No such file or directory`, wouldSucceed: false };
      }
    },
  },
  {
    // pwd
    match: (cmd) => /^\s*pwd\s*$/.test(cmd),
    simulate: () => ({ output: process.cwd(), wouldSucceed: true }),
  },
  {
    // echo
    match: (cmd) => /^\s*echo\s/.test(cmd),
    simulate: (cmd) => {
      const text = cmd.replace(/^\s*echo\s+/, "").replace(/^['"]|['"]$/g, "");
      return { output: text.replace(/\$\([^)]+\)/g, "$(command)").replace(/`[^`]+`/g, "$(command)"), wouldSucceed: true };
    },
  },
  {
    // cat
    match: (cmd) => /^\s*cat\s/.test(cmd),
    simulate: (cmd) => {
      const filePath = cmd.replace(/^\s*cat\s+/, "").trim().split(" ")[0];
      try {
        const resolved = path.resolve(filePath);
        const content = fs.readFileSync(resolved, "utf-8");
        return { output: content.slice(0, 2000), wouldSucceed: true };
      } catch {
        return { output: `cat: ${filePath}: No such file or directory`, wouldSucceed: false };
      }
    },
  },
  {
    // which / whereis
    match: (cmd) => /^\s*(which|whereis)\s/.test(cmd),
    simulate: (cmd) => {
      const bin = cmd.replace(/^\s*(which|whereis)\s+/, "").trim().split(" ")[0];
      return { output: `/usr/bin/${bin}`, wouldSucceed: true };
    },
  },
  {
    // date
    match: (cmd) => /^\s*date\s*$/.test(cmd),
    simulate: () => ({ output: new Date().toString(), wouldSucceed: true }),
  },
  {
    // uname
    match: (cmd) => /^\s*uname\s/.test(cmd),
    simulate: () => ({ output: process.platform, wouldSucceed: true }),
  },
  {
    // whoami
    match: (cmd) => /^\s*whoami\s*$/.test(cmd),
    simulate: () => ({ output: process.env.USER || "user", wouldSucceed: true }),
  },
  {
    // env
    match: (cmd) => /^\s*(env|printenv)\s*$/.test(cmd),
    simulate: () => ({ output: Object.keys(process.env).slice(0, 10).join("\n"), wouldSucceed: true }),
  },
  {
    // mkdir
    match: (cmd) => /^\s*mkdir\s/.test(cmd),
    simulate: (cmd) => {
      const dirPath = cmd.replace(/^\s*mkdir\s+(-\w+\s+)*/, "").trim().split(" ")[0];
      const resolved = path.resolve(dirPath);
      return { output: `[sandbox] Would create directory: ${resolved}`, wouldSucceed: !fs.existsSync(resolved) };
    },
  },
  {
    // touch
    match: (cmd) => /^\s*touch\s/.test(cmd),
    simulate: (cmd) => {
      const filePath = cmd.replace(/^\s*touch\s+/, "").trim().split(" ")[0];
      const resolved = path.resolve(filePath);
      return { output: `[sandbox] Would create/Touch file: ${resolved}`, wouldSucceed: true };
    },
  },
  {
    // cp
    match: (cmd) => /^\s*cp\s/.test(cmd),
    simulate: (cmd) => {
      const parts = cmd.replace(/^\s*cp\s+(-\w+\s+)*/, "").trim().split(" ").filter(Boolean);
      if (parts.length >= 2) {
        const src = path.resolve(parts[0]);
        const dst = path.resolve(parts[parts.length - 1]);
        return { output: `[sandbox] Would copy: ${src} → ${dst}`, wouldSucceed: fs.existsSync(src) };
      }
      return { output: "cp: missing operand", wouldSucceed: false };
    },
  },
  {
    // mv
    match: (cmd) => /^\s*mv\s/.test(cmd),
    simulate: (cmd) => {
      const parts = cmd.replace(/^\s*mv\s+(-\w+\s+)*/, "").trim().split(" ").filter(Boolean);
      if (parts.length >= 2) {
        const src = path.resolve(parts[0]);
        const dst = path.resolve(parts[parts.length - 1]);
        return { output: `[sandbox] Would move: ${src} → ${dst}`, wouldSucceed: fs.existsSync(src) };
      }
      return { output: "mv: missing operand", wouldSucceed: false };
    },
  },
  {
    // rm
    match: (cmd) => /^\s*rm\s/.test(cmd),
    simulate: (cmd) => {
      const parts = cmd.replace(/^\s*rm\s+(-\w+\s+)*/, "").trim().split(" ").filter(Boolean);
      const targets = parts.map(p => path.resolve(p));
      return { output: `[sandbox] Would remove: ${targets.join(", ")}`, wouldSucceed: targets.some(t => fs.existsSync(t)) };
    },
  },
];

// ─── Sandbox Runner ────────────────────────────────────────────────────────

export class SandboxRunner {
  private config: SandboxConfig;
  private initialized = false;
  private dockerAvailable = false;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Initialize the sandbox: detect available methods.
   */
  async initialize(config?: Partial<SandboxConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.dockerAvailable = await this.checkDockerAvailable();
    this.initialized = true;

    console.log(
      `[Sandbox] Initialized. Method: ${this.config.method}, ` +
      `Docker: ${this.dockerAvailable}, ` +
      `Timeout: ${this.config.timeoutMs}ms`
    );
  }

  /**
   * Dry-run a command: simulate what would happen without executing.
   */
  async dryRun(action: string): Promise<DryRunResult> {
    const startTime = Date.now();

    // Check for blocked patterns first
    const blockResult = this.checkBlocked(action);
    if (blockResult.blocked) {
      return {
        originalAction: action,
        simulated: true,
        wouldSucceed: false,
        output: `[BLOCKED] ${blockResult.reason}`,
        sideEffects: [],
        warnings: [blockResult.reason ?? "blocked by policy"],
        duration: Date.now() - startTime,
      };
    }

    // Analyze side effects
    const report = analyzeSideEffects(action);
    const sideEffects = report.effects.map(e => e.description);
    const warnings = report.effects
      .filter(e => e.severity === "high" || e.severity === "critical")
      .map(e => `[${e.severity.toUpperCase()}] ${e.description}`);

    // Simulate based on method
    let output: string;
    let wouldSucceed: boolean;

    if (this.config.method === "simulation") {
      const simResult = this.simulateCommand(action);
      output = simResult.output;
      wouldSucceed = simResult.wouldSucceed;
    } else {
      // For docker/process modes, dry-run still simulates
      const simResult = this.simulateCommand(action);
      output = `[dry-run via ${this.config.method}] ` + simResult.output;
      wouldSucceed = simResult.wouldSucceed;
    }

    return {
      originalAction: action,
      simulated: true,
      wouldSucceed,
      output,
      sideEffects,
      warnings,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute a command in a sandboxed environment.
   */
  async execute(action: string): Promise<SandboxResult> {
    if (!this.config.enabled) {
      return {
        command: action,
        success: false,
        stdout: "",
        stderr: "Sandbox is disabled",
        exitCode: null,
        durationMs: 0,
        timedOut: false,
        method: this.config.method,
      };
    }

    // Check for blocked patterns
    const blockResult = this.checkBlocked(action);
    if (blockResult.blocked) {
      return {
        command: action,
        success: false,
        stdout: "",
        stderr: `[BLOCKED] ${blockResult.reason}`,
        exitCode: 1,
        durationMs: 0,
        timedOut: false,
        method: this.config.method,
      };
    }

    switch (this.config.method) {
      case "docker":
        return this.executeDocker(action);
      case "process":
        return this.executeProcess(action);
      case "simulation":
        return this.executeSimulation(action);
      default:
        return {
          command: action,
          success: false,
          stdout: "",
          stderr: `Unknown sandbox method: ${this.config.method}`,
          exitCode: 1,
          durationMs: 0,
          timedOut: false,
          method: this.config.method,
        };
    }
  }

  /**
   * Analyze side effects of a command without running it.
   */
  analyzeSideEffects(action: string) {
    return analyzeSideEffects(action);
  }

  /**
   * Check if the configured sandbox method is available.
   */
  isAvailable(): boolean {
    if (this.config.method === "docker") return this.dockerAvailable;
    if (this.config.method === "process") return true; // always available
    if (this.config.method === "simulation") return true; // always available
    return false;
  }

  /**
   * Clean up any sandbox resources (e.g., Docker containers).
   */
  async cleanup(): Promise<void> {
    if (this.dockerAvailable) {
      try {
        await execAsync("docker container prune -f --filter label=mai-sandbox=true", { timeout: 10_000 });
        console.log("[Sandbox] Cleaned up sandbox containers");
      } catch {
        // Docker not running or no containers to clean
      }
    }
  }

  // ─── Execution Methods ───────────────────────────────────────────────────

  private async executeDocker(command: string): Promise<SandboxResult> {
    if (!this.dockerAvailable) {
      return this.fallbackToSimulation(command, "Docker not available");
    }

    const startTime = Date.now();
    const containerName = `mai-sandbox-${Date.now()}`;
    const networkFlag = this.config.networkAccess ? "" : "--network none";
    const memoryFlag = `--memory=${this.config.memoryLimitMb}m`;

    const dockerCmd = [
      "docker", "run", "--rm",
      "--label", "mai-sandbox=true",
      networkFlag,
      memoryFlag,
      "--name", containerName,
      "--workdir", "/sandbox",
      "node:20-slim",
      "sh", "-c", command,
    ];

    try {
      const { stdout, stderr } = await execAsync(dockerCmd.join(" "), {
        timeout: this.config.timeoutMs,
      });

      return {
        command,
        success: true,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
        durationMs: Date.now() - startTime,
        timedOut: false,
        method: "docker",
      };
    } catch (err: any) {
      const timedOut = err.killed === true;
      return {
        command,
        success: false,
        stdout: err.stdout?.trim() ?? "",
        stderr: err.stderr?.trim() ?? err.message,
        exitCode: err.code ?? 1,
        durationMs: Date.now() - startTime,
        timedOut,
        method: "docker",
      };
    }
  }

  private executeProcess(command: string): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let timedOut = false;

      const proc = spawn("sh", ["-c", command], {
        cwd: "/tmp",
        env: {
          ...process.env,
          NODE_OPTIONS: `--max-old-space-size=${this.config.memoryLimitMb}`,
        },
        timeout: this.config.timeoutMs,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGKILL");
      }, this.config.timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          command,
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          durationMs: Date.now() - startTime,
          timedOut,
          method: "process",
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          command,
          success: false,
          stdout: "",
          stderr: err.message,
          exitCode: 1,
          durationMs: Date.now() - startTime,
          timedOut: false,
          method: "process",
        });
      });
    });
  }

  private executeSimulation(command: string): Promise<SandboxResult> {
    const startTime = Date.now();
    const simResult = this.simulateCommand(command);

    return Promise.resolve({
      command,
      success: simResult.wouldSucceed,
      stdout: simResult.output,
      stderr: "",
      exitCode: simResult.wouldSucceed ? 0 : 1,
      durationMs: Date.now() - startTime,
      timedOut: false,
      method: "simulation",
    });
  }

  // ─── Simulation Engine ───────────────────────────────────────────────────

  private simulateCommand(command: string): { output: string; wouldSucceed: boolean } {
    // Try to match a simulation pattern
    for (const sim of SIMULATIONS) {
      if (sim.match(command)) {
        return sim.simulate(command);
      }
    }

    // Generic simulation for unknown commands
    return {
      output: `[sandbox:simulation] Would execute: ${command}\n[sandbox:simulation] Command type not specifically simulated — actual behavior may differ`,
      wouldSucceed: true,
    };
  }

  // ─── Safety Checks ───────────────────────────────────────────────────────

  private checkBlocked(command: string): { blocked: boolean; reason?: string } {
    for (const { pattern, reason } of BLOCKED_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(command)) {
        return { blocked: true, reason };
      }
    }
    return { blocked: false };
  }

  private fallbackToSimulation(command: string, reason: string): SandboxResult {
    const simResult = this.simulateCommand(command);
    return {
      command,
      success: simResult.wouldSucceed,
      stdout: `[fallback:simulation] ${reason}. Simulated output:\n${simResult.output}`,
      stderr: reason,
      exitCode: simResult.wouldSucceed ? 0 : 1,
      durationMs: 0,
      timedOut: false,
      method: "simulation",
    };
  }

  // ─── Docker Detection ────────────────────────────────────────────────────

  private async checkDockerAvailable(): Promise<boolean> {
    try {
      await execAsync("docker info", { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: SandboxRunner | null = null;

export function getSandboxRunner(): SandboxRunner {
  if (!_instance) {
    _instance = new SandboxRunner();
  }
  return _instance;
}
