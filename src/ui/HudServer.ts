// ─── M.A.I. HUD Server ────────────────────────────────────────────────────
// WebSocket server for the Iron Man-style HUD frontend.
//
// Architecture:
//   - WS server on port 8080 (configurable via WS_PORT env var)
//   - 5 outbound channels (agent → HUD):
//       jarvis_speech, activity_log, system_metrics, threat_level, reactor_pulse
//   - 5 inbound message types (HUD → agent):
//       user_input      → AgentLoop.processUserMessage()
//       approval_response → AgentLoop.resolveApproval()
//       file_request    → broadcast file_list channel
//       voice_call      → broadcast voice_call_state channel
//       file_read       → send user_input to agent loop
//
// All connected clients receive all broadcast messages (no filtering).
// Messages are JSON: { channel, payload, timestamp }.

import { WebSocketServer, WebSocket } from "ws";
import fs from "node:fs";
import path from "node:path";
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

interface InboundFileRequest {
  type: "file_request";
  path?: string;
  show_hidden?: boolean;
}

interface InboundVoiceCall {
  type: "voice_call";
  operation: "start" | "stop";
}

interface InboundFileRead {
  type: "file_read";
  path: string;
}

interface InboundDeviceControl {
  type: "device_control";
  operation: string;
 params?: Record<string, unknown>;
}

interface InboundNotificationAction {
  type: "notification_action";
  notificationId: string;
  action: "read" | "dismiss" | "archive";
}

interface InboundMacroTrigger {
  type: "macro_trigger";
  name: string;
  variables?: Record<string, string>;
}

interface InboundConversationSearch {
  type: "conversation_search";
  query: string;
  limit?: number;
}

type InboundMessage = InboundUserInput | InboundApprovalResponse | InboundFileRequest | InboundVoiceCall | InboundFileRead | InboundDeviceControl | InboundNotificationAction | InboundMacroTrigger | InboundConversationSearch;

export class HudServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private agentLoop: AgentLoop | null = null;

  constructor(
    httpServer: Server | undefined,
    private port: number = 8080
  ) {
    // Always create a standalone WebSocket server on its own port.
    // Sharing the HTTP server port causes the WS to end up on HTTP_PORT
    // instead of WS_PORT, breaking the HUD frontend connection.
    this.wss = new WebSocketServer({ port });

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

      case "file_request": {
        const dir = msg.path || process.cwd();
        const showHidden = msg.show_hidden === true;
        fs.promises.readdir(dir, { withFileTypes: true })
          .then(async (entries) => {
            const files = [];
            for (const entry of entries) {
              if (entry.name.startsWith('.') && !showHidden) continue;
              try {
                const stat = await fs.promises.stat(path.join(dir, entry.name));
                files.push({
                  name: entry.name,
                  path: path.join(dir, entry.name),
                  size: stat.size,
                  modified: stat.mtime.toISOString(),
                  type: entry.isDirectory() ? "dir" : "file",
                  extension: path.extname(entry.name).slice(1).toLowerCase(),
                });
              } catch { /* skip */ }
            }
            this.broadcast("file_list", { files });
          })
          .catch(() => {
            this.broadcast("file_list", { files: [] });
          });
        break;
      }

      case "voice_call": {
        this.broadcast("voice_call_state", { active: msg.operation === "start", transcript: "" });
        break;
      }

      case "file_read": {
        this.agentLoop?.processUserMessage(`Read the file at ${msg.path}`);
        break;
      }

      case "device_control": {
        const dc = msg as InboundDeviceControl;
        const paramsStr = dc.params ? ` ${JSON.stringify(dc.params)}` : "";
        this.agentLoop?.processUserMessage(`Device control: ${dc.operation}${paramsStr}`);
        break;
      }

      case "notification_action": {
        const na = msg as InboundNotificationAction;
        console.log(`[HUD] notification_action: ${na.action} ${na.notificationId}`);
        // Delegate to notification aggregator if available
        break;
      }

      case "macro_trigger": {
        const mt = msg as InboundMacroTrigger;
        console.log(`[HUD] macro_trigger: ${mt.name}`);
        this.agentLoop?.processUserMessage(`Run the macro named ${mt.name}`);
        break;
      }

      case "conversation_search": {
        const cs = msg as InboundConversationSearch;
        console.log(`[HUD] conversation_search: ${cs.query}`);
        this.agentLoop?.processUserMessage(`Search my conversation history for: ${cs.query}`);
        break;
      }

      default: {
        console.warn(`[HUD] Unknown message type: ${(msg as { type: string }).type}`);
      }
    }
  }
}
