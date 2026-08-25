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

interface InboundListFiles {
  type: "list_files";
  path?: string;
  show_hidden?: boolean;
}

interface InboundVoiceCall {
  type: "voice_call";
  operation?: "start" | "stop";
  active?: boolean; // Legacy: frontend used this before protocol fix
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

interface InboundVoiceSwitch {
  type: "voice_switch";
  personality: "friday" | "jarvis";
}

interface InboundTtsSwitch {
  type: "tts_switch";
  engine: "browser" | "piper" | "kokoro";
}

interface InboundPiperSpeak {
  type: "piper_speak";
  text: string;
}

type InboundMessage = InboundUserInput | InboundApprovalResponse | InboundFileRequest | InboundListFiles | InboundVoiceCall | InboundFileRead | InboundDeviceControl | InboundNotificationAction | InboundMacroTrigger | InboundConversationSearch | InboundVoiceSwitch | InboundTtsSwitch | InboundPiperSpeak;

export class HudServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private agentLoop: AgentLoop | null = null;
  private piperAdapter: import("../audio/PiperTtsAdapter.js").PiperTtsAdapter | null = null;
  private kokoroAdapter: import("../audio/KokoroTtsAdapter.js").KokoroTtsAdapter | null = null;
  private piperReady = false;
  private kokoroReady = false;
  private activeTtsEngine: "piper" | "kokoro" | "browser" = "browser";

  constructor(
    httpServer: unknown,
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
   * Initialize neural TTS adapters if available.
   * Tries Kokoro first (higher quality), falls back to Piper.
   */
  initPiper(config?: { model?: string; bin?: string; config?: string; dataDir?: string }): void {
    // Initialize Piper TTS adapter
    try {
      const { PiperTtsAdapter } = require("../audio/PiperTtsAdapter.js");
      this.piperAdapter = new PiperTtsAdapter({
        model: config?.model || process.env.PIPER_MODEL || "",
        bin: config?.bin || process.env.PIPER_BIN,
        config: config?.config || process.env.PIPER_CONFIG,
        dataDir: config?.dataDir || process.env.PIPER_DATA,
      });
      this.piperReady = this.piperAdapter!.isReady();
      if (this.piperReady) {
        console.log("[HUD] Piper TTS initialized");
      } else {
        console.warn("[HUD] Piper TTS configured but not ready");
      }
    } catch (err) {
      console.warn(`[HUD] Piper TTS not available: ${err instanceof Error ? err.message : err}`);
      this.piperReady = false;
    }

    // Initialize Kokoro TTS adapter (higher quality, preferred)
    try {
      const { KokoroTtsAdapter } = require("../audio/KokoroTtsAdapter.js");
      this.kokoroAdapter = new KokoroTtsAdapter({
        model: process.env.KOKORO_MODEL || "",
        bin: process.env.KOKORO_BIN || "kokoro",
        config: process.env.KOKORO_CONFIG,
        voice: process.env.KOKORO_VOICE,
      });
      this.kokoroReady = this.kokoroAdapter!.isReady();
      if (this.kokoroReady) {
        this.activeTtsEngine = "kokoro";
        console.log("[HUD] Kokoro TTS initialized (preferred engine)");
      }
    } catch (err) {
      console.warn(`[HUD] Kokoro TTS not available: ${err instanceof Error ? err.message : err}`);
      this.kokoroReady = false;
    }

    // Set active engine: Kokoro > Piper > Browser
    if (this.kokoroReady) {
      this.activeTtsEngine = "kokoro";
    } else if (this.piperReady) {
      this.activeTtsEngine = "piper";
    }

    // Broadcast TTS engine status to all clients
    this.broadcast("tts_engine_status", {
      engine: this.activeTtsEngine,
      ready: this.kokoroReady || this.piperReady,
      piperReady: this.piperReady,
      kokoroReady: this.kokoroReady,
      info: this.kokoroReady
        ? this.kokoroAdapter!.getInfo()
        : this.piperReady
          ? this.piperAdapter!.getInfo()
          : undefined,
    } as any);
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

    // Resend TTS engine status so newly connected clients see the switcher
    if (this.piperReady || this.kokoroReady) {
      this.broadcast("tts_engine_status", {
        engine: this.activeTtsEngine,
        ready: true,
        piperReady: this.piperReady,
        kokoroReady: this.kokoroReady,
        info: this.kokoroReady
          ? this.kokoroAdapter!.getInfo()
          : this.piperReady
            ? this.piperAdapter!.getInfo()
            : undefined,
      } as any);
    }
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

      case "file_request":
      case "list_files": {  // Alias — both types handled identically
        const dir = path.resolve(msg.path || process.cwd()); // Resolve to absolute path
        const showHidden = msg.show_hidden === true;
        fs.promises.readdir(dir, { withFileTypes: true })
          .then(async (entries) => {
            const files = [];
            for (const entry of entries) {
              if (entry.name.startsWith('.') && !showHidden) continue;
              try {
                const fullPath = path.join(dir, entry.name);
                const stat = await fs.promises.stat(fullPath);
                files.push({
                  name: entry.name,
                  path: fullPath, // Always absolute for correct navigation
                  size: stat.size,
                  modified: stat.mtime.toISOString(),
                  type: entry.isDirectory() ? "dir" : "file",
                  extension: path.extname(entry.name).slice(1).toLowerCase(),
                });
              } catch { /* skip */ }
            }
            this.broadcast("file_list", { files: files as any, basePath: dir } as any);
          })
          .catch(() => {
            this.broadcast("file_list", { files: [], basePath: dir } as any);
          });
        break;
      }

      case "voice_call": {
        // Support both `operation` (canonical) and `active` (legacy) fields
        const isStart = msg.operation === "start" || msg.active === true;
        this.broadcast("voice_call_state", { active: isStart, transcript: "" });
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

      case "voice_switch": {
        const vs = msg as InboundVoiceSwitch;
        console.log(`[HUD] voice_switch: ${vs.personality}`);
        // Broadcast to all connected clients so they sync
        this.broadcast("voice_switch", { personality: vs.personality });
        break;
      }

      case "tts_switch": {
        const ts = msg as InboundTtsSwitch;
        console.log(`[HUD] tts_switch: ${ts.engine}`);
        // Validate the requested engine is available
        const engine = ts.engine as "browser" | "piper" | "kokoro";
        if (engine === "kokoro" && this.kokoroReady) {
          this.activeTtsEngine = "kokoro";
        } else if (engine === "piper" && this.piperReady) {
          this.activeTtsEngine = "piper";
        } else {
          this.activeTtsEngine = "browser";
        }
        // Broadcast engine switch to all clients
        this.broadcast("tts_engine_switch", {
          engine: this.activeTtsEngine,
          piperReady: this.piperReady,
          kokoroReady: this.kokoroReady,
        } as any);
        break;
      }

      case "piper_speak": {
        const ps = msg as InboundPiperSpeak;
        if (!ps.text) break;
        // Use active neural TTS engine (Kokoro preferred over Piper)
        this.synthesizeAndBroadcastNeural(ps.text);
        break;
      }

      default: {
        const unknownType = (msg as { type: string }).type;
        console.warn(`[HUD] Unknown message type: ${unknownType}`);
        // Send error feedback to the client so they know the message was ignored
        try {
          _ws.send(JSON.stringify({ channel: "activity_log", payload: { message: `Unknown message type: ${unknownType}`, level: "warn" }, timestamp: Date.now() }));
        } catch { /* send failed, ignore */ }
      }
    }
  }

  /**
   * Synthesize text with the active neural TTS engine (Kokoro preferred, Piper fallback)
   * and broadcast audio to all connected clients via piper_audio channel.
   */
  private async synthesizeAndBroadcastNeural(text: string): Promise<void> {
    // Try Kokoro first (higher quality)
    if (this.kokoroAdapter && this.kokoroReady) {
      try {
        const base64Audio = await this.kokoroAdapter.synthesizeToBase64(text);
        this.broadcast("piper_audio", {
          audio: base64Audio,
          format: "wav",
          text: text.slice(0, 100),
          engine: "kokoro",
        } as any);
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[HUD] Kokoro synthesis failed, falling back: ${errMsg}`);
        this.broadcast("activity_log", {
          message: `Kokoro TTS failed: ${errMsg}`,
          level: "warn",
        });
      }
    }

    // Fallback to Piper
    if (this.piperAdapter && this.piperReady) {
      try {
        const base64Audio = await this.piperAdapter.synthesizeToBase64(text);
        this.broadcast("piper_audio", {
          audio: base64Audio,
          format: "wav",
          text: text.slice(0, 100),
          engine: "piper",
        } as any);
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[HUD] Piper synthesis failed: ${errMsg}`);
        this.broadcast("activity_log", {
          message: `Piper TTS failed: ${errMsg}`,
          level: "warn",
        });
      }
    }

    // Neither engine available — notify clients to use browser TTS
    this.broadcast("tts_engine_status", {
      engine: "browser",
      ready: false,
      error: "No neural TTS engine available",
    } as any);
  }
}
