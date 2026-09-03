// ─── M.A.I. Multi-Provider Fallback ───────────────────────────────────────
// Manages multiple LLM providers with automatic fallback.
// Tries providers in priority order, falls through on errors.
// Supports: Ollama local (OpenAI-compat), Ollama Cloud (native API),
//          OpenAI, NVIDIA NIM, Anthropic (via proxy), OpenRouter.
//
// Configuration via environment variables:
//   LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_PROVIDER  (primary)
//   LLM_FALLBACK_1_BASE_URL, LLM_FALLBACK_1_API_KEY, LLM_FALLBACK_1_MODEL  (fallback)
//   LLM_FALLBACK_2_BASE_URL, LLM_FALLBACK_2_API_KEY, LLM_FALLBACK_2_MODEL  (fallback)
//   ... up to LLM_FALLBACK_4
//
// OpenRouter Support:
//   Set OPENROUTER_API_KEY and use model "z-ai/glm-5.2:free" for free tier.
//   OpenRouter uses OpenAI-compatible /v1/chat/completions endpoint.

import OpenAI from "openai";
import type { ProviderEntry } from "../types/index.js";

// ─── Provider types ────────────────────────────────────────────────────────
// Ollama Cloud uses native /api/chat endpoint (not OpenAI-compatible).
// All other providers use the OpenAI SDK (/v1/chat/completions).

export interface LLMInstance {
  client: OpenAI;
  model: string;
  name: string;
  /** If true, use Ollama native /api/chat via fetch instead of OpenAI SDK */
  isOllamaNative: boolean;
  /** Raw baseURL for native calls */
  baseURL: string;
  /** API key for native calls */
  apiKey: string;
}

/** Providers that use Ollama native /api/chat (not OpenAI-compatible) */
const OLLAMA_NATIVE_PROVIDERS = ["ollama-cloud"];

/**
 * Check if a provider name uses the Ollama native API.
 */
function isOllamaNativeProvider(name: string): boolean {
  return OLLAMA_NATIVE_PROVIDERS.includes(name.toLowerCase());
}

/**
 * Parse provider configuration from environment variables.
 * Returns an ordered array of providers (primary first, then fallbacks).
 * 
 * OpenRouter is auto-configured if OPENROUTER_API_KEY is set:
 *   - Primary: uses LLM_BASE_URL etc if provided
 *   - Fallback: auto-adds OpenRouter with glm-5.2:free model
 */
export function loadProviders(): ProviderEntry[] {
  const providers: ProviderEntry[] = [];

  // Primary provider
  const primaryBaseURL = process.env.LLM_BASE_URL;
  const primaryApiKey = process.env.LLM_API_KEY;
  const primaryModel = process.env.LLM_MODEL;
  const primaryProvider = process.env.LLM_PROVIDER;

  if (primaryBaseURL && primaryApiKey && primaryModel) {
    providers.push({
      name: primaryProvider || "primary",
      baseURL: primaryBaseURL,
      apiKey: primaryApiKey,
      model: primaryModel,
      priority: 0,
    });
  }

  // Auto-add OpenRouter as fallback if API key is provided
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    providers.push({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterKey,
      model: process.env.OPENROUTER_MODEL || "z-ai/glm-5.2:free",
      priority: 100, // lowest priority (last fallback)
    });
  }

  // Fallback providers (up to 4) — inserted before OpenRouter
  const fallbackProviders: ProviderEntry[] = [];
  for (let i = 1; i <= 4; i++) {
    const prefix = `LLM_FALLBACK_${i}_`;
    const baseURL = process.env[prefix + "BASE_URL"];
    const apiKey = process.env[prefix + "API_KEY"];
    const model = process.env[prefix + "MODEL"];
    const name = process.env[prefix + "PROVIDER"];

    if (baseURL && apiKey && model) {
      fallbackProviders.push({
        name: name || `fallback-${i}`,
        baseURL,
        apiKey,
        model,
        priority: i,
      });
    }
  }

  // Insert fallback providers before OpenRouter
  providers.push(...fallbackProviders);

  return providers.sort((a, b) => a.priority - b.priority);
}

/**
 * Create client instances from provider entries.
 * Ollama Cloud providers get flagged for native API usage.
 */
export function createClients(providers: ProviderEntry[]): LLMInstance[] {
  return providers.map((p) => {
    const native = isOllamaNativeProvider(p.name);

    // For Ollama native, we still create an OpenAI client as fallback,
    // but mark it so callWithFallback uses the native path first.
    const client = native
      ? new OpenAI({ baseURL: p.baseURL, apiKey: p.apiKey }) // placeholder (won't be used for native)
      : new OpenAI({ baseURL: p.baseURL, apiKey: p.apiKey });

    return {
      client,
      model: p.model,
      name: p.name,
      isOllamaNative: native,
      baseURL: p.baseURL,
      apiKey: p.apiKey,
    };
  });
}

/**
 * Call Ollama native /api/chat endpoint using fetch.
 * Used for Ollama Cloud which doesn't support OpenAI-compatible /v1/chat/completions.
 */
async function callOllamaNative(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
  // Strip trailing /v1 if present — Ollama native uses /api/chat
  let base = baseURL.replace(/\/+$/, "");
  if (base.endsWith("/v1")) {
    base = base.slice(0, -3);
  }

  const url = `${base}/api/chat`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.max_tokens ?? 4096,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Ollama native API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as {
    message?: { content?: string };
    response?: string;
  };

  // Ollama native returns content in data.message.content
  return data.message?.content ?? data.response ?? "";
}

/**
 * Try calling the LLM across providers in order.
 * Falls through to the next provider on any error.
 * Ollama Cloud providers use native /api/chat, all others use OpenAI SDK.
 * Returns the successful response or throws if all providers fail.
 */
export async function callWithFallback(
  clients: LLMInstance[],
  messages: { role: string; content: string }[],
  options: { temperature?: number; max_tokens?: number; stream?: boolean } = {}
): Promise<{ content: string; providerName: string }> {
  const lastErrors: string[] = [];

  for (const instance of clients) {
    try {
      let content: string;

      if (instance.isOllamaNative) {
        // Ollama Cloud — use native /api/chat
        content = await callOllamaNative(
          instance.baseURL,
          instance.apiKey,
          instance.model,
          messages,
          options
        );
      } else {
        // OpenAI-compatible provider — use OpenAI SDK
        const response = await instance.client.chat.completions.create({
          model: instance.model,
          messages: messages as Parameters<typeof instance.client.chat.completions.create>[0]["messages"],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 4096,
        });

        content = (response as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
      }

      return { content, providerName: instance.name };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastErrors.push(`${instance.name}: ${message}`);
      console.warn(`[LLM] Provider ${instance.name} failed: ${message}`);
    }
  }

  throw new Error(
    `All ${clients.length} providers failed:\n${lastErrors.join("\n")}`
  );
}

/**
 * Call a single provider with streaming support.
 * Returns an async generator yielding text chunks.
 * Ollama Cloud providers use native /api/chat with streaming.
 */
export async function* streamWithProvider(
  instance: LLMInstance,
  messages: { role: string; content: string }[],
  options: { temperature?: number; max_tokens?: number } = {}
): AsyncGenerator<string, void, unknown> {
  if (instance.isOllamaNative) {
    // Ollama native streaming via /api/chat with stream: true
    let base = instance.baseURL.replace(/\/+$/, "");
    if (base.endsWith("/v1")) {
      base = base.slice(0, -3);
    }
    const url = `${base}/api/chat`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${instance.apiKey}`,
      },
      body: JSON.stringify({
        model: instance.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.max_tokens ?? 4096,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Ollama native stream error ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "}") continue;
        try {
          const json = JSON.parse(trimmed.startsWith("{") ? trimmed : trimmed);
          const token = json.message?.content;
          if (token) yield token;
        } catch {
          // Might be a partial JSON — accumulate
        }
      }
    }
  } else {
    // OpenAI SDK streaming
    const stream = await instance.client.chat.completions.create({
      model: instance.model,
      messages: messages as Parameters<typeof instance.client.chat.completions.create>[0]["messages"],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: true,
    });

    for await (const chunk of stream as AsyncIterable<{ choices?: Array<{ delta?: { content?: string } }> }>) {
      const token = chunk.choices?.[0]?.delta?.content;
      if (token) yield token;
    }
  }
}
