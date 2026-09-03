import type { HudChannel, HudPayloads } from "../types/index.js";
import type { AgentLoop } from "../core/AgentLoop.js";
export declare class HudServer {
    private port;
    private wss;
    private clients;
    private agentLoop;
    constructor(httpServer: Server | undefined, port?: number);
    /**
     * Wire the AgentLoop into the HUD server.
     * Enables inbound messages to trigger agent behavior.
     */
    wireAgentLoop(loop: AgentLoop): void;
    /**
     * Broadcast a message on a specific channel to all connected clients.
     * This is the HudEmitter function signature.
     */
    broadcast<C extends HudChannel>(channel: C, payload: HudPayloads[C]): void;
    /**
     * Get the number of connected clients.
     */
    getClientCount(): number;
    /**
     * Gracefully close all connections and stop the server.
     */
    shutdown(): void;
    private handleConnection;
    /**
     * Handle inbound messages from HUD clients.
     */
    private handleInbound;
}
//# sourceMappingURL=HudServer.d.ts.map