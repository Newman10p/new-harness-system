import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { HarnessConfig, loadConfig } from "../config";
import { Orchestrator } from "../core/orchestrator";
import { AutonomousAgent } from "../core/autonomous";
import { MiniObsidianMemory } from "../memory/MiniObsidianMemory";
import { setMemoryInstance } from "../actions/vault";

export interface GatewayOptions {
  port: number;
  hostname: string;
}

/**
 * UI Gateway - Serves the web console and provides REST API for the harness.
 */
export class UIGateway {
  private server: http.Server | null = null;
  private orchestrator: Orchestrator;
  private config: HarnessConfig;
  private agent: AutonomousAgent;
  private memory: MiniObsidianMemory;

  constructor(config: HarnessConfig, orchestrator: Orchestrator) {
    this.config = config;
    this.orchestrator = orchestrator;
    this.agent = new AutonomousAgent(orchestrator, config);
    this.memory = new MiniObsidianMemory(config.vaultPath ?? "./vault", "AgentMemory");
    setMemoryInstance(this.memory);
  }

  async start(options?: Partial<GatewayOptions>): Promise<void> {
    const port = options?.port ?? 3096;
    const hostname = options?.hostname ?? "0.0.0.0";

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(port, hostname, () => {
        console.log(`[UIGateway] Console at http://${hostname}:${port}`);
        resolve();
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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
      } else if (pathname === "/api/providers" && req.method === "GET") {
        await this.handleGetProviders(res);
      } else if (pathname === "/api/provider" && req.method === "POST") {
        await this.handleSetProvider(req, res);
      } else if (pathname === "/api/status" && req.method === "GET") {
        await this.handleGetStatus(res);
      } else if (pathname === "/api/memory/search" && req.method === "POST") {
        await this.handleMemorySearch(req, res);
      } else if (pathname === "/api/actions" && req.method === "GET") {
        await this.handleListActions(res);
      } else if (pathname === "/api/action" && req.method === "POST") {
        await this.handleRunAction(req, res);
      } else if (pathname === "/api/workflows" && req.method === "GET") {
        await this.handleListWorkflows(res);
      } else if (pathname === "/api/audio/status" && req.method === "GET") {
        await this.handleGetAudioStatus(res);
      } else if (pathname === "/api/config" && req.method === "GET") {
        await this.handleGetConfig(res);
      } else if (pathname === "/api/config" && req.method === "POST") {
        await this.handleUpdateConfig(req, res);
      } else if (pathname === "/api/onboarding/status" && req.method === "GET") {
        await this.handleOnboardingStatus(res);
      } else if (pathname.startsWith("/api/")) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      } else {
        // Serve static files or index.html
        await this.serveStatic(req, res, pathname);
      }
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }));
    }
  }

  private async serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
    const publicDir = path.resolve(process.cwd(), "public");
    let filePath = pathname === "/" ? path.join(publicDir, "index.html") : path.join(publicDir, pathname);

    // If no file found, serve index.html (SPA fallback)
    if (!fs.existsSync(filePath)) {
      filePath = path.join(publicDir, "index.html");
    }

    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon"
    };

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" });
      res.end(content);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  }

  private async handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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

  private async handleGetProviders(res: http.ServerResponse): Promise<void> {
    const providers = this.orchestrator.providers.listProviders();
    const defaultProvider = this.orchestrator.providers.defaultProviderName;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ providers, defaultProvider }));
  }

  private async handleSetProvider(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { name } = JSON.parse(body);
    this.orchestrator.setProvider(name);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", provider: name }));
  }

  private async handleGetStatus(res: http.ServerResponse): Promise<void> {
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

  private async handleMemorySearch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { query } = JSON.parse(body);
    const results = await this.memory.search(query ?? "");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ results }));
  }

  private async handleListActions(res: http.ServerResponse): Promise<void> {
    const actions = this.orchestrator.actions.list().map(({ action, meta }) => ({
      name: action.name,
      description: meta.description,
      category: meta.category,
      requiresConfirmation: meta.requiresConfirmation ?? false
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ actions }));
  }

  private async handleRunAction(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { name, input } = JSON.parse(body);
    const result = await this.orchestrator.executeAction(name, input ?? {});
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ result }));
  }

  private async handleListWorkflows(res: http.ServerResponse): Promise<void> {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ workflows: [] }));
  }

  private async handleGetAudioStatus(res: http.ServerResponse): Promise<void> {
    const audio = this.config.audio;
    const status: Record<string, unknown> = {
      mode: audio?.mode ?? "disabled",
      stt: {
        enabled: audio?.stt?.enabled ?? false,
        backend: audio?.stt?.backend ?? null,
      },
      tts: {
        enabled: audio?.tts?.enabled ?? false,
        backend: audio?.tts?.backend ?? null,
        endpoint: audio?.tts?.endpoint ?? null,
        voice: audio?.tts?.voice ?? null,
      },
      wakeWord: {
        enabled: audio?.wakeWord?.enabled ?? false,
        keyword: audio?.wakeWord?.keyword ?? null,
      },
    };
    // Check for neural TTS readiness via env
    const kokoroModel = process.env.KOKORO_MODEL;
    const piperModel = process.env.PIPER_MODEL;
    status.tts_kokoro_available = !!kokoroModel;
    status.tts_piper_available = !!piperModel;
    status.tts_kokoro_model = kokoroModel ? kokoroModel.split("/").pop() : null;
    status.tts_piper_model = piperModel ? piperModel.split("/").pop() : null;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
  }

  private async handleGetConfig(res: http.ServerResponse): Promise<void> {
    // Return a sanitized version of the config (no API keys, passwords)
    const safe: Record<string, unknown> = {
      assistantName: this.config.assistantName,
      model: this.config.model,
      modelProvider: this.config.modelProvider,
      audio: {
        mode: this.config.audio?.mode,
        stt: {
          enabled: this.config.audio?.stt?.enabled,
          backend: this.config.audio?.stt?.backend,
          language: this.config.audio?.stt?.language,
        },
        tts: {
          enabled: this.config.audio?.tts?.enabled,
          backend: this.config.audio?.tts?.backend,
          voice: this.config.audio?.tts?.voice,
          speed: this.config.audio?.tts?.speed,
        },
        wakeWord: {
          enabled: this.config.audio?.wakeWord?.enabled,
          keyword: this.config.audio?.wakeWord?.keyword,
        },
      },
      permissions: this.config.permissions,
      sandbox: {
        enabled: this.config.sandbox?.enabled,
        defaultTier: this.config.sandbox?.defaultTier,
      },
      browserControl: {
        enabled: this.config.browserControl?.enabled,
        autoDiscover: this.config.browserControl?.autoDiscover,
        autoLaunchChrome: this.config.browserControl?.autoLaunchChrome,
        autoLaunchBrave: this.config.browserControl?.autoLaunchBrave,
      },
      email: {
        enabled: this.config.email?.enabled,
        accountCount: this.config.email?.accounts?.length ?? 0,
      },
      deviceControl: {
        enabled: this.config.deviceControl?.enabled,
        autoDiscover: this.config.deviceControl?.autoDiscover,
      },
      gateway: {
        enabled: this.config.gateway?.enabled,
        port: this.config.gateway?.port,
      },
      vaultPath: this.config.vaultPath,
      skillsPath: this.config.skillsPath,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(safe));
  }

  private async handleUpdateConfig(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const updates = JSON.parse(body);

    // Only allow updating specific safe fields
    const allowedSections = ["audio", "permissions", "sandbox", "browserControl", "email", "deviceControl", "gateway", "assistantName"];
    const configPath = path.resolve(process.cwd(), "harness.config.json");

    try {
      let current: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        current = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      }

      // Deep merge allowed sections only
      for (const key of Object.keys(updates)) {
        if (!allowedSections.includes(key)) continue;
        if (typeof updates[key] === "object" && updates[key] !== null && !Array.isArray(updates[key])) {
          current[key] = { ...(current[key] as Record<string, unknown> ?? {}), ...updates[key] };
        } else {
          current[key] = updates[key];
        }
      }

      fs.writeFileSync(configPath, JSON.stringify(current, null, 2) + "\n");

      // Also update the in-memory config
      for (const key of Object.keys(updates)) {
        if (!allowedSections.includes(key)) continue;
        (this.config as unknown as Record<string, unknown>)[key] = updates[key];
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", message: "Config updated. Restart required for some changes." }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Failed to save config" }));
    }
  }

  private async handleOnboardingStatus(res: http.ServerResponse): Promise<void> {
    const config = this.config;
    const steps = [
      { key: "name", done: !!config.assistantName && config.assistantName !== "Jarvis" },
      { key: "model", done: !!(config.modelProvider || config.modelSection) },
      { key: "audio_stt", done: !!config.audio?.stt?.enabled },
      { key: "audio_tts", done: !!config.audio?.tts?.enabled },
      { key: "gateway", done: config.gateway?.enabled !== false },
      { key: "browser", done: config.browserControl?.enabled !== false },
      { key: "email", done: (config.email?.accounts?.length ?? 0) > 0 },
    ];
    const completed = steps.filter(s => s.done).length;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      completed,
      total: steps.length,
      steps,
      isFirstRun: completed <= 2,
    }));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }
}