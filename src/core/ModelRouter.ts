// ─── M.A.I. Model Router ──────────────────────────────────────────────────
// Routes user messages to the appropriate model based on complexity.
//
// Architecture:
//   - brain:  The large model (120B) for planning, reasoning, personality, complex tasks
//   - router: A small local model (1.2B) for message classification and simple Q&A
//   - hands:  A code-focused model (Qwen Coder) for code sub-tasks
//
// When router/hands are not configured, everything goes to brain (current behavior).
// This is fully backward-compatible — if no ROUTER_MODEL is set, the router
// passes everything through to the brain unchanged.

import OpenAI from "openai";
import { loadProviders, createClients, type LLMInstance } from "./MultiProvider.js";

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
}

// ─── Classification prompt ────────────────────────────────────────────────

const DEFAULT_CLASSIFICATION_PROMPT = `You are a message classifier for an AI assistant. Classify the user message into exactly ONE of these categories:

- simple_qa: Simple questions that can be answered from general knowledge (time, weather-like, math, definitions, facts). No tools needed.
- system_command: Requests to change settings, switch models, clear history, or other system operations.
- code_task: Requests to write, edit, debug, review, or explain code. Includes asking about programming concepts.
- complex_task: Multi-step tasks that require planning, tool use, or external actions (build a project, deploy, analyze data, manage files).
- planning: Requests to plan, strategize, or break down a goal into steps.
- conversation: Casual chat, greetings, opinions, creative writing, or personality-driven responses.

Respond with ONLY the category name, nothing else. If unsure, respond with "complex_task".`;

// ─── Model Router ──────────────────────────────────────────────────────────

export class ModelRouter {
  private routerClient: LLMInstance | null = null;
  private handsClient: LLMInstance | null = null;
  private classificationPrompt: string;
  private routerHandledCategories: Set<MessageCategory>;
  private handsCategories: Set<MessageCategory>;

  // Stats
  private stats = {
    total: 0,
    routerHandled: 0,
    handsDelegated: 0,
    brainRequired: 0,
    classificationErrors: 0,
  };

  constructor(config: RouterConfig = {}) {
    this.classificationPrompt = config.classificationPrompt || DEFAULT_CLASSIFICATION_PROMPT;
    this.routerHandledCategories = new Set(config.routerHandledCategories || ["simple_qa", "system_command"]);
    this.handsCategories = new Set(config.handsCategories || ["code_task"]);

    // Initialize router model if configured
    if (config.routerModel && config.routerBaseUrl) {
      const client = new OpenAI({
        baseURL: config.routerBaseUrl,
        apiKey: config.routerApiKey || "unused",
      });
      this.routerClient = {
        client,
        model: config.routerModel,
        name: "router",
        isOllamaNative: false,
        isOpenCodeAnthropic: false,
        baseURL: config.routerBaseUrl,
        apiKey: config.routerApiKey || "",
      };
      console.log(`[ModelRouter] Router model configured: ${config.routerModel} at ${config.routerBaseUrl}`);
    }

    // Initialize hands model if configured
    if (config.handsModel && config.handsBaseUrl) {
      const client = new OpenAI({
        baseURL: config.handsBaseUrl,
        apiKey: config.handsApiKey || "unused",
      });
      this.handsClient = {
        client,
        model: config.handsModel,
        name: "hands",
        isOllamaNative: false,
        isOpenCodeAnthropic: false,
        baseURL: config.handsBaseUrl,
        apiKey: config.handsApiKey || "",
      };
      console.log(`[ModelRouter] Hands model configured: ${config.handsModel} at ${config.handsBaseUrl}`);
    }

    if (!this.routerClient && !this.handsClient) {
      console.log("[ModelRouter] No router/hands models configured — all messages go to brain");
    }
  }

  /**
   * Create a ModelRouter from environment variables.
   *
   * Env vars:
   *   ROUTER_MODEL, ROUTER_BASE_URL, ROUTER_API_KEY  — classification model
   *   HANDS_MODEL, HANDS_BASE_URL, HANDS_API_KEY      — code model
   */
  static fromEnv(): ModelRouter {
    return new ModelRouter({
      routerModel: process.env.ROUTER_MODEL,
      routerBaseUrl: process.env.ROUTER_BASE_URL,
      routerApiKey: process.env.ROUTER_API_KEY,
      handsModel: process.env.HANDS_MODEL,
      handsBaseUrl: process.env.HANDS_BASE_URL,
      handsApiKey: process.env.HANDS_API_KEY,
    });
  }

  /**
   * Check if the router model is available.
   */
  hasRouter(): boolean {
    return this.routerClient !== null;
  }

  /**
   * Check if the hands model is available.
   */
  hasHands(): boolean {
    return this.handsClient !== null;
  }

  /**
   * Get the hands model client (for AgentLoop to use for code sub-tasks).
   */
  getHandsClient(): LLMInstance | null {
    return this.handsClient;
  }

  /**
   * Classify a user message and determine which model should handle it.
   * If no router model is configured, always returns "brain" (backward compatible).
   */
  async classify(message: string): Promise<RoutingDecision> {
    this.stats.total++;

    // No router model → everything goes to brain
    if (!this.routerClient) {
      this.stats.brainRequired++;
      return {
        role: "brain",
        category: "unknown",
        reason: "No router model configured",
        confidence: 1.0,
      };
    }

    try {
      const response = await this.routerClient.client.chat.completions.create({
        model: this.routerClient.model,
        messages: [
          { role: "system", content: this.classificationPrompt },
          { role: "user", content: message.slice(0, 500) }, // Truncate long messages for classification
        ],
        max_tokens: 20,
        temperature: 0,
      });

      const rawCategory = response.choices[0]?.message?.content?.trim().toLowerCase() || "unknown";
      const category = this.parseCategory(rawCategory);

      // Determine which role handles this category
      if (this.routerHandledCategories.has(category)) {
        this.stats.routerHandled++;
        return {
          role: "router",
          category,
          reason: `Classified as ${category} — handled by router model`,
          confidence: 0.85,
        };
      }

      if (this.handsCategories.has(category) && this.handsClient) {
        this.stats.handsDelegated++;
        return {
          role: "hands",
          category,
          reason: `Classified as ${category} — delegated to hands model`,
          confidence: 0.85,
        };
      }

      // Everything else goes to brain
      this.stats.brainRequired++;
      return {
        role: "brain",
        category,
        reason: `Classified as ${category} — requires brain model`,
        confidence: 0.85,
      };
    } catch (err) {
      this.stats.classificationErrors++;
      this.stats.brainRequired++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[ModelRouter] Classification failed: ${errMsg} — routing to brain`);
      return {
        role: "brain",
        category: "unknown",
        reason: `Classification error: ${errMsg}`,
        confidence: 0.5,
      };
    }
  }

  /**
   * Handle a simple message directly using the router model.
   * Returns the response text, or null if the router can't handle it.
   */
  async handleDirectly(message: string, systemPrompt?: string): Promise<string | null> {
    if (!this.routerClient) return null;

    try {
      const response = await this.routerClient.client.chat.completions.create({
        model: this.routerClient.model,
        messages: [
          { role: "system", content: systemPrompt || "You are M.A.I., a personal AI assistant. Be concise and helpful." },
          { role: "user", content: message },
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content?.trim() || null;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[ModelRouter] Direct handling failed: ${errMsg}`);
      return null;
    }
  }

  /**
   * Route a message: classify it, and either handle directly or return
   * the routing decision for the AgentLoop to use the appropriate model.
   *
   * Returns:
   *   { handled: true, response: "..." } if router handled it directly
   *   { handled: false, decision: RoutingDecision } if brain/hands should handle it
   */
  async route(message: string): Promise<
    | { handled: true; response: string; decision: RoutingDecision }
    | { handled: false; decision: RoutingDecision }
  > {
    const decision = await this.classify(message);

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
        },
      };
    }

    return { handled: false, decision };
  }

  /**
   * Get routing statistics.
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Get info about configured models.
   */
  getInfo(): { router: boolean; hands: boolean; routerModel?: string; handsModel?: string } {
    return {
      router: this.routerClient !== null,
      hands: this.handsClient !== null,
      routerModel: this.routerClient?.model,
      handsModel: this.handsClient?.model,
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
