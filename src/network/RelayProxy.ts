// ─── M.A.I. Relay Proxy ─────────────────────────────────────────────────
// Lightweight WebSocket relay proxy that bridges external connections
// (via tunnel) to the internal HUD server.
//
// Features:
//   - Token-based authentication for external connections
//   - Per-connection rate limiting
//   - Connection logging
//   - Bidirectional message forwarding

import { WebSocketServer, WebSocket } from "ws";
import { createServer, IncomingMessage } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../core/constants.js";
import crypto from "node:crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RelayProxyConfig {
  port: number;
  targetWsUrl: string;
  authToken: string;
  maxConnections: number;
  rateLimitPerMinute: number;
  logConnections: boolean;
  logMessages: boolean;
}

interface TrackedConnection {
  ws: WebSocket;
  remoteAddress: string;
  connectedAt: number;
  messageCount: number;
  messageTimestamps: number[];
  authenticated: boolean;
  id: string;
}

interface ConnectionLogEntry {
  id: string;
  event: "connect" | "disconnect" | "auth_success" | "auth_failure" | "rate_limited" | "message";
  remoteAddress: string;
  timestamp: number;
  detail?: string;
}

// ─── Default Configuration ──────────────────────────────────────────────────

const DEFAULT_CONFIG: RelayProxyConfig = {
  port: 9090,
  targetWsUrl: "ws://localhost:8080",
  authToken: "",
  maxConnections: 50,
  rateLimitPerMinute: 60,
  logConnections: true,
  logMessages: false,
};

const LOG_PATH = path.join(PROJECT_ROOT, "state", "relay-connections.jsonl");

// ─── Relay Proxy ────────────────────────────────────────────────────────────

export class RelayProxy {
  private config: RelayProxyConfig;
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private connections: Map<string, TrackedConnection> = new Map();
  private connectionLog: ConnectionLogEntry[] = [];
  private running = false;

  constructor(config?: Partial<RelayProxyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Auto-generate auth token if not provided
    if (!this.config.authToken) {
      this.config.authToken = crypto.randomBytes(32).toString("hex");
      console.log(`[Relay] Generated auth token: ${this.config.authToken.slice(0, 16)}...`);
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Start the relay proxy server.
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log("[Relay] Already running");
      return;
    }

    await this.loadLog();

    // Create an HTTP server for the WebSocket upgrade
    this.server = createServer((req, res) => {
      // Simple health endpoint
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          connections: this.connections.size,
          maxConnections: this.config.maxConnections,
        }));
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    });

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.port, () => {
        console.log(`[Relay] Proxy listening on port ${this.config.port}`);
        console.log(`[Relay] Forwarding to ${this.config.targetWsUrl}`);
        resolve();
      });
    });

    this.running = true;
  }

  /**
   * Stop the relay proxy and disconnect all clients.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    // Disconnect all external clients
    for (const [id, conn] of this.connections) {
      try {
        conn.ws.close(1001, "Relay shutting down");
      } catch { /* ignore */ }
    }
    this.connections.clear();

    // Close servers
    this.wss?.close();
    this.server?.close();
    this.wss = null;
    this.server = null;
    this.running = false;

    await this.flushLog();
    console.log("[Relay] Proxy stopped");
  }

  /**
   * Get the current connection count and auth token info.
   */
  getStatus(): { connections: number; maxConnections: number; running: boolean; authTokenPreview: string } {
    return {
      connections: this.connections.size,
      maxConnections: this.config.maxConnections,
      running: this.running,
      authTokenPreview: this.config.authToken.slice(0, 8) + "...",
    };
  }

  /**
   * Get the full auth token (for display on first setup).
   */
  getAuthToken(): string {
    return this.config.authToken;
  }

  /**
   * Regenerate the auth token.
   */
  regenerateToken(): string {
    this.config.authToken = crypto.randomBytes(32).toString("hex");
    console.log(`[Relay] New auth token: ${this.config.authToken.slice(0, 16)}...`);
    return this.config.authToken;
  }

  // ─── Connection Handling ─────────────────────────────────────────────────

  /**
   * Handle a new incoming WebSocket connection.
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const id = crypto.randomUUID();
    const remoteAddress = req.socket.remoteAddress ?? "unknown";

    // Check max connections
    if (this.connections.size >= this.config.maxConnections) {
      ws.close(1013, "Maximum connections reached");
      this.logEvent({ id, event: "disconnect", remoteAddress, timestamp: Date.now(), detail: "Max connections reached" });
      return;
    }

    const conn: TrackedConnection = {
      ws,
      remoteAddress,
      connectedAt: Date.now(),
      messageCount: 0,
      messageTimestamps: [],
      authenticated: false,
      id,
    };

    this.connections.set(id, conn);
    this.logEvent({ id, event: "connect", remoteAddress, timestamp: Date.now() });

    if (this.config.logConnections) {
      console.log(`[Relay] Connection from ${remoteAddress} (${this.connections.size}/${this.config.maxConnections})`);
    }

    // Connect to internal HUD server
    let internalWs: WebSocket | null = null;
    try {
      internalWs = new WebSocket(this.config.targetWsUrl);
    } catch (err) {
      console.error(`[Relay] Failed to connect to internal HUD: ${err instanceof Error ? err.message : err}`);
      ws.close(1011, "Internal HUD unavailable");
      this.connections.delete(id);
      return;
    }

    // Internal → External forwarding
    internalWs.on("message", (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    internalWs.on("error", (err) => {
      console.error(`[Relay] Internal HUD connection error: ${err.message}`);
    });

    internalWs.on("close", () => {
      ws.close(1011, "Internal HUD disconnected");
    });

    // External → Internal forwarding (with auth + rate limiting)
    ws.on("message", (data) => {
      this.handleExternalMessage(conn, internalWs, data);
    });

    ws.on("close", (code, reason) => {
      this.connections.delete(id);
      internalWs?.close();
      this.logEvent({ id, event: "disconnect", remoteAddress, timestamp: Date.now(), detail: `code=${code}` });
      if (this.config.logConnections) {
        console.log(`[Relay] Disconnected ${remoteAddress} (code: ${code})`);
      }
    });

    ws.on("error", (err) => {
      console.error(`[Relay] Client error: ${err.message}`);
      this.connections.delete(id);
      internalWs?.close();
    });
  }

  /**
   * Handle a message from an external client.
   */
  private handleExternalMessage(conn: TrackedConnection, internalWs: WebSocket | null, data: WebSocket.Data): void {
    // Rate limiting: check messages per minute
    const now = Date.now();
    conn.messageTimestamps = conn.messageTimestamps.filter(t => now - t < 60_000);

    if (conn.messageTimestamps.length >= this.config.rateLimitPerMinute) {
      conn.ws.close(1008, "Rate limit exceeded");
      this.logEvent({
        id: conn.id, event: "rate_limited", remoteAddress: conn.remoteAddress,
        timestamp: now, detail: `${conn.messageTimestamps.length}/min`,
      });
      return;
    }

    conn.messageCount++;
    conn.messageTimestamps.push(now);

    // Parse and check authentication
    try {
      const parsed = JSON.parse(String(data));

      // Auth messages: { type: "auth", token: "..." }
      if (parsed.type === "auth") {
        if (parsed.token === this.config.authToken) {
          conn.authenticated = true;
          conn.ws.send(JSON.stringify({ type: "auth_result", ok: true }));
          this.logEvent({ id: conn.id, event: "auth_success", remoteAddress: conn.remoteAddress, timestamp: now });
          if (this.config.logConnections) {
            console.log(`[Relay] Authenticated: ${conn.remoteAddress}`);
          }
        } else {
          conn.ws.send(JSON.stringify({ type: "auth_result", ok: false, error: "Invalid token" }));
          this.logEvent({ id: conn.id, event: "auth_failure", remoteAddress: conn.remoteAddress, timestamp: now });
        }
        return;
      }

      // Reject unauthenticated messages
      if (!conn.authenticated) {
        conn.ws.send(JSON.stringify({ type: "error", error: "Not authenticated. Send { type: \"auth\", token: \"...\" }" }));
        return;
      }

      // Forward to internal HUD
      if (internalWs && internalWs.readyState === WebSocket.OPEN) {
        internalWs.send(data);
      }

      if (this.config.logMessages) {
        this.logEvent({
          id: conn.id, event: "message", remoteAddress: conn.remoteAddress,
          timestamp: now, detail: String(data).slice(0, 200),
        });
      }
    } catch {
      // Non-JSON message — forward as-is if authenticated
      if (conn.authenticated && internalWs && internalWs.readyState === WebSocket.OPEN) {
        internalWs.send(data);
      }
    }
  }

  // ─── Connection Logging ──────────────────────────────────────────────────

  /**
   * Log a connection event.
   */
  private logEvent(entry: ConnectionLogEntry): void {
    this.connectionLog.push(entry);

    // Keep last 1000 entries in memory
    if (this.connectionLog.length > 1000) {
      this.connectionLog = this.connectionLog.slice(-500);
    }

    // Append to disk (fire-and-forget)
    fs.appendFile(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8").catch(() => {});
  }

  /**
   * Load existing connection log from disk.
   */
  private async loadLog(): Promise<void> {
    try {
      const content = await fs.readFile(LOG_PATH, "utf-8");
      const lines = content.trim().split("\n").filter(l => l.trim());
      for (const line of lines.slice(-100)) {
        try {
          this.connectionLog.push(JSON.parse(line));
        } catch { /* skip malformed */ }
      }
    } catch { /* no log yet */ }
  }

  /**
   * Flush any pending log entries to disk.
   */
  private async flushLog(): Promise<void> {
    // Already appending on each event, this is a no-op safety net
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: RelayProxy | null = null;

export function getRelayProxy(config?: Partial<RelayProxyConfig>): RelayProxy {
  if (!_instance) {
    _instance = new RelayProxy(config);
  }
  return _instance;
}
