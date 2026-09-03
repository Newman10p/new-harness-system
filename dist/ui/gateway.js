"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UIGateway = void 0;
const node_http_1 = __importDefault(require("node:http"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const autonomous_1 = require("../core/autonomous");
const MiniObsidianMemory_1 = require("../memory/MiniObsidianMemory");
const vault_1 = require("../actions/vault");
/**
 * UI Gateway - Serves the web console and provides REST API for the harness.
 */
class UIGateway {
    server = null;
    orchestrator;
    config;
    agent;
    memory;
    constructor(config, orchestrator) {
        this.config = config;
        this.orchestrator = orchestrator;
        this.agent = new autonomous_1.AutonomousAgent(orchestrator, config);
        this.memory = new MiniObsidianMemory_1.MiniObsidianMemory(config.vaultPath ?? "./vault", "AgentMemory");
        (0, vault_1.setMemoryInstance)(this.memory);
    }
    async start(options) {
        const port = options?.port ?? 3096;
        const hostname = options?.hostname ?? "0.0.0.0";
        return new Promise((resolve) => {
            this.server = node_http_1.default.createServer((req, res) => {
                this.handleRequest(req, res);
            });
            this.server.listen(port, hostname, () => {
                console.log(`[UIGateway] Console at http://${hostname}:${port}`);
                resolve();
            });
        });
    }
    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
    async handleRequest(req, res) {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const pathname = url.pathname;
        // CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        try {
            // API routes
            if (pathname === "/api/chat" && req.method === "POST") {
                await this.handleChat(req, res);
            }
            else if (pathname === "/api/providers" && req.method === "GET") {
                await this.handleGetProviders(res);
            }
            else if (pathname === "/api/provider" && req.method === "POST") {
                await this.handleSetProvider(req, res);
            }
            else if (pathname === "/api/status" && req.method === "GET") {
                await this.handleGetStatus(res);
            }
            else if (pathname === "/api/memory/search" && req.method === "POST") {
                await this.handleMemorySearch(req, res);
            }
            else if (pathname === "/api/actions" && req.method === "GET") {
                await this.handleListActions(res);
            }
            else if (pathname === "/api/action" && req.method === "POST") {
                await this.handleRunAction(req, res);
            }
            else if (pathname === "/api/workflows" && req.method === "GET") {
                await this.handleListWorkflows(res);
            }
            else if (pathname.startsWith("/api/")) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Not found" }));
            }
            else {
                // Serve static files or index.html
                await this.serveStatic(req, res, pathname);
            }
        }
        catch (error) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }));
        }
    }
    async serveStatic(req, res, pathname) {
        const publicDir = node_path_1.default.resolve(process.cwd(), "public");
        let filePath = pathname === "/" ? node_path_1.default.join(publicDir, "index.html") : node_path_1.default.join(publicDir, pathname);
        // If no file found, serve index.html (SPA fallback)
        if (!node_fs_1.default.existsSync(filePath)) {
            filePath = node_path_1.default.join(publicDir, "index.html");
        }
        const ext = node_path_1.default.extname(filePath);
        const mimeTypes = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon"
        };
        try {
            const content = node_fs_1.default.readFileSync(filePath);
            res.writeHead(200, { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" });
            res.end(content);
        }
        catch {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not found");
        }
    }
    async handleChat(req, res) {
        const body = await this.readBody(req);
        const { message } = JSON.parse(body);
        if (!message) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing message" }));
            return;
        }
        const result = await this.agent.run(message);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ response: result }));
    }
    async handleGetProviders(res) {
        const providers = this.orchestrator.providers.listProviders();
        const defaultProvider = this.orchestrator.providers.defaultProviderName;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ providers, defaultProvider }));
    }
    async handleSetProvider(req, res) {
        const body = await this.readBody(req);
        const { name } = JSON.parse(body);
        this.orchestrator.setProvider(name);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", provider: name }));
    }
    async handleGetStatus(res) {
        const security = this.orchestrator.security.getStatus();
        const actions = this.orchestrator.actions.list().length;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            provider: this.orchestrator.providers.defaultProviderName,
            actions,
            security,
            audio: this.config.audio?.mode ?? "disabled",
            vaultPath: this.config.vaultPath ?? "./vault"
        }));
    }
    async handleMemorySearch(req, res) {
        const body = await this.readBody(req);
        const { query } = JSON.parse(body);
        const results = await this.memory.search(query ?? "");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results }));
    }
    async handleListActions(res) {
        const actions = this.orchestrator.actions.list().map(({ action, meta }) => ({
            name: action.name,
            description: meta.description,
            category: meta.category,
            requiresConfirmation: meta.requiresConfirmation ?? false
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ actions }));
    }
    async handleRunAction(req, res) {
        const body = await this.readBody(req);
        const { name, input } = JSON.parse(body);
        const result = await this.orchestrator.executeAction(name, input ?? {});
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ result }));
    }
    async handleListWorkflows(res) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ workflows: [] }));
    }
    readBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => resolve(Buffer.concat(chunks).toString()));
            req.on("error", reject);
        });
    }
}
exports.UIGateway = UIGateway;
//# sourceMappingURL=gateway.js.map