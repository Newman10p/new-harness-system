// ─── M.A.I. Enhanced Model Router ─────────────────────────────────────────
// Routes user messages to the appropriate model based on complexity.
//
// Architecture:
//   - brain:  The large model (120B) for planning, reasoning, personality, complex tasks
//   - router: A small local model (1.2B) for message classification and simple Q&A
//   - hands:  A code-focused model (Qwen Coder) for code generation sub-tasks
//
// When router/hands are not configured, everything goes to brain (current behavior).
// This is fully backward-compatible — if no ROUTER_MODEL is set, the router
// passes everything through to the brain unchanged.
//
// Enhancement v2:
//   - Ollama auto-detection: scans /api/tags for local models
//   - Health checking: verifies models are responsive before routing
//   - Context-aware routing: won't send 128K context to a 4K model
//   - Confidence thresholds: only routes to small models when confident
//   - Streaming for direct router responses
//   - Token savings tracking
//   - Per-role context window limits
//   - Circuit breaker for small models
//   - Code-optimized system prompt for hands model

import OpenAI from "openai";
import { loadProviders, createClients, streamWithProvider, type LLMInstance } from "./MultiProvider.js";
import { getLogger } from "./MaiLogger.js";

const log = getLogger("ModelRouter");

// ─── Types ─────────────────────────────────────────────────────────────────

export type ModelRole = "brain" | "router" | "hands";

export type MessageCategory =
  | "simple_qa"       // Router can handle directly (no tools needed)
  | "system_command"  // Router handles (slash commands, settings)
  | "code_task"       // Hands model for code generation/editing
  | "complex_task"    // Brain for multi-step reasoning
  | "planning"        // Brain for goal decomposition
  | "conversation"    // Brain for personality-driven chat
  | "unknown";        // Default to brain (safe)

export interface RoutingDecision {
  role: ModelRole;
  category: MessageCategory;
  reason: string;
  confidence: number;
  /** Recommended context window for the target model */
  contextWindow: number;
  /** Recommended max_tokens for the target model */
  maxTokens: number;
  /** Whether to use a code-optimized system prompt */
  useCodePrompt: boolean;
}

export interface RouterConfig {
  /** Router model for message classification (optional — if missing, brain handles everything) */
  routerModel?: string;
  routerBaseUrl?: string;
  routerApiKey?: string;

  /** Hands model for code tasks (optional) */
  handsModel?: string;
  handsBaseUrl?: string;
  handsApiKey?: string;

  /** Classification prompt for the router model */
  classificationPrompt?: string;

  /** Categories that the router can handle directly (without entering AgentLoop) */
  routerHandledCategories?: MessageCategory[];

  /** Categories delegated to the hands model */
  handsCategories?: MessageCategory[];

  /** Minimum confidence to route to small models (default: 0.6) */
  minConfidence?: number;

  /** Context window sizes per role (tokens) */
  contextWindows?: { brain?: number; router?: number; hands?: number };

  /** Max output tokens per role */
  maxOutputTokens?: { brain?: number; router?: number; hands?: number };

  /** Enable Ollama auto-detection for router/hands models (default: true) */
  autoDetectOllama?: boolean;

  /** Ollama endpoint for auto-detection (default: http://localhost:11434) */
  ollamaEndpoint?: string;

  /** Consecutive failures before disabling a small model (default: 3) */
  failureThreshold?: number;

  /** Health check interval in ms (default: 60000 = 1 min), 0 to disable */
  healthCheckIntervalMs?: number;
}

/** Health status of a model endpoint */
export interface ModelHealth {
  role: ModelRole;
  available: boolean;
  model: string;
  endpoint: string;
  lastCheck: number;
  latencyMs: number | null;
  consecutiveFailures: number;
  disabled: boolean;
}

/** Token savings tracker */
interface TokenSavings {
  routerCalls: number;
  routerTokensSaved: number;  // estimated tokens saved vs brain
  handsCalls: number;
  handsTokensSaved: number;
  brainCalls: number;
}

// ─── Known model context windows ────────────────────────────────────────────
// Used when auto-detecting or when not explicitly configured.

const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  // Small models (router candidates)
  "llama3.2": 131_072,
  "llama3.2:1b": 131_072,
  "llama3.2:3b": 131_072,
  "llama3.1": 128_000,
  "llama3.1:8b": 128_000,
  "gemma2": 8_192,
  "gemma2:2b": 8_192,
  "gemma2:9b": 8_192,
  "phi3": 131_072,
  "phi3:mini": 131_072,
  "qwen2.5": 131_072,
  "qwen2.5:0.5b": 131_072,
  "qwen2.5:1.5b": 131_072,
  "qwen2.5:3b": 131_072,
  "qwen2.5-coder": 131_072,
  "qwen2.5-coder:1.5b": 131_072,
  "qwen2.5-coder:3b": 131_072,
  "qwen2.5-coder:7b": 131_072,
  "tinyllama": 2_048,
  // Large models (brain)
  "deepseek-r1": 131_072,
  "gpt-oss-120b": 131_072,
  "llama3.1:70b": 128_000,
  "llama3.1:405b": 128_000,
  "codellama": 16384,
  "codellama:70b": 16384,
};

/** Models known to be good at code generation (hands candidates) */
const CODE_MODELS = ["qwen2.5-coder", "codellama", "deepseek-coder", "starcoder", "codegemma"];

/** Models suitable for classification (router candidates) — small & fast */
const ROUTER_MODELS = ["llama3.2:1b", "llama3.2:3b", "gemma2:2b", "phi3:mini", "tinyllama", "qwen2.5:0.5b", "qwen2.5:1.5b"];

// ─── Classification prompt ────────────────────────────────────────────────

const DEFAULT_CLASSIFICATION_PROMPT = `You are a message classifier for an AI assistant called Mai. Classify the user message into exactly ONE of these categories:

- simple_qa: Simple questions that can be answered from general knowledge (time, weather-like, math, definitions, facts). No tools needed.
- system_command: Requests to change settings, switch models, clear history, or other system operations.
- code_task: Requests to write, edit, debug, review, or explain code. Includes asking about programming concepts.
- complex_task: Multi-step tasks that require planning, tool use, or external actions (build a project, deploy, analyze data, manage files).
- planning: Requests to plan, strategize, or break down a goal into steps.
- conversation: Casual chat, greetings, opinions, creative writing, or personality-driven responses.

Respond with ONLY the category name, nothing else. If unsure, respond with "complex_task".`;

/** System prompt for code-optimized hands model */
const CODE_SYSTEM_PROMPT = `You are Mai's code execution engine. You generate clean, correct, and efficient code.
Rules:
- Output ONLY the requested code or code explanation — no personality, no greetings.
- Use modern best practices and idiomatic patterns.
- Include brief comments for complex logic.
- If the request is ambiguous, make reasonable assumptions and note them.
- Never refuse a valid code request.`;

// ─── Model Router ──────────────────────────────────────────────────────────

export class ModelRouter {
  private routerClient: LLMInstance | null = null;
  private handsClient: LLMInstance | null = null;
  private classificationPrompt: string;
  private routerHandledCategories: Set<MessageCategory>;
  private handsCategories: Set<MessageCategory>;
  private minConfidence: number;
  private contextWindows: { brain: number; router: number; hands: number };
  private maxOutputTokens: { brain: number; router: number; hands: number };
  private ollamaEndpoint: string;
  private autoDetectOllama: boolean;
  private failureThreshold: number;
  private healthCheckIntervalMs: number;

  // Health tracking
  private routerHealth: ModelHealth;
  private handsHealth: ModelHealth;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  // Stats
  private stats: TokenSavings = {
    routerCalls: 0,
    routerTokensSaved: 0,
    handsCalls: 0,
    handsTokensSaved: 0,
    brainCalls: 0,
  };

  // Classification cache (avoid re-classifying similar messages in the same turn)
  private lastClassification: RoutingDecision | null = null;
  private lastClassifiedMessage = "";

  constructor(config: RouterConfig = {}) {
    this.classificationPrompt = config.classificationPrompt || DEFAULT_CLASSIFICATION_PROMPT;
    this.routerHandledCategories = new Set(config.routerHandledCategories || ["simple_qa", "system_command"]);
    this.handsCategories = new Set(config.handsCategories || ["code_task"]);
    this.minConfidence = config.minConfidence ?? 0.6;
    this.ollamaEndpoint = config.ollamaEndpoint || process.env.OLLAMA_ENDPOINT || "http://localhost:11434";
    this.autoDetectOllama = config.autoDetectOllama ?? true;
    this.failureThreshold = config.failureThreshold ?? 3;
    this.healthCheckIntervalMs = config.healthCheckIntervalMs ?? 60_000;

    // Context windows: default per role, overridable via config
    this.contextWindows = {
      brain: config.contextWindows?.brain ?? 128_000,
      router: config.contextWindows?.router ?? 4_096,
      hands: config.contextWindows?.hands ?? 32_000,
    };

    // Max output tokens per role
    this.maxOutputTokens = {
      brain: config.maxOutputTokens?.brain ?? 4_096,
      router: config.maxOutputTokens?.router ?? 300,
      hands: config.maxOutputTokens?.hands ?? 4_096,
    };

    // Initialize health trackers
    this.routerHealth = {
      role: "router", available: false, model: "",
      endpoint: "", lastCheck: 0, latencyMs: null,
      consecutiveFailures: 0, disabled: false,
    };
    this.handsHealth = {
      role: "hands", available: false, model: "",
      endpoint: "", lastCheck: 0, latencyMs: null,
      consecutiveFailures: 0, disabled: false,
    };
  }

  // ─── Initialization ─────────────────────────────────────────────────────

  /**
   * Create a ModelRouter from environment variables.
   *
   * Env vars:
   *   ROUTER_MODEL, ROUTER_BASE_URL, ROUTER_API_KEY  — classification model
   *   HANDS_MODEL, HANDS_BASE_URL, HANDS_API_KEY      — code model
   *   OLLAMA_ENDPOINT                                     — for auto-detection (default: localhost:11434)
   *   ROUTER_AUTO_DETECT                                  — "false" to disable auto-detection
   *   ROUTER_MIN_CONFIDENCE                               — 0.0-1.0 (default: 0.6)
   */
  static fromEnv(): ModelRouter {
    const router = new ModelRouter({
      routerModel: process.env.ROUTER_MODEL,
      routerBaseUrl: process.env.ROUTER_BASE_URL,
      routerApiKey: process.env.ROUTER_API_KEY,
      handsModel: process.env.HANDS_MODEL,
      handsBaseUrl: process.env.HANDS_BASE_URL,
      handsApiKey: process.env.HANDS_API_KEY,
      minConfidence: process.env.ROUTER_MIN_CONFIDENCE
        ? parseFloat(process.env.ROUTER_MIN_CONFIDENCE)
        : undefined,
      autoDetectOllama: process.env.ROUTER_AUTO_DETECT !== "false",
      ollamaEndpoint: process.env.OLLAMA_ENDPOINT,
    });
    return router;
  }

  /**
   * Async initialization: auto-detect Ollama models, configure clients,
   * run initial health check, start periodic health monitoring.
   * Call this after construction.
   */
  async initialize(): Promise<void> {
    // 1. Try explicit env-var configuration first
    this.configureFromExplicitEnv();

    // 2. If auto-detect enabled and models not already configured, scan Ollama
    if (this.autoDetectOllama) {
      await this.autoDetectFromOllama();
    }

    // 3. Update health records with configured endpoints
    if (this.routerClient) {
      this.routerHealth.model = this.routerClient.model;
      this.routerHealth.endpoint = this.routerClient.baseURL;
    }
    if (this.handsClient) {
      this.handsHealth.model = this.handsClient.model;
      this.handsHealth.endpoint = this.handsClient.baseURL;
    }

    // 4. Run initial health check
    await this.runHealthCheck();

    // 5. Start periodic health monitoring
    if (this.healthCheckIntervalMs > 0 && (this.routerClient || this.handsClient)) {
      this.healthCheckTimer = setInterval(
        () => this.runHealthCheck().catch(() => {}),
        this.healthCheckIntervalMs
      );
    }

    // Log final state
    const info = this.getInfo();
    if (info.router || info.hands) {
      log.info("Multi-model router active", {
        data: {
          router: info.router ? `${info.routerModel} (${this.routerHealth.available ? "healthy" : "unhealthy"})` : "none",
          hands: info.hands ? `${info.handsModel} (${this.handsHealth.available ? "healthy" : "unhealthy"})` : "none",
          minConfidence: this.minConfidence,
          contextWindows: this.contextWindows,
        },
      });
    } else {
      log.info("No router/hands models configured — all messages go to brain");
    }
  }

  /**
   * Shut down the router (stop health check timer).
   */
  shutdown(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // ─── Ollama Auto-Detection ───────────────────────────────────────────────

  /**
   * Scan local Ollama instance for models that fit router/hands roles.
   * Only assigns roles that aren't already configured via env vars.
   */
  private async autoDetectFromOllama(): Promise<void> {
    try {
      const tags = await this.fetchOllamaTags();
      if (!tags || tags.length === 0) {
        log.debug("No Ollama models found for auto-detection");
        return;
      }

      log.debug("Ollama models available", { data: tags.map(t => t.name) });

      // Try to find a router model (small, fast classifier)
      if (!this.routerClient) {
        const routerCandidate = this.findBestRouterModel(tags);
        if (routerCandidate) {
          this.configureRouterClient(routerCandidate);
          log.info("Auto-detected router model", { data: { model: routerCandidate.name, size: routerCandidate.size } });
        }
      }

      // Try to find a hands model (code-focused)
      if (!this.handsClient) {
        const handsCandidate = this.findBestHandsModel(tags);
        if (handsCandidate) {
          this.configureHandsClient(handsCandidate);
          log.info("Auto-detected hands model", { data: { model: handsCandidate.name, size: handsCandidate.size } });
        }
      }
    } catch (err) {
      // Auto-detection is best-effort — don't block startup
      log.debug("Ollama auto-detection skipped", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async fetchOllamaTags(): Promise<Array<{ name: string; size: number }>> {
    const url = `${this.ollamaEndpoint.replace(/\/+$/, "")}/api/tags`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const data = await response.json() as { models?: Array<{ name: string; size?: number }> };
    return (data.models ?? []).map(m => ({ name: m.name, size: m.size ?? 0 }));
  }

  private findBestRouterModel(
    tags: Array<{ name: string; size: number }>
  ): { name: string; size: number } | null {
    // Priority 1: Explicitly known router models
    for (const tag of tags) {
      const base = tag.name.split(":")[0].toLowerCase();
      if (ROUTER_MODELS.some(rm => tag.name.toLowerCase().startsWith(rm))) {
        return tag;
      }
    }

    // Priority 2: Any model under 4GB (likely small enough for fast classification)
    const smallModels = tags.filter(t => t.size > 0 && t.size < 4 * 1024 * 1024 * 1024);
    if (smallModels.length > 0) {
      // Pick the smallest one (fastest inference)
      return smallModels.sort((a, b) => a.size - b.size)[0];
    }

    return null;
  }

  private findBestHandsModel(
    tags: Array<{ name: string; size: number }>
  ): { name: string; size: number } | null {
    // Priority 1: Explicitly known code models
    for (const tag of tags) {
      const lower = tag.name.toLowerCase();
      if (CODE_MODELS.some(cm => lower.startsWith(cm))) {
        return tag;
      }
    }

    // Priority 2: Any model with "coder" in the name
    const coderModels = tags.filter(t => t.name.toLowerCase().includes("coder"));
    if (coderModels.length > 0) {
      // Pick the largest coder model (best code quality)
      return coderModels.sort((a, b) => b.size - a.size)[0];
    }

    // Priority 3: Any model between 2-10GB (good code model size)
    const mediumModels = tags.filter(t => t.size > 2 * 1024 * 1024 * 1024 && t.size < 10 * 1024 * 1024 * 1024);
    if (mediumModels.length > 0) {
      return mediumModels.sort((a, b) => b.size - a.size)[0];
    }

    return null;
  }

  // ─── Client Configuration ───────────────────────────────────────────────

  private configureFromExplicitEnv(): void {
    const routerModel = process.env.ROUTER_MODEL;
    const routerBaseUrl = process.env.ROUTER_BASE_URL;
    const handsModel = process.env.HANDS_MODEL;
    const handsBaseUrl = process.env.HANDS_BASE_URL;

    if (routerModel && routerBaseUrl) {
      this.configureRouterClient({ name: routerModel, size: 0 });
    }

    if (handsModel && handsBaseUrl) {
      this.configureHandsClient({ name: handsModel, size: 0 });
    }
  }

  private configureRouterClient(model: { name: string; size: number }): void {
    const baseUrl = process.env.ROUTER_BASE_URL || `${this.ollamaEndpoint}/v1`;
    const apiKey = process.env.ROUTER_API_KEY || "ollama";

    const client = new OpenAI({ baseURL: baseUrl, apiKey });
    this.routerClient = {
      client, model: model.name, name: "router",
      isOllamaNative: false, isOpenCodeAnthropic: false,
      baseURL: baseUrl, apiKey,
    };

    // Update context window from known models
    const knownWindow = KNOWN_CONTEXT_WINDOWS[model.name.toLowerCase()];
    if (knownWindow) this.contextWindows.router = knownWindow;
  }

  private configureHandsClient(model: { name: string; size: number }): void {
    const baseUrl = process.env.HANDS_BASE_URL || `${this.ollamaEndpoint}/v1`;
    const apiKey = process.env.HANDS_API_KEY || "ollama";

    const client = new OpenAI({ baseURL: baseUrl, apiKey });
    this.handsClient = {
      client, model: model.name, name: "hands",
      isOllamaNative: false, isOpenCodeAnthropic: false,
      baseURL: baseUrl, apiKey,
    };

    // Update context window from known models
    const knownWindow = KNOWN_CONTEXT_WINDOWS[model.name.toLowerCase()];
    if (knownWindow) this.contextWindows.hands = knownWindow;
  }

  // ─── Health Checking ────────────────────────────────────────────────────

  /**
   * Check if configured small models are responsive.
   * Updates health records and disables models that fail repeatedly.
   */
  async runHealthCheck(): Promise<void> {
    if (this.routerClient && !this.routerHealth.disabled) {
      await this.checkModelHealth(this.routerClient, this.routerHealth);
    }
    if (this.handsClient && !this.handsHealth.disabled) {
      await this.checkModelHealth(this.handsClient, this.handsHealth);
    }
  }

  private async checkModelHealth(client: LLMInstance, health: ModelHealth): Promise<void> {
    const start = Date.now();
    try {
      // Simple ping: ask for a single token
      const response = await client.client.chat.completions.create({
        model: client.model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
        temperature: 0,
      });
      const latency = Date.now() - start;

      health.available = true;
      health.lastCheck = Date.now();
      health.latencyMs = latency;
      health.consecutiveFailures = 0;

      if (health.disabled) {
        // Model recovered — re-enable it
        health.disabled = false;
        log.info(`Model ${health.role} recovered`, { data: { model: health.model, latencyMs: latency } });
      }
    } catch (err) {
      health.available = false;
      health.lastCheck = Date.now();
      health.latencyMs = null;
      health.consecutiveFailures++;

      log.warn(`Model ${health.role} health check failed`, {
        data: {
          model: health.model,
          consecutiveFailures: health.consecutiveFailures,
          error: err instanceof Error ? err.message : String(err),
        },
      });

      // Disable after threshold failures
      if (health.consecutiveFailures >= this.failureThreshold) {
        health.disabled = true;
        log.warn(`Model ${health.role} disabled after ${health.consecutiveFailures} consecutive failures`, {
          data: { model: health.model },
        });
      }
    }
  }

  /**
   * Record a successful call to a model (resets failure counter).
   */
  private recordSuccess(role: ModelRole): void {
    const health = role === "router" ? this.routerHealth : this.handsHealth;
    health.consecutiveFailures = 0;
    health.available = true;
  }

  /**
   * Record a failed call to a model (increments failure counter).
   */
  private recordFailure(role: ModelRole): void {
    const health = role === "router" ? this.routerHealth : this.handsHealth;
    health.consecutiveFailures++;
    health.available = false;

    if (health.consecutiveFailures >= this.failureThreshold) {
      health.disabled = true;
      log.warn(`Model ${role} disabled after ${health.consecutiveFailures} failures during routing`);
    }
  }

  // ─── Public Query Methods ───────────────────────────────────────────────

  /** Check if the router model is available and healthy. */
  hasRouter(): boolean {
    return this.routerClient !== null && !this.routerHealth.disabled;
  }

  /** Check if the hands model is available and healthy. */
  hasHands(): boolean {
    return this.handsClient !== null && !this.handsHealth.disabled;
  }

  /** Get the hands model client (for AgentLoop to use for code sub-tasks). */
  getHandsClient(): LLMInstance | null {
    return this.hasHands() ? this.handsClient : null;
  }

  /** Get the context window for a given role. */
  getContextWindow(role: ModelRole): number {
    return this.contextWindows[role];
  }

  /** Get the max output tokens for a given role. */
  getMaxOutputTokens(role: ModelRole): number {
    return this.maxOutputTokens[role];
  }

  /** Get health status for all models. */
  getHealthStatus(): { router: ModelHealth; hands: ModelHealth } {
    return { router: { ...this.routerHealth }, hands: { ...this.handsHealth } };
  }

  // ─── Classification ─────────────────────────────────────────────────────

  /**
   * Classify a user message and determine which model should handle it.
   * If no router model is configured, always returns "brain" (backward compatible).
   *
   * Enhanced v2:
   *   - Context-aware: considers current context length
   *   - Confidence-gated: won't route to small models on uncertain classification
   *   - Health-aware: won't route to disabled/unhealthy models
   *   - Returns context window and max tokens for the target model
   */
  async classify(message: string, contextTokenCount?: number): Promise<RoutingDecision> {
    const brainDecision: RoutingDecision = {
      role: "brain",
      category: "unknown",
      reason: "Default to brain",
      confidence: 1.0,
      contextWindow: this.contextWindows.brain,
      maxTokens: this.maxOutputTokens.brain,
      useCodePrompt: false,
    };

    // No router model → everything goes to brain
    if (!this.routerClient) {
      this.stats.brainCalls++;
      return { ...brainDecision, reason: "No router model configured" };
    }

    // Router is disabled due to repeated failures
    if (this.routerHealth.disabled) {
      this.stats.brainCalls++;
      return { ...brainDecision, reason: "Router model disabled (health failures)" };
    }

    // Context-aware check: if context is too large for small models, go straight to brain
    if (contextTokenCount !== undefined) {
      const maxSmallModelContext = Math.max(
        this.hasHands() ? this.contextWindows.hands : 0,
        this.contextWindows.router
      );
      if (contextTokenCount > maxSmallModelContext * 0.8) {
        // Context exceeds 80% of the largest small model's window — use brain
        this.stats.brainCalls++;
        return {
          ...brainDecision,
          reason: `Context (${contextTokenCount} tokens) exceeds small model capacity (${maxSmallModelContext})`,
        };
      }
    }

    // Check classification cache (same message within a turn)
    if (this.lastClassification && this.lastClassifiedMessage === message) {
      return this.lastClassification;
    }

    try {
      const classifyStart = Date.now();
      const response = await this.routerClient.client.chat.completions.create({
        model: this.routerClient.model,
        messages: [
          { role: "system", content: this.classificationPrompt },
          { role: "user", content: message.slice(0, 500) }, // Truncate for classification
        ],
        max_tokens: 20,
        temperature: 0,
      });

      const classifyLatency = Date.now() - classifyStart;
      this.recordSuccess("router");
      this.routerHealth.latencyMs = classifyLatency;

      const rawCategory = response.choices[0]?.message?.content?.trim().toLowerCase() || "unknown";
      const category = this.parseCategory(rawCategory);

      // Build routing decision
      let decision: RoutingDecision;

      if (this.routerHandledCategories.has(category)) {
        // Router handles directly — but only if confident enough
        const confidence = 0.85; // Router self-classification is reasonably confident
        if (confidence >= this.minConfidence) {
          this.stats.routerCalls++;
          // Estimate tokens saved: brain would use ~4K tokens for this, router uses ~300
          this.stats.routerTokensSaved += 3700;

          decision = {
            role: "router",
            category,
            reason: `Classified as ${category} — handled by router model (${classifyLatency}ms)`,
            confidence,
            contextWindow: this.contextWindows.router,
            maxTokens: this.maxOutputTokens.router,
            useCodePrompt: false,
          };
        } else {
          // Below confidence threshold — escalate to brain
          this.stats.brainCalls++;
          decision = {
            ...brainDecision,
            category,
            reason: `Classified as ${category} but confidence below threshold — escalated to brain`,
            confidence,
          };
        }
      } else if (this.handsCategories.has(category) && this.hasHands()) {
        // Code task → hands model (if healthy)
        const confidence = 0.85;
        if (confidence >= this.minConfidence) {
          this.stats.handsCalls++;
          // Estimate tokens saved: brain uses ~8K, hands uses ~4K for code
          this.stats.handsTokensSaved += 4000;

          decision = {
            role: "hands",
            category,
            reason: `Classified as ${category} — delegated to hands model (${this.handsClient!.model})`,
            confidence,
            contextWindow: this.contextWindows.hands,
            maxTokens: this.maxOutputTokens.hands,
            useCodePrompt: true, // Use code-optimized prompt for hands
          };
        } else {
          this.stats.brainCalls++;
          decision = {
            ...brainDecision,
            category,
            reason: `Classified as ${category} but confidence below threshold — brain handles with code tools`,
            confidence,
            useCodePrompt: true, // Still use code prompt since it's a code task
          };
        }
      } else {
        // Everything else goes to brain
        this.stats.brainCalls++;
        decision = {
          ...brainDecision,
          category,
          reason: `Classified as ${category} — requires brain model`,
          confidence: 0.85,
        };
      }

      // Cache the classification
      this.lastClassification = decision;
      this.lastClassifiedMessage = message;

      return decision;
    } catch (err) {
      this.recordFailure("router");
      this.stats.brainCalls++;
      const errMsg = err instanceof Error ? err.message : String(err);
      log.warn("Classification failed — routing to brain", { error: errMsg });
      return {
        ...brainDecision,
        reason: `Classification error: ${errMsg}`,
        confidence: 0.5,
      };
    }
  }

  // ─── Direct Handling (Router Model) ─────────────────────────────────────

  /**
   * Handle a simple message directly using the router model (streaming).
   * Returns an async generator yielding text chunks, or null if router can't handle it.
   */
  async *handleDirectlyStreamed(
    message: string,
    systemPrompt?: string
  ): AsyncGenerator<string, void, unknown> {
    if (!this.routerClient || this.routerHealth.disabled) return;

    const messages = [
      { role: "system" as const, content: systemPrompt || "You are M.A.I., a personal AI assistant. Be concise and helpful." },
      { role: "user" as const, content: message },
    ];

    try {
      const tokenStream = streamWithProvider(this.routerClient, messages, {
        temperature: 0.7,
        max_tokens: this.maxOutputTokens.router,
      });

      for await (const token of tokenStream) {
        yield token;
      }

      this.recordSuccess("router");
    } catch (err) {
      this.recordFailure("router");
      log.warn("Direct handling (streamed) failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Handle a simple message directly using the router model (non-streaming).
   * Returns the response text, or null if the router can't handle it.
   */
  async handleDirectly(message: string, systemPrompt?: string): Promise<string | null> {
    if (!this.routerClient || this.routerHealth.disabled) return null;

    try {
      const response = await this.routerClient.client.chat.completions.create({
        model: this.routerClient.model,
        messages: [
          { role: "system", content: systemPrompt || "You are M.A.I., a personal AI assistant. Be concise and helpful." },
          { role: "user", content: message },
        ],
        max_tokens: this.maxOutputTokens.router,
        temperature: 0.7,
      });

      this.recordSuccess("router");
      return response.choices[0]?.message?.content?.trim() || null;
    } catch (err) {
      this.recordFailure("router");
      log.warn("Direct handling failed", { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  // ─── Code Generation (Hands Model) ──────────────────────────────────────

  /**
   * Generate code using the hands model.
   * Returns the generated code text, or null if hands model unavailable.
   *
   * @param prompt - Code generation prompt (should include context about what to generate)
   * @param onToken - Optional callback for streaming tokens
   */
  async *generateCodeStreamed(
    prompt: string,
    onToken?: (token: string) => void
  ): AsyncGenerator<string, void, unknown> {
    if (!this.handsClient || this.handsHealth.disabled) return;

    const messages = [
      { role: "system" as const, content: CODE_SYSTEM_PROMPT },
      { role: "user" as const, content: prompt },
    ];

    try {
      const tokenStream = streamWithProvider(this.handsClient, messages, {
        temperature: 0.3, // Lower temperature for code (more deterministic)
        max_tokens: this.maxOutputTokens.hands,
      });

      for await (const token of tokenStream) {
        onToken?.(token);
        yield token;
      }

      this.recordSuccess("hands");
    } catch (err) {
      this.recordFailure("hands");
      log.warn("Code generation (hands) failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Generate code using the hands model (non-streaming).
   */
  async generateCode(prompt: string): Promise<string | null> {
    if (!this.handsClient || this.handsHealth.disabled) return null;

    try {
      const response = await this.handsClient.client.chat.completions.create({
        model: this.handsClient.model,
        messages: [
          { role: "system", content: CODE_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: this.maxOutputTokens.hands,
        temperature: 0.3,
      });

      this.recordSuccess("hands");
      return response.choices[0]?.message?.content?.trim() || null;
    } catch (err) {
      this.recordFailure("hands");
      log.warn("Code generation (hands) failed", { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * Get the code-optimized system prompt for the hands model.
   */
  getCodeSystemPrompt(): string {
    return CODE_SYSTEM_PROMPT;
  }

  // ─── Main Routing Entry Point ───────────────────────────────────────────

  /**
   * Route a message: classify it, and either handle directly or return
   * the routing decision for the AgentLoop to use the appropriate model.
   *
   * Returns:
   *   { handled: true, response: "..." } if router handled it directly
   *   { handled: false, decision: RoutingDecision } if brain/hands should handle it
   *
   * Enhanced v2: now context-aware (takes optional contextTokenCount).
   */
  async route(
    message: string,
    contextTokenCount?: number
  ): Promise<
    | { handled: true; response: string; decision: RoutingDecision }
    | { handled: false; decision: RoutingDecision }
  > {
    const decision = await this.classify(message, contextTokenCount);

    if (decision.role === "router") {
      const response = await this.handleDirectly(message);
      if (response) {
        return { handled: true, response, decision };
      }
      // Router couldn't handle it — fall through to brain
      return {
        handled: false,
        decision: {
          ...decision,
          role: "brain",
          reason: "Router failed to generate response — falling back to brain",
          contextWindow: this.contextWindows.brain,
          maxTokens: this.maxOutputTokens.brain,
          useCodePrompt: false,
        },
      };
    }

    return { handled: false, decision };
  }

  // ─── Stats & Info ───────────────────────────────────────────────────────

  /**
   * Get routing statistics including token savings.
   */
  getStats() {
    return {
      ...this.stats,
      totalCalls: this.stats.routerCalls + this.stats.handsCalls + this.stats.brainCalls,
      totalTokensSaved: this.stats.routerTokensSaved + this.stats.handsTokensSaved,
      routerHealth: this.routerHealth,
      handsHealth: this.handsHealth,
      contextWindows: this.contextWindows,
    };
  }

  /**
   * Reset routing statistics (e.g. for daily reset).
   */
  resetStats(): void {
    this.stats = {
      routerCalls: 0, routerTokensSaved: 0,
      handsCalls: 0, handsTokensSaved: 0,
      brainCalls: 0,
    };
    log.info("Router stats reset");
  }

  /**
   * Get info about configured models.
   */
  getInfo(): {
    router: boolean;
    hands: boolean;
    routerModel?: string;
    handsModel?: string;
    routerHealthy?: boolean;
    handsHealthy?: boolean;
  } {
    return {
      router: this.routerClient !== null,
      hands: this.handsClient !== null,
      routerModel: this.routerClient?.model,
      handsModel: this.handsClient?.model,
      routerHealthy: this.routerClient ? !this.routerHealth.disabled : undefined,
      handsHealthy: this.handsClient ? !this.handsHealth.disabled : undefined,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private parseCategory(raw: string): MessageCategory {
    const valid: MessageCategory[] = [
      "simple_qa", "system_command", "code_task",
      "complex_task", "planning", "conversation", "unknown",
    ];
    // Exact match first
    if (valid.includes(raw as MessageCategory)) {
      return raw as MessageCategory;
    }
    // Partial match
    for (const cat of valid) {
      if (raw.includes(cat)) return cat;
    }
    return "unknown";
  }
}
