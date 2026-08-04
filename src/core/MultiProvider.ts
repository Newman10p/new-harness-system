// ─── M.A.I. Multi-Provider Fallback ───────────────────────────────────────
// Manages multiple LLM providers with automatic fallback.
// Tries providers in priority order, falls through on errors.
// Supports: Ollama local (OpenAI-compat), Ollama Cloud (native API),
//          OpenAI, NVIDIA NIM, Anthropic (via proxy),
//          OpenCode Zen (pay-as-you-go), OpenCode Go ($10/mo subscription).
//
// Configuration via environment variables:
//   LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_PROVIDER  (primary)
//   LLM_FALLBACK_1_BASE_URL, LLM_FALLBACK_1_API_KEY, LLM_FALLBACK_1_MODEL  (fallback)
//   LLM_FALLBACK_2_BASE_URL, LLM_FALLBACK_2_API_KEY, LLM_FALLBACK_2_MODEL  (fallback)
//   ... up to LLM_FALLBACK_4
//
// OpenCode Zen provider:
//   LLM_BASE_URL=https://opencode.ai/zen/v1
//   LLM_API_KEY=<your-opencode-zen-api-key>
//   LLM_MODEL=gpt-5.5 (or any supported model)
//   LLM_PROVIDER=opencode-zen
//
// OpenCode Go provider:
//   LLM_BASE_URL=https://opencode.ai/zen/go/v1
//   LLM_API_KEY=<your-opencode-go-api-key>
//   LLM_MODEL=kimi-k3 (or any Go-supported model)
//   LLM_PROVIDER=opencode-go

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
  /** If true, use OpenCode Anthropic-compatible /v1/messages endpoint */
  isOpenCodeAnthropic: boolean;
  /** Raw baseURL for native calls */
  baseURL: string;
  /** API key for native calls */
  apiKey: string;
}

/** Providers that use Ollama native /api/chat (not OpenAI-compatible) */
const OLLAMA_NATIVE_PROVIDERS = ["ollama-cloud"];

/** OpenCode provider types */
const OPENCODE_PROVIDERS = ["opencode-zen", "opencode-go"];

/**
 * Check if a provider name uses the Ollama native API.
 */
function isOllamaNativeProvider(name: string): boolean {
  return OLLAMA_NATIVE_PROVIDERS.includes(name.toLowerCase());
}

/**
 * Check if a provider uses OpenCode Anthropic Messages API.
 * Some OpenCode models use /v1/messages (Anthropic format) instead of /v1/chat/completions.
 */
function isOpenCodeAnthropicProvider(name: string, model: string): boolean {
  if (!OPENCODE_PROVIDERS.includes(name.toLowerCase())) return false;
  // Models that use Anthropic Messages API format:
  // claude-*, qwen*, minimax* (in Go subscription), and others per docs
  const anthropicModels = [
    "claude", "qwen", "minimax",
  ];
  const modelLower = model.toLowerCase();
  return anthropicModels.some(m => modelLower.startsWith(m));
}

/**
 * Get the correct endpoint suffix for OpenCode providers.
 */
function getOpenCodeEndpoint(name: string, model: string): string {
  if (isOpenCodeAnthropicProvider(name, model)) {
    return "/messages"; // Anthropic Messages API
  }
  return "/chat/completions"; // OpenAI Chat Completions API
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
 * Create client instances from provider entries.
 * Ollama Cloud providers get flagged for native API usage.
 */
export function createClients(providers: ProviderEntry[]): LLMInstance[] {
  return providers.map((p) => {
    const native = isOllamaNativeProvider(p.name);
    const openCodeAnthropic = isOpenCodeAnthropicProvider(p.name, p.model);

    // For Ollama native, we still create an OpenAI client as placeholder.
    // For OpenCode Anthropic, create OpenAI client pointing to the Anthropic endpoint.
    let baseURL = p.baseURL;
    let apiKey = p.apiKey;

    // OpenCode Anthropic providers need the endpoint adjusted
    if (openCodeAnthropic) {
      // The OpenAI SDK will hit baseURL + /chat/completions by default,
      // but we'll use the native fetch path instead (like Ollama native)
    }

    const client = new OpenAI({ baseURL, apiKey });

    return {
      client,
      model: p.model,
      name: p.name,
      isOllamaNative: native,
      isOpenCodeAnthropic: openCodeAnthropic,
      baseURL,
      apiKey,
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
 * Call OpenCode Anthropic Messages API using fetch.
 * Uses /v1/messages endpoint (Anthropic format).
 */
async function callOpenCodeAnthropic(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
  // Strip trailing /v1 if present — endpoint is /v1/messages
  let base = baseURL.replace(/\/+$/, "");

  const url = `${base}/v1/messages`;

  // Extract system message from messages array (Anthropic uses separate system param)
  let systemPrompt = "";
  const chatMessages = messages.filter(m => {
    if (m.role === "system") {
      systemPrompt += (systemPrompt ? "\n" : "") + m.content;
      return false;
    }
    return true;
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: options.max_tokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      ...(systemPrompt ? { system: systemPrompt } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`OpenCode Anthropic API error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };

  // Anthropic format returns content as array of content blocks
  return data.content
    ?.filter(b => b.type === "text")
    .map(b => b.text || "")
    .join("") || "";
}

/**
 * Try calling the LLM across providers in order.
 * Falls through to the next provider on any error.
 * Ollama Cloud providers use native /api/chat, OpenCode Anthropic uses /v1/messages,
 * all others use OpenAI SDK.
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
      } else if (instance.isOpenCodeAnthropic) {
        // OpenCode Anthropic — use /v1/messages
        content = await callOpenCodeAnthropic(
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
    // ... existing code unchanged ...
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

    // Add a timeout so the generator can't hang forever
    const timeoutMs = (options.max_tokens ?? 4096) * 50; // rough estimate: 50ms per token
    const timeout = setTimeout(() => {
      reader.cancel?.();
    }, Math.max(timeoutMs, 120_000)); // at least 2 minutes

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split by newlines, keep the last (possibly incomplete) line in buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const json = JSON.parse(trimmed);
            if (json.done === true) {
              // Stream complete — process any final content and exit
              if (json.message?.content) {
                yield json.message.content;
              }
              clearTimeout(timeout);
              return;
            }
            const token = json.message?.content;
            if (token) yield token;
          } catch {
            // Incomplete JSON from chunk split — will be prepended by next chunk via buffer
            // Don't skip it, put it back in the buffer
            buffer = trimmed + "\n" + buffer;
            break; // stop processing lines, wait for more data
          }
        }
      }

      // Process any remaining buffer after stream ends
      if (buffer.trim()) {
        try {
          const json = JSON.parse(buffer.trim());
          if (json.message?.content) yield json.message.content;
        } catch {
          // Can't parse remaining buffer, discard
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } else if (instance.isOpenCodeAnthropic) {
    // OpenCode Anthropic streaming via /v1/messages with stream: true
    // SSE format: event: content_block_delta, data: { delta: { type: "text_delta", text: "..." } }
    let base = instance.baseURL.replace(/\/+$/, "");
    const url = `${base}/v1/messages`;

    // Extract system message (Anthropic format uses separate system param)
    let systemPrompt = "";
    const chatMessages = messages.filter(m => {
      if (m.role === "system") {
        systemPrompt += (systemPrompt ? "\n" : "") + m.content;
        return false;
      }
      return true;
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": instance.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: instance.model,
        messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: options.max_tokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        stream: true,
        ...(systemPrompt ? { system: systemPrompt } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`OpenCode Anthropic stream error ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";
    const timeoutMs = (options.max_tokens ?? 4096) * 50;
    const timeout = setTimeout(() => { reader.cancel?.(); }, Math.max(timeoutMs, 120_000));

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("event:")) continue;
          if (!trimmed.startsWith("data:")) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]") { clearTimeout(timeout); return; }

          try {
            const json = JSON.parse(jsonStr);
            // Anthropic streaming: content_block_delta has delta.text
            if (json.type === "content_block_delta" && json.delta?.text) {
              yield json.delta.text;
            }
            // Also handle message_stop
            if (json.type === "message_stop") {
              clearTimeout(timeout);
              return;
            }
          } catch {
            buffer = jsonStr + "\n" + buffer;
            break;
          }
        }
      }
    } finally {
      clearTimeout(timeout);
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
