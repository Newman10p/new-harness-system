// ─── M.A.I. HUD Server ────────────────────────────────────────────────────
// WebSocket server for the Iron Man-style HUD frontend.
//
// Architecture:
//   - WS server on port 8080 (configurable via WS_PORT env var)
//   - 5 outbound channels (agent → HUD):
//       jarvis_speech, activity_log, system_metrics, threat_level, reactor_pulse
//   - 2 inbound message types (HUD → agent):
//       user_input      → AgentLoop.processUserMessage()
//       approval_response → AgentLoop.resolveApproval()
//
// All connected clients receive all broadcast messages (no filtering).
// Messages are JSON: { channel, payload, timestamp }.

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type {
  HudChannel,
  HudPayloads,
  HudMessage,
  HudEmitter,
} from "../types/index.js";
import type { AgentLoop } from "../core/AgentLoop.js";

// ─── Inbound Message Types ─────────────────────────────────────────────────
interface InboundUserInput {
  type: "user_input";
  text: string;
}

interface InboundApprovalResponse {
  type: "approval_response";
  approved: boolean;
}

type InboundMessage = InboundUserInput | InboundApprovalResponse;

export class HudServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private agentLoop: AgentLoop | null = null;

  constructor(
    httpServer: Server | undefined,
    private port: number = 8080
  ) {
    this.wss = new WebSocketServer({
      port: httpServer ? undefined : port,
      server: httpServer,
    });

    this.wss.on("connection", (ws) => {
      this.handleConnection(ws);
    });

    this.wss.on("listening", () => {
      const addr = this.wss.address();
      const actualPort = typeof addr === "object" && addr !== null ? addr.port : (addr ?? port);
      console.log(`[HUD] WebSocket server listening on ws://localhost:${actualPort}`);
    });

    this.wss.on("error", (err) => {
      console.error(`[HUD] WebSocket server error: ${err.message}`);
    });
  }

  /**
   * Wire the AgentLoop into the HUD server.
   * Enables inbound messages to trigger agent behavior.
   */
  wireAgentLoop(loop: AgentLoop): void {
    this.agentLoop = loop;

    // Wire HUD emitter into the loop (outbound: agent → HUD)
    loop.setHudEmitter(this.broadcast.bind(this));
  }

  /**
   * Broadcast a message on a specific channel to all connected clients.
   * This is the HudEmitter function signature.
   */
  broadcast<C extends HudChannel>(
    channel: C,
    payload: HudPayloads[C]
  ): void {
    const message: HudMessage<C> = {
      channel,
      payload,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  /**
   * Get the number of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Gracefully close all connections and stop the server.
   */
  shutdown(): void {
    for (const client of this.clients) {
      client.close(1001, "Server shutting down");
    }
    this.clients.clear();
    this.wss.close();
    console.log("[HUD] WebSocket server shut down");
  }

  // ─── Private: Connection Handler ─────────────────────────────────────────
  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`[HUD] Client connected (${this.clients.size} total)`);

    // Send initial state
    this.broadcast("activity_log", {
      message: "HUD client connected to M.A.I. system",
      level: "info",
    });
    this.broadcast("reactor_pulse", {
      power: 100,
      status: "online",
    });
    this.broadcast("threat_level", {
      level: "green",
    });

    ws.on("message", (data) => {
      this.handleInbound(ws, data);
    });

    ws.on("close", (code, reason) => {
      this.clients.delete(ws);
      console.log(
        `[HUD] Client disconnected (code: ${code}, clients: ${this.clients.size})`
      );
    });

    ws.on("error", (err) => {
      console.error(`[HUD] Client error: ${err.message}`);
      this.clients.delete(ws);
    });
  }

  /**
   * Handle inbound messages from HUD clients.
   */
  private handleInbound(_ws: WebSocket, data: unknown): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      console.warn("[HUD] Received non-JSON message, ignoring");
      return;
    }

    const msg = parsed as InboundMessage;

    switch (msg.type) {
      case "user_input": {
        if (!msg.text || typeof msg.text !== "string") {
          console.warn("[HUD] user_input missing text field");
          return;
        }
        console.log(`[HUD] user_input: "${msg.text.slice(0, 100)}..."`);
        this.agentLoop?.processUserMessage(msg.text);
        break;
      }

      case "approval_response": {
        const approved = msg.approved === true;
        console.log(`[HUD] approval_response: ${approved ? "APPROVED" : "DENIED"}`);
        this.agentLoop?.resolveApproval(approved);
        break;
      }

      default: {
        console.warn(`[HUD] Unknown message type: ${(msg as { type: string }).type}`);
      }
    }
  }
}
