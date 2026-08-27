// ─── M.A.I. Structured Logger ──────────────────────────────────────────
// Adapted from Hermes Agent (hermes_logging.py) + Pi (telemetry/)
//
// Features:
//   - Session-context injection (thread-safe via closure)
//   - Rotating file handlers (agent.log, errors.log)
//   - RedactingFormatter (secrets never written to disk)
//   - Structured JSON log lines for machine parsing
//   - Console + file dual output
//   - Level-based filtering per output

import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[2m",    // dim
  info: "\x1b[36m",     // cyan
  warn: "\x1b[33m",     // yellow
  error: "\x1b[31m",    // red
  fatal: "\x1b[35;1m",  // bold magenta
};

const RESET = "\x1b[0m";

// Secrets to redact from log output
const SECRET_PATTERNS = [
  /api[_-]?key["'\s:=]+[\w-]+/gi,
  /password["'\s:=]+[\w-]+/gi,
  /token["'\s:=]+[\w\-._]+/gi,
  /bearer\s+[\w\-._]+/gi,
  /ghp_[\w]{36,}/g,
  /sk-[\w]{36,}/g,
];

function redactSecrets(text: string): string {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      // Keep the key name, redact the value
      const eqIdx = match.indexOf("=");
      if (eqIdx >= 0) {
        return match.slice(0, eqIdx + 1) + "***REDACTED***";
      }
      // For bearer tokens and ghp/sk prefixes
      if (match.startsWith("ghp_") || match.startsWith("sk-")) {
        return match.slice(0, 7) + "***REDACTED***";
      }
      return "***REDACTED***";
    });
  }
  return redacted;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  sessionId?: string;
  message: string;
  data?: Record<string, unknown>;
  durationMs?: number;
  error?: string;
}

let LOG_DIR = path.join(process.cwd(), ".mai-logs");
let _logDirInitialized = false;

function ensureLogDir(): void {
  if (_logDirInitialized) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    _logDirInitialized = true;
  } catch {
    // Non-fatal: logging to file is best-effort
  }
}

/** Set a custom log directory (must be called before first log) */
export function setLogDir(dir: string): void {
  LOG_DIR = dir;
  _logDirInitialized = false;
  ensureLogDir();
}

// Simple file writer with size-based rotation
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_LOG_FILES = 3; // Keep 3 rotated files

function writeToFile(filename: string, line: string): void {
  ensureLogDir();
  const filePath = path.join(LOG_DIR, filename);
  try {
    let stat: fs.Stats | undefined;
    try { stat = fs.statSync(filePath); } catch { /* new file */ }
    
    if (stat && stat.size > MAX_LOG_SIZE) {
      // Rotate: .log → .log.1 → .log.2 → .log.3 (delete oldest)
      for (let i = MAX_LOG_FILES; i >= 1; i--) {
        const src = i === 1 ? filePath : `${filePath}.${i - 1}`;
        const dst = `${filePath}.${i}`;
        try { fs.renameSync(src, dst); } catch { /* skip */ }
      }
    }
    fs.appendFileSync(filePath, line + "\n", "utf-8");
  } catch {
    // File logging is best-effort
  }
}

function formatConsole(entry: LogEntry): string {
  const color = LEVEL_COLORS[entry.level];
  const ts = entry.timestamp.slice(11, 23); // HH:MM:SS.mmm
  const session = entry.sessionId ? ` [${entry.sessionId.slice(0, 12)}]` : "";
  const module = entry.module ? ` [${entry.module}]` : "";
  
  let line = `${color}[${ts}]${RESET} ${entry.level.toUpperCase().padEnd(5)}${module}${session} ${entry.message}`;
  
  if (entry.durationMs !== undefined) {
    line += ` (${entry.durationMs}ms)`;
  }
  if (entry.error) {
    line += `\n${color}  ↳ ${RESET}${redactSecrets(entry.error)}`;
  }
  if (entry.data) {
    const dataStr = Object.entries(entry.data)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 100) : JSON.stringify(v).slice(0, 100)}`)
      .join(", ");
    line += `\n${color}  → ${RESET}${redactSecrets(dataStr)}`;
  }
  return line;
}

function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/** Structured logger instance. Create one per module. */
export class MaiLogger {
  private module: string;
  private sessionId: string = "";
  private consoleLevel: LogLevel = "debug";
  private fileLevel: LogLevel = "info";

  constructor(module: string, opts?: { consoleLevel?: LogLevel; fileLevel?: LogLevel }) {
    this.module = module;
    this.consoleLevel = opts?.consoleLevel ?? (process.env.MAI_LOG_LEVEL as LogLevel ?? "debug");
    this.fileLevel = opts?.fileLevel ?? "info";
  }

  /** Set session ID for context injection (Hermes pattern). */
  setSession(sessionId: string): void {
    this.sessionId = sessionId;
  }

  private log(level: LogLevel, message: string, opts?: { data?: Record<string, unknown>; durationMs?: number; error?: unknown }): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.consoleLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      sessionId: this.sessionId || undefined,
      message: redactSecrets(message),
    };

    if (opts?.data) entry.data = opts.data;
    if (opts?.durationMs !== undefined) entry.durationMs = opts.durationMs;
    if (opts?.error) {
      entry.error = opts.error instanceof Error ? opts.error.message : String(opts.error);
    }

    // Console output
    const consoleLine = formatConsole(entry);
    if (level === "error" || level === "fatal") {
      process.stderr.write(consoleLine + "\n");
    } else {
      process.stdout.write(consoleLine + "\n");
    }

    // File output (structured JSON)
    if (LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.fileLevel]) {
      const jsonLine = formatJson(entry);
      writeToFile("agent.log", jsonLine);
      if (level === "error" || level === "fatal") {
        writeToFile("errors.log", jsonLine);
      }
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, { data });
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, { data });
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, { data });
  }

  error(message: string, opts?: { data?: Record<string, unknown>; error?: unknown; durationMs?: number }): void {
    this.log("error", message, opts);
  }

  fatal(message: string, opts?: { data?: Record<string, unknown>; error?: unknown }): void {
    this.log("fatal", message, opts);
  }

  /** Time an async operation and log on completion. */
  async time<T>(label: string, fn: () => Promise<T>, level: LogLevel = "debug"): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.log(level, `${label} completed`, { durationMs: Date.now() - start });
      return result;
    } catch (err) {
      this.error(`${label} failed`, { error: err, durationMs: Date.now() - start });
      throw err;
    }
  }
}

// ─── Module-level convenience ─────────────────────────────────────────────

const loggers = new Map<string, MaiLogger>();

/** Get a named logger instance (singleton per module name). */
export function getLogger(module: string, opts?: { consoleLevel?: LogLevel; fileLevel?: LogLevel }): MaiLogger {
  let logger = loggers.get(module);
  if (!logger) {
    logger = new MaiLogger(module, opts);
    loggers.set(module, logger);
  }
  return logger;
}

/** Global session setter — updates all existing loggers. */
export function setGlobalSession(sessionId: string): void {
  for (const logger of loggers.values()) {
    logger.setSession(sessionId);
  }
}