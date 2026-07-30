// ─── M.A.I. Multi-Provider Fallback ───────────────────────────────────────
// Manages multiple LLM providers with automatic fallback.
// Tries providers in priority order, falls through on errors.
// Supports: Ollama local, Ollama Cloud, OpenAI, NVIDIA NIM, Anthropic (via proxy).
//
// Configuration via environment variables:
//   LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_PROVIDER  (primary)
//   LLM_FALLBACK_1_BASE_URL, LLM_FALLBACK_1_API_KEY, LLM_FALLBACK_1_MODEL  (fallback)
//   LLM_FALLBACK_2_BASE_URL, LLM_FALLBACK_2_API_KEY, LLM_FALLBACK_2_MODEL  (fallback)
//   ... up to LLM_FALLBACK_4

import OpenAI from "openai";
import type { ProviderEntry } from "../types/index.js";

export interface LLMInstance {
  client: OpenAI;
  model: string;
  name: string;
}

/**
 * Parse provider configuration from environment variables.
 * Returns an ordered array of providers (primary first, then fallbacks).
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

  // Fallback providers (up to 4)
  for (let i = 1; i <= 4; i++) {
    const prefix = `LLM_FALLBACK_${i}_`;
    const baseURL = process.env[prefix + "BASE_URL"];
    const apiKey = process.env[prefix + "API_KEY"];
    const model = process.env[prefix + "MODEL"];
    const name = process.env[prefix + "PROVIDER"];

    if (baseURL && apiKey && model) {
      providers.push({
        name: name || `fallback-${i}`,
        baseURL,
        apiKey,
        model,
        priority: i,
      });
    }
  }

  return providers.sort((a, b) => a.priority - b.priority);
}

/**
 * Create OpenAI client instances from provider entries.
 */
export function createClients(providers: ProviderEntry[]): LLMInstance[] {
  return providers.map((p) => ({
    client: new OpenAI({
      baseURL: p.baseURL,
      apiKey: p.apiKey,
    }),
    model: p.model,
    name: p.name,
  }));
}

/**
 * Try calling the LLM across providers in order.
 * Falls through to the next provider on any error.
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
      const response = await instance.client.chat.completions.create({
        model: instance.model,
        messages: messages as Parameters<typeof instance.client.chat.completions.create>[0]["messages"],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 4096,
      });

      const content = (response as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
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
