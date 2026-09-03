"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HudServer = void 0;
const ws_1 = require("ws");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
class HudServer {
    port;
    wss;
    clients = new Set();
    agentLoop = null;
    constructor(httpServer, port = 8080) {
        this.port = port;
        // Always create a standalone WebSocket server on its own port.
        // Sharing the HTTP server port causes the WS to end up on HTTP_PORT
        // instead of WS_PORT, breaking the HUD frontend connection.
        this.wss = new ws_1.WebSocketServer({ port });
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
    wireAgentLoop(loop) {
        this.agentLoop = loop;
        // Wire HUD emitter into the loop (outbound: agent → HUD)
        loop.setHudEmitter(this.broadcast.bind(this));
    }
    /**
     * Broadcast a message on a specific channel to all connected clients.
     * This is the HudEmitter function signature.
     */
    broadcast(channel, payload) {
        const message = {
            channel,
            payload,
            timestamp: Date.now(),
        };
        const json = JSON.stringify(message);
        for (const client of this.clients) {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(json);
            }
        }
    }
    /**
     * Get the number of connected clients.
     */
    getClientCount() {
        return this.clients.size;
    }
    /**
     * Gracefully close all connections and stop the server.
     */
    shutdown() {
        for (const client of this.clients) {
            client.close(1001, "Server shutting down");
        }
        this.clients.clear();
        this.wss.close();
        console.log("[HUD] WebSocket server shut down");
    }
    // ─── Private: Connection Handler ─────────────────────────────────────────
    handleConnection(ws) {
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
            console.log(`[HUD] Client disconnected (code: ${code}, clients: ${this.clients.size})`);
        });
        ws.on("error", (err) => {
            console.error(`[HUD] Client error: ${err.message}`);
            this.clients.delete(ws);
        });
    }
    /**
     * Handle inbound messages from HUD clients.
     */
    handleInbound(_ws, data) {
        let parsed;
        try {
            parsed = JSON.parse(String(data));
        }
        catch {
            console.warn("[HUD] Received non-JSON message, ignoring");
            return;
        }
        const msg = parsed;
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
                node_fs_1.default.promises.readdir(dir, { withFileTypes: true })
                    .then(async (entries) => {
                    const files = [];
                    for (const entry of entries) {
                        if (entry.name.startsWith('.') && !showHidden)
                            continue;
                        try {
                            const stat = await node_fs_1.default.promises.stat(node_path_1.default.join(dir, entry.name));
                            files.push({
                                name: entry.name,
                                path: node_path_1.default.join(dir, entry.name),
                                size: stat.size,
                                modified: stat.mtime.toISOString(),
                                type: entry.isDirectory() ? "dir" : "file",
                                extension: node_path_1.default.extname(entry.name).slice(1).toLowerCase(),
                            });
                        }
                        catch { /* skip */ }
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
                const dc = msg;
                const paramsStr = dc.params ? ` ${JSON.stringify(dc.params)}` : "";
                this.agentLoop?.processUserMessage(`Device control: ${dc.operation}${paramsStr}`);
                break;
            }
            case "notification_action": {
                const na = msg;
                console.log(`[HUD] notification_action: ${na.action} ${na.notificationId}`);
                // Delegate to notification aggregator if available
                break;
            }
            case "macro_trigger": {
                const mt = msg;
                console.log(`[HUD] macro_trigger: ${mt.name}`);
                this.agentLoop?.processUserMessage(`Run the macro named ${mt.name}`);
                break;
            }
            case "conversation_search": {
                const cs = msg;
                console.log(`[HUD] conversation_search: ${cs.query}`);
                this.agentLoop?.processUserMessage(`Search my conversation history for: ${cs.query}`);
                break;
            }
            default: {
                console.warn(`[HUD] Unknown message type: ${msg.type}`);
            }
        }
    }
}
exports.HudServer = HudServer;
//# sourceMappingURL=HudServer.js.map