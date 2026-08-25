// ─── M.A.I. SandboxManager ───────────────────────────────────────────
// Unified sandbox system that gives Mai full control over isolated
// command execution environments. Replaces the fragmented SandboxRunner /
// SandboxExecutor / SandboxedSkillRunner with a single, session-aware
// sandbox manager.
//
// Features:
//   - Persistent sessions with isolated working directories & env
//   - Four isolation tiers: native (restricted env) → process → docker → firejail
//   - Streaming stdout/stderr via callback (for HUD live output)
//   - Resource tracking (CPU, memory, wall-time per session)
//   - Command history & replay per session
//   - Side-effect analysis before execution (using existing SideEffectAnalyzer)
//   - Auto-cleanup of stale sessions

import { spawn, exec, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { analyzeSideEffects } from "../sandbox/SideEffectAnalyzer.js";
import type { SideEffectReport } from "../sandbox/types.js";

const execAsync = promisify(exec);

// ─── Types ────────────────────────────────────────────────────────────────

export type IsolationTier = "native" | "process" | "docker" | "firejail";

export interface SandboxSessionConfig {
  /** Isolation tier — native is lightest, firejail is strongest */
  tier: IsolationTier;
  /** Working directory for the session (auto-created) */
  workingDir?: string;
  /** Custom environment variables (merged with safe baseline) */
  env?: Record<string, string>;
  /** Maximum execution time per command (ms) */
  commandTimeoutMs: number;
  /** Maximum memory in MB (process/firejail tiers) */
  memoryLimitMb: number;
  /** Whether network access is allowed */
  networkAccess: boolean;
  /** Maximum output buffer size in bytes */
  maxOutputBytes: number;
  /** Session TTL in ms — auto-destroyed after idle */
  sessionTtlMs: number;
  /** Maximum command history length */
  maxHistory: number;
  /** Labels/tags for the session */
  tags?: string[];
}

export interface CommandResult {
  id: string;
  command: string;
  sessionId: string;
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  tier: IsolationTier;
  sideEffects: SideEffectReport | null;
  timestamp: number;
}

export interface CommandProgress {
  sessionId: string;
  commandId: string;
  command: string;
  phase: "parsing" | "analysis" | "executing" | "streaming" | "done" | "blocked";
  percent: number;
  detail?: string;
  timestamp: number;
}

export interface SandboxSession {
  id: string;
  name: string;
  config: SandboxSessionConfig;
  workingDir: string;
  createdAt: number;
  lastActivityAt: number;
  commandHistory: CommandResult[];
  status: "active" | "paused" | "destroyed";
  env: Record<string, string>;
  totalCommandsRun: number;
  totalCpuTimeMs: number;
  totalBytesOut: number;
}

export interface SandboxStats {
  totalSessions: number;
  activeSessions: number;
  totalCommandsExecuted: number;
  totalBlockedCommands: number;
  availableTiers: IsolationTier[];
  dockerAvailable: boolean;
  firejailAvailable: boolean;
}

// Stream callback for live output
export type OutputStreamCallback = (
  sessionId: string,
  commandId: string,
  stream: "stdout" | "stderr",
  chunk: string
) => void;

// ─── Safe Environment Baseline ────────────────────────────────────────────

const SAFE_ENV_KEYS = new Set([
  "PATH", "HOME", "LANG", "TERM", "USER", "SHELL",
  "NODE_VERSION", "npm_config_prefix",
]);

// ─── Dangerous Command Patterns (unified from both existing sandboxes) ────

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string; severity: "block" | "warn" }> = [
  // Destructive
  { pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(\/|~\/|\$HOME|\*\*)/g, reason: "Destructive recursive delete targeting root/home", severity: "block" },
  { pattern: /mkfs\./g, reason: "Filesystem format command", severity: "block" },
  { pattern: /dd\s+.*of=\/dev\//g, reason: "Direct disk write", severity: "block" },
  { pattern: />\s*\/dev\/sd[a-z]/g, reason: "Direct block device write", severity: "block" },
  { pattern: /shutdown\s+-/g, reason: "System shutdown command", severity: "block" },
  { pattern: /reboot\s*$/g, reason: "System reboot command", severity: "block" },
  { pattern: /halt\s*$/g, reason: "System halt command", severity: "block" },
  { pattern: /init\s+0/g, reason: "System runlevel change to 0", severity: "block" },
  { pattern: /:(){\s*:\|:&\s*};:/g, reason: "Fork bomb pattern", severity: "block" },
  { pattern: /chmod\s+(-R\s+)?777\s+\//g, reason: "Dangerous permission change on root", severity: "block" },
  { pattern: /chown\s+(-R\s+)?[^ ]+\s+\//g, reason: "Dangerous ownership change on root", severity: "block" },
  // Obfuscation
  { pattern: /\|\s*(\/\S*)?\s*(ba)?sh\s+-[a-zA-Z]*c/m, reason: "pipe to sh/bash -c detected", severity: "block" },
  { pattern: /\b(eval|\bexec\b|\bsource\b)\s/m, reason: "eval/exec/source command detected", severity: "block" },
  { pattern: /(?:^|[;|&\n])\s*\.[\s~\/]/m, reason: "dot-source execution detected", severity: "block" },
  { pattern: /\$\{?IFS\}?/m, reason: "IFS obfuscation detected", severity: "block" },
  { pattern: /\$\([^)]+\)/m, reason: "command substitution $() detected", severity: "warn" },
  { pattern: /`[^`]+`/m, reason: "backtick command substitution detected", severity: "warn" },
  { pattern: /base64\s+(-[dD]|--decode)\s*\|/m, reason: "base64 decode pipe detected", severity: "block" },
  { pattern: /xxd\s+(-r|--revert)\s*\|/m, reason: "xxd reverse pipe detected", severity: "block" },
  { pattern: /<<\s*['\"]?\w+['\"]?\s*.*\s*(ba)?sh\b/m, reason: "heredoc redirect to shell detected", severity: "block" },
  { pattern: /[<>]\([^)]+\)/m, reason: "process substitution detected", severity: "warn" },
  { pattern: /\$\(\([^)]+\)\)/m, reason: "arithmetic expansion detected", severity: "warn" },
  { pattern: /\|\s*(python3?|perl|ruby|node)\b/m, reason: "pipe to interpreter detected", severity: "block" },
  { pattern: /\|\s*tee\s+\//m, reason: "tee to root path detected", severity: "block" },
  { pattern: /(curl|wget)\s+.*\|\s*(ba)?sh/m, reason: "remote script pipe to shell detected", severity: "block" },
];

// ─── Default Config ───────────────────────────────────────────────────────

const DEFAULT_SESSION_CONFIG: SandboxSessionConfig = {
  tier: "native",
  commandTimeoutMs: 30_000,
  memoryLimitMb: 256,
  networkAccess: false,
  maxOutputBytes: 10 * 1024 * 1024, // 10MB
  sessionTtlMs: 30 * 60 * 1000,      // 30 minutes
  maxHistory: 100,
};

// ─── SandboxManager ──────────────────────────────────────────────────────

export class SandboxManager {
  private sessions = new Map<string, SandboxSession>();
  private dockerAvailable = false;
  private firejailAvailable = false;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private outputStreamCallback: OutputStreamCallback | null = null;
  private totalCommandsExecuted = 0;
  private totalBlockedCommands = 0;
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(os.tmpdir(), "mai-sandbox");
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Initialize the sandbox manager — detect available isolation tiers.
   */
  async initialize(): Promise<void> {
    // Detect Docker
    try {
      await execAsync("docker info", { timeout: 5000 });
      this.dockerAvailable = true;
    } catch { this.dockerAvailable = false; }

    // Detect firejail
    try {
      await execAsync("firejail --version", { timeout: 3000 });
      this.firejailAvailable = true;
    } catch { this.firejailAvailable = false; }

    console.log(
      `[SandboxManager] Initialized. Docker: ${this.dockerAvailable}, ` +
      `Firejail: ${this.firejailAvailable}, Base: ${this.basePath}`
    );

    // Start cleanup timer — every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 5 * 60 * 1000);
    this.cleanupInterval.unref();
  }

  /**
   * Set a callback for streaming command output in real-time.
   */
  onOutput(callback: OutputStreamCallback): void {
    this.outputStreamCallback = callback;
  }

  /**
   * Create a new sandbox session.
   */
  async createSession(
    name: string,
    config?: Partial<SandboxSessionConfig>
  ): Promise<SandboxSession> {
    const id = crypto.randomBytes(8).toString("hex");
    const sessionConfig: SandboxSessionConfig = {
      ...DEFAULT_SESSION_CONFIG,
      ...config,
    };

    // Validate tier availability
    if (sessionConfig.tier === "docker" && !this.dockerAvailable) {
      console.warn("[SandboxManager] Docker requested but not available, falling back to process");
      sessionConfig.tier = "process";
    }
    if (sessionConfig.tier === "firejail" && !this.firejailAvailable) {
      console.warn("[SandboxManager] Firejail requested but not available, falling back to process");
      sessionConfig.tier = "process";
    }

    // Create session working directory
    const workingDir = sessionConfig.workingDir || path.join(this.basePath, id);
    if (!fs.existsSync(workingDir)) {
      fs.mkdirSync(workingDir, { recursive: true });
    }

    // Build isolated environment
    const env = this.buildSafeEnv(sessionConfig.env);

    const session: SandboxSession = {
      id,
      name,
      config: sessionConfig,
      workingDir,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      commandHistory: [],
      status: "active",
      env,
      totalCommandsRun: 0,
      totalCpuTimeMs: 0,
      totalBytesOut: 0,
    };

    this.sessions.set(id, session);
    console.log(`[SandboxManager] Session created: ${name} (${id}) [${sessionConfig.tier}]`);
    return session;
  }

  /**
   * Execute a command in a session.
   */
  async executeCommand(
    sessionId: string,
    command: string,
    progressCb?: (progress: CommandProgress) => void
  ): Promise<CommandResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return this.makeErrorResult(command, "Session not found", "unknown");
    }
    if (session.status !== "active") {
      return this.makeErrorResult(command, `Session is ${session.status}`, session.config.tier);
    }

    const commandId = crypto.randomBytes(4).toString("hex");
    const startTime = Date.now();
    session.lastActivityAt = startTime;

    const emitProgress = (phase: CommandProgress["phase"], percent: number, detail?: string) => {
      progressCb?.({
        sessionId, commandId, command, phase, percent, detail,
        timestamp: Date.now(),
      });
    };

    // Phase 1: Parse & validate
    emitProgress("parsing", 5, "Checking command safety...");
    const validation = this.validateCommand(command);
    if (validation.blocked) {
      this.totalBlockedCommands++;
      emitProgress("blocked", 100, validation.reason);
      const result: CommandResult = {
        id: commandId, command, sessionId,
        success: false, stdout: "", stderr: `[BLOCKED] ${validation.reason}`,
        exitCode: 1, durationMs: Date.now() - startTime, timedOut: false,
        tier: session.config.tier, sideEffects: null, timestamp: startTime,
      };
      session.commandHistory.push(result);
      if (session.commandHistory.length > session.config.maxHistory) {
        session.commandHistory.shift();
      }
      return result;
    }

    // Phase 2: Side-effect analysis
    emitProgress("analysis", 15, "Analyzing side effects...");
    const sideEffects = analyzeSideEffects(command);

    // Phase 3: Execute in the configured tier
    emitProgress("executing", 25, `Running via ${session.config.tier} isolation...`);
    let result: CommandResult;

    try {
      switch (session.config.tier) {
        case "docker":
          result = await this.executeDocker(session, command, commandId, sideEffects, startTime, emitProgress);
          break;
        case "firejail":
          result = await this.executeFirejail(session, command, commandId, sideEffects, startTime, emitProgress);
          break;
        case "process":
          result = await this.executeProcess(session, command, commandId, sideEffects, startTime, emitProgress);
          break;
        case "native":
        default:
          result = await this.executeNative(session, command, commandId, sideEffects, startTime, emitProgress);
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result = {
        id: commandId, command, sessionId,
        success: false, stdout: (err as { stdout?: string }).stdout ?? "",
        stderr: message, exitCode: 1,
        durationMs: Date.now() - startTime, timedOut: message.includes("timed out"),
        tier: session.config.tier, sideEffects, timestamp: startTime,
      };
    }

    // Track stats
    this.totalCommandsExecuted++;
    session.totalCommandsRun++;
    session.totalCpuTimeMs += result.durationMs;
    session.totalBytesOut += result.stdout.length + result.stderr.length;

    // Store in history
    session.commandHistory.push(result);
    if (session.commandHistory.length > session.config.maxHistory) {
      session.commandHistory.shift();
    }

    emitProgress("done", 100);
    return result;
  }

  /**
   * Destroy a session and clean up its working directory.
   */
  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = "destroyed";

    // Clean up working directory
    try {
      if (fs.existsSync(session.workingDir) && session.workingDir.startsWith(this.basePath)) {
        fs.rmSync(session.workingDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[SandboxManager] Failed to cleanup ${session.workingDir}:`, err);
    }

    this.sessions.delete(sessionId);
    console.log(`[SandboxManager] Session destroyed: ${session.name} (${sessionId})`);
    return true;
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): SandboxSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions.
   */
  listSessions(): SandboxSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === "active");
  }

  /**
   * Get global sandbox statistics.
   */
  getStats(): SandboxStats {
    return {
      totalSessions: this.sessions.size,
      activeSessions: this.listSessions().length,
      totalCommandsExecuted: this.totalCommandsExecuted,
      totalBlockedCommands: this.totalBlockedCommands,
      availableTiers: this.getAvailableTiers(),
      dockerAvailable: this.dockerAvailable,
      firejailAvailable: this.firejailAvailable,
    };
  }

  /**
   * Update session configuration (e.g., change tier, timeout).
   */
  updateSessionConfig(sessionId: string, updates: Partial<SandboxSessionConfig>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return false;
    session.config = { ...session.config, ...updates };
    return true;
  }

  /**
   * Replay a command from history (re-execute it).
   */
  async replayCommand(
    sessionId: string,
    historyIndex: number,
    progressCb?: (progress: CommandProgress) => void
  ): Promise<CommandResult> {
    const session = this.sessions.get(sessionId);
    if (!session) return this.makeErrorResult("", "Session not found", "unknown");
    const historical = session.commandHistory[historyIndex];
    if (!historical) return this.makeErrorResult("", "History index out of range", session.config.tier);
    return this.executeCommand(sessionId, historical.command, progressCb);
  }

  /**
   * Graceful shutdown — destroy all sessions and stop cleanup timer.
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    for (const [id] of this.sessions) {
      await this.destroySession(id);
    }
    console.log("[SandboxManager] Shutdown complete");
  }

  // ─── Execution Tiers ───────────────────────────────────────────────────

  private async executeNative(
    session: SandboxSession,
    command: string,
    commandId: string,
    sideEffects: SideEffectReport,
    startTime: number,
    emitProgress: (phase: CommandProgress["phase"], pct: number, detail?: string) => void
  ): Promise<CommandResult> {
    emitProgress("executing", 30, "Executing with restricted environment...");
    emitProgress("streaming", 50, "Capturing output...");

    return this.spawnCommand(session, command, commandId, sideEffects, startTime, {
      shell: false,
      env: session.env,
      cwd: session.workingDir,
    });
  }

  private async executeProcess(
    session: SandboxSession,
    command: string,
    commandId: string,
    sideEffects: SideEffectReport,
    startTime: number,
    emitProgress: (phase: CommandProgress["phase"], pct: number, detail?: string) => void
  ): Promise<CommandResult> {
    emitProgress("executing", 30, "Executing in process isolation...");
    emitProgress("streaming", 50, "Capturing output...");

    const env = {
      ...session.env,
      NODE_OPTIONS: `--max-old-space-size=${session.config.memoryLimitMb}`,
    };

    return this.spawnCommand(session, command, commandId, sideEffects, startTime, {
      shell: true,
      env,
      cwd: session.workingDir,
    });
  }

  private async executeDocker(
    session: SandboxSession,
    command: string,
    commandId: string,
    sideEffects: SideEffectReport,
    startTime: number,
    emitProgress: (phase: CommandProgress["phase"], pct: number, detail?: string) => void
  ): Promise<CommandResult> {
    if (!this.dockerAvailable) {
      return this.executeProcess(session, command, commandId, sideEffects, startTime, emitProgress);
    }

    emitProgress("executing", 30, "Spawning Docker container...");

    const containerName = `mai-sandbox-${session.id}-${commandId}`;
    const networkFlag = session.config.networkAccess ? "" : "--network none";
    const memoryFlag = `--memory=${session.config.memoryLimitMb}m`;
    const pidsFlag = "--pids-limit 64";

    const dockerCmd = [
      "docker", "run", "--rm",
      "--label", "mai-sandbox=true",
      "--label", `mai-session=${session.id}`,
      networkFlag, memoryFlag, pidsFlag,
      "--name", containerName,
      "--workdir", "/sandbox",
      "node:20-slim",
      "sh", "-c", command,
    ];

    emitProgress("streaming", 60, "Container running...");

    try {
      const { stdout, stderr } = await execAsync(dockerCmd.join(" "), {
        timeout: session.config.commandTimeoutMs,
        maxBuffer: session.config.maxOutputBytes,
      });

      return {
        id: commandId, command, sessionId: session.id,
        success: true, stdout: stdout.trim(), stderr: stderr.trim(),
        exitCode: 0, durationMs: Date.now() - startTime, timedOut: false,
        tier: "docker", sideEffects, timestamp: startTime,
      };
    } catch (err: any) {
      return {
        id: commandId, command, sessionId: session.id,
        success: false,
        stdout: err.stdout?.trim() ?? "",
        stderr: err.stderr?.trim() ?? err.message,
        exitCode: err.code ?? 1,
        durationMs: Date.now() - startTime,
        timedOut: err.killed === true,
        tier: "docker", sideEffects, timestamp: startTime,
      };
    }
  }

  private async executeFirejail(
    session: SandboxSession,
    command: string,
    commandId: string,
    sideEffects: SideEffectReport,
    startTime: number,
    emitProgress: (phase: CommandProgress["phase"], pct: number, detail?: string) => void
  ): Promise<CommandResult> {
    if (!this.firejailAvailable) {
      return this.executeProcess(session, command, commandId, sideEffects, startTime, emitProgress);
    }

    emitProgress("executing", 30, "Spawning firejail sandbox...");
    emitProgress("streaming", 50, "Capturing output...");

    const firejailArgs = [
      "--quiet",
      `--private-cwd=${session.workingDir}`,
      `--rlimit-as=${session.config.memoryLimitMb}M`,
      "--noprofile", "--norc",
    ];

    if (!session.config.networkAccess) {
      firejailArgs.push("--net=none");
    }

    firejailArgs.push("--", "sh", "-c", command);

    return this.spawnCommand(session, command, commandId, sideEffects, startTime, {
      shell: false,
      env: session.env,
      cwd: session.workingDir,
      firejailArgs,
    });
  }

  // ─── Core Spawn Logic ──────────────────────────────────────────────────

  private spawnCommand(
    session: SandboxSession,
    command: string,
    commandId: string,
    sideEffects: SideEffectReport,
    startTime: number,
    opts: {
      shell: boolean;
      env: Record<string, string>;
      cwd: string;
      firejailArgs?: string[];
    }
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const useFirejail = opts.firejailArgs && this.firejailAvailable;
      const cmd = useFirejail ? "firejail" : (opts.shell ? "sh" : command.split(/\s+/)[0]);
      const args = useFirejail
        ? opts.firejailArgs!
        : opts.shell
          ? ["-c", command]
          : command.split(/\s+/).slice(1);

      const proc: ChildProcess = spawn(cmd, args, {
        cwd: opts.cwd,
        env: opts.env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let totalBytes = 0;
      const maxBytes = session.config.maxOutputBytes;
      let timedOut = false;

      proc.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        totalBytes += chunk.length;
        if (totalBytes <= maxBytes) {
          stdout += text;
        }
        // Stream to callback
        this.outputStreamCallback?.(session.id, commandId, "stdout", text);
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        totalBytes += chunk.length;
        if (totalBytes <= maxBytes) {
          stderr += text;
        }
        this.outputStreamCallback?.(session.id, commandId, "stderr", text);
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGKILL");
      }, session.config.commandTimeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          id: commandId, command, sessionId: session.id,
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          durationMs: Date.now() - startTime,
          timedOut,
          tier: session.config.tier,
          sideEffects,
          timestamp: startTime,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          id: commandId, command, sessionId: session.id,
          success: false, stdout: "", stderr: err.message,
          exitCode: 1, durationMs: Date.now() - startTime,
          timedOut: false, tier: session.config.tier,
          sideEffects, timestamp: startTime,
        });
      });
    });
  }

  // ─── Safety Validation ──────────────────────────────────────────────────

  private validateCommand(command: string): { blocked: boolean; warnings: string[]; reason?: string } {
    const warnings: string[] = [];

    for (const { pattern, reason, severity } of DANGEROUS_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(command)) {
        if (severity === "block") {
          return { blocked: true, warnings, reason };
        }
        warnings.push(`[WARN] ${reason}`);
      }
    }

    return { blocked: false, warnings };
  }

  // ─── Environment Building ───────────────────────────────────────────────

  private buildSafeEnv(extra?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {};
    for (const key of SAFE_ENV_KEYS) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key] as string;
      }
    }
    // Merge extra vars (session-specific)
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        env[k] = v;
      }
    }
    return env;
  }

  // ─── Session Cleanup ───────────────────────────────────────────────────

  private async cleanupStaleSessions(): Promise<void> {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.status === "active" && (now - session.lastActivityAt) > session.config.sessionTtlMs) {
        console.log(`[SandboxManager] Cleaning up stale session: ${session.name} (${id})`);
        await this.destroySession(id);
      }
    }

    // Also cleanup orphaned Docker containers
    if (this.dockerAvailable) {
      try {
        await execAsync("docker container prune -f --filter label=mai-sandbox=true", { timeout: 10_000 });
      } catch { /* docker not running */ }
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private getAvailableTiers(): IsolationTier[] {
    const tiers: IsolationTier[] = ["native", "process"];
    if (this.dockerAvailable) tiers.push("docker");
    if (this.firejailAvailable) tiers.push("firejail");
    return tiers;
  }

  private makeErrorResult(command: string, error: string, tier: string): CommandResult {
    return {
      id: crypto.randomBytes(4).toString("hex"),
      command, sessionId: "", success: false,
      stdout: "", stderr: error, exitCode: 1,
      durationMs: 0, timedOut: false, tier: tier as IsolationTier,
      sideEffects: null, timestamp: Date.now(),
    };
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: SandboxManager | null = null;

export function getSandboxManager(basePath?: string): SandboxManager {
  if (!_instance) {
    _instance = new SandboxManager(basePath);
  }
  return _instance;
}
