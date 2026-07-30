// ─── M.A.I. Tunnel Manager ─────────────────────────────────────────────────
// Manages reverse tunnels for exposing M.A.I. to the internet securely.
// Supports Cloudflare Tunnel (cloudflared), Ngrok, and WireGuard.
//
// Auto-detects installed tools, persists configuration, monitors status,
// auto-reconnects on failure, and generates public URLs.

import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../core/constants.js";
import { promisify } from "node:util";

const execAsync = promisify((await import("node:child_process")).exec);

// ─── Types ──────────────────────────────────────────────────────────────────

export type TunnelMethod = "cloudflare" | "ngrok" | "wireguard";

export type TunnelStatus = "down" | "starting" | "up" | "reconnecting" | "error";

export interface TunnelConfig {
  method: TunnelMethod;
  options: Record<string, string>;
  autoStart: boolean;
  autoReconnect: boolean;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  healthCheckIntervalMs: number;
  targetPort: number;
}

export interface TunnelState {
  status: TunnelStatus;
  method: TunnelMethod | null;
  publicUrl: string | null;
  pid: number | null;
  startedAt: number | null;
  reconnectAttempts: number;
  lastError: string | null;
  lastHealthCheck: number | null;
}

interface AvailableMethod {
  method: TunnelMethod;
  installed: boolean;
 command: string;
  version?: string;
}

// ─── Default Configuration ──────────────────────────────────────────────────

const DEFAULT_CONFIG: TunnelConfig = {
  method: "cloudflare",
  options: {},
  autoStart: false,
  autoReconnect: true,
  reconnectDelayMs: 5000,
  maxReconnectAttempts: 10,
  healthCheckIntervalMs: 30_000,
  targetPort: 3000,
};

const CONFIG_PATH = path.join(PROJECT_ROOT, "state", "tunnel-config.json");

// ─── Tunnel Manager ─────────────────────────────────────────────────────────

export class TunnelManager {
  private config: TunnelConfig;
  private state: TunnelState;
  private process: ChildProcess | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private availableMethods: AvailableMethod[] = [];
  private initialized = false;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.state = {
      status: "down",
      method: null,
      publicUrl: null,
      pid: null,
      startedAt: null,
      reconnectAttempts: 0,
      lastError: null,
      lastHealthCheck: null,
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Initialize the tunnel manager: load config, detect tools.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.loadConfig();
    this.availableMethods = await this.detectTools();
    this.initialized = true;

    console.log(
    `[Tunnel] Initialized. Available methods: ${this.availableMethods.filter(m => m.installed).map(m => m.method).join(", ") || "none"}`
    );
  }

  /**
   * Start a tunnel using the specified method or the configured default.
   */
  async startTunnel(method?: TunnelMethod, options?: Record<string, string>): Promise<{ url: string | null; error?: string }> {
    await this.initialize();

    // Stop existing tunnel if running
    if (this.state.status === "up" || this.state.status === "starting" || this.state.status === "reconnecting") {
      await this.stopTunnel();
    }

    const chosenMethod = method ?? this.config.method;
    const tool = this.availableMethods.find(m => m.method === chosenMethod);

    if (!tool || !tool.installed) {
      const error = `Tunnel tool '${chosenMethod}' is not installed`;
      this.setState({ status: "error", lastError: error });
      return { url: null, error };
    }

    // Merge options
    const mergedOptions = { ...this.config.options, ...options };

    this.setState({
      status: "starting",
      method: chosenMethod,
      publicUrl: null,
      lastError: null,
      reconnectAttempts: 0,
    });

    console.log(`[Tunnel] Starting ${chosenMethod} tunnel targeting localhost:${this.config.targetPort}`);

    try {
      const result = await this.spawnTunnel(chosenMethod, tool.command, mergedOptions);

      if (result.url) {
        this.setState({
          status: "up",
          publicUrl: result.url,
          startedAt: Date.now(),
        });
        this.startHealthCheck();
        console.log(`[Tunnel] ✅ Tunnel UP: ${result.url}`);
        return { url: result.url };
      } else {
        throw new Error("No public URL was generated");
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.setState({ status: "error", lastError: error });
      console.error(`[Tunnel] ✗ Failed to start: ${error}`);

      if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }

      return { url: null, error };
    }
  }

  /**
   * Stop the active tunnel.
   */
  async stopTunnel(): Promise<void> {
    this.stopHealthCheck();
    this.clearReconnectTimer();

    if (this.process) {
      try {
        this.process.kill("SIGTERM");
        // Force kill after 5s if still alive
        const forceKillTimer = setTimeout(() => {
          try { this.process?.kill("SIGKILL"); } catch { /* already dead */ }
        }, 5000);
        this.process.on("exit", () => clearTimeout(forceKillTimer));
      } catch { /* process may have already exited */ }
      this.process = null;
    }

    this.setState({
      status: "down",
      publicUrl: null,
      pid: null,
      startedAt: null,
      reconnectAttempts: 0,
    });
    console.log("[Tunnel] Stopped");
  }

  /**
   * Get the current tunnel status and state.
   */
  getStatus(): TunnelState {
    return { ...this.state };
  }

  /**
   * List all available tunnel methods and their installation status.
   */
  listMethods(): AvailableMethod[] {
    return [...this.availableMethods];
  }

  /**
   * Update tunnel configuration and persist to disk.
   */
  async configure(method: TunnelMethod, options: Partial<TunnelConfig>): Promise<TunnelConfig> {
    this.config = { ...this.config, method, ...options };
    await this.saveConfig();
    console.log(`[Tunnel] Configuration updated: method=${this.config.method}`);
    return { ...this.config };
  }

  /**
   * Get the generated public URL (if tunnel is up).
   */
  generateTunnelUrl(): string | null {
    return this.state.publicUrl;
  }

  /**
   * Shutdown the tunnel manager — stop tunnel, clear timers.
   */
  async shutdown(): Promise<void> {
    await this.stopTunnel();
    console.log("[Tunnel] Manager shut down");
  }

  // ─── Tool Detection ──────────────────────────────────────────────────────

  /**
   * Detect which tunnel tools are installed on the system.
   */
  private async detectTools(): Promise<AvailableMethod[]> {
    const tools: AvailableMethod[] = [
      { method: "cloudflare", command: "cloudflared", installed: false },
      { method: "ngrok", command: "ngrok", installed: false },
      { method: "wireguard", command: "wg-quick", installed: false },
    ];

    for (const tool of tools) {
 try {
   const { stdout } = await execAsync(`which ${tool.command} 2>/dev/null && ${tool.command} --version 2>/dev/null || true`, {
     timeout: 5000,
   });
   tool.installed = stdout.trim().length > 0;
   tool.version = stdout.trim().split("\n")[0] || undefined;
 } catch {
   tool.installed = false;
 }
    }

    return tools;
  }

  // ─── Tunnel Spawning ─────────────────────────────────────────────────────

  /**
   * Spawn a tunnel process and wait for the public URL from stdout.
   */
  private spawnTunnel(
    method: TunnelMethod,
    command: string,
    options: Record<string, string>
  ): Promise<{ url: string }> {
    return new Promise((resolve, reject) => {
      let args: string[];
      let urlPattern: RegExp;

      switch (method) {
        case "cloudflare":
          args = ["tunnel", "--url", `http://localhost:${this.config.targetPort}`];
          if (options.region) args.push("--region", options.region);
          urlPattern = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
          break;

        case "ngrok":
          args = ["http", String(this.config.targetPort)];
          if (options.region) args.push("--region", options.region);
          if (options.authtoken) args.push("--authtoken", options.authtoken);
          urlPattern = /https:\/\/[a-zA-Z0-9-]+\.ngrok(-free)?\.app/;
          break;

        case "wireguard":
          // WireGuard requires pre-configuration via wg-quick
          args = ["up", options.configFile || "wg0"];
          urlPattern = /https?:\/\/[\d.]+|tunnel:\/\/\S+/;
          break;

        default:
          reject(new Error(`Unknown tunnel method: ${method}`));
          return;
      }

      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...options },
      });

      this.process = proc;
      this.setState({ pid: proc.pid ?? null });

      let output = "";
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error("Tunnel startup timed out after 30s"));
          proc.kill();
        }
      }, 30_000);

      proc.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        console.log(`[Tunnel:${method}] ${text.trim()}`);

        if (!resolved) {
          const match = output.match(urlPattern);
          if (match) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ url: match[0] });
          }
        }
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        console.log(`[Tunnel:${method}:stderr] ${text.trim()}`);

        if (!resolved) {
          const match = output.match(urlPattern);
          if (match) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ url: match[0] });
          }
        }
      });

      proc.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`Failed to spawn ${command}: ${err.message}`));
        }
      });

      proc.on("exit", (code, signal) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`Tunnel process exited with code ${code}, signal ${signal}`));
        } else if (this.state.status === "up") {
          // Tunnel was running but crashed
          console.error(`[Tunnel] Process exited unexpectedly: code=${code}, signal=${signal}`);
          this.setState({ status: "error", lastError: `Process exited: code=${code}` });
          if (this.config.autoReconnect) {
            this.scheduleReconnect();
          }
        }
      });
    });
  }

  // ─── Health Check ────────────────────────────────────────────────────────

  /**
   * Start periodic health checks against the tunnel endpoint.
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckTimer = setInterval(async () => {
      if (!this.state.publicUrl) return;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(this.state.publicUrl, {
          method: "HEAD",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        this.setState({ lastHealthCheck: Date.now() });

        if (!response.ok && this.state.status === "up") {
          console.warn(`[Tunnel] Health check returned ${response.status}`);
        }
      } catch (err) {
        this.setState({ lastHealthCheck: Date.now() });
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Tunnel] Health check failed: ${msg}`);

        if (this.config.autoReconnect) {
          this.scheduleReconnect();
        }
      }
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stop the health check timer.
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // ─── Auto-Reconnect ──────────────────────────────────────────────────────

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.state.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(
      `[Tunnel] Max reconnect attempts reached (${this.config.maxReconnectAttempts}). Giving up.`
      );
      this.setState({ status: "error", lastError: "Max reconnect attempts reached" });
      return;
    }

    this.clearReconnectTimer();
    this.setState({ status: "reconnecting" });

    const delay = this.config.reconnectDelayMs * Math.pow(1.5, this.state.reconnectAttempts);
    const attempt = this.state.reconnectAttempts + 1;

    console.log(`[Tunnel] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${attempt}/${this.config.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      this.setState({ reconnectAttempts: attempt });
      const method = this.state.method ?? this.config.method;
      await this.startTunnel(method);
    }, delay);
  }

  /**
   * Clear any pending reconnect timer.
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Configuration Persistence ───────────────────────────────────────────

  /**
   * Load tunnel configuration from disk.
   */
  private async loadConfig(): Promise<void> {
    try {
      const content = await fs.readFile(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(content);
      this.config = { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      // No config file yet — use defaults
    }
  }

  /**
   * Save tunnel configuration to disk.
   */
  private async saveConfig(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
      await fs.writeFile(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      console.error(`[Tunnel] Failed to save config: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ─── State Management ────────────────────────────────────────────────────

  /**
   * Update the tunnel state and log changes.
   */
  private setState(partial: Partial<TunnelState>): void {
    const oldStatus = this.state.status;
    Object.assign(this.state, partial);
    if (partial.status && partial.status !== oldStatus) {
      console.log(`[Tunnel] Status: ${oldStatus} → ${partial.status}`);
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: TunnelManager | null = null;

export function getTunnelManager(): TunnelManager {
  if (!_instance) {
    _instance = new TunnelManager();
  }
  return _instance;
}
