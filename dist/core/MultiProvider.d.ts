import OpenAI from "openai";
import type { ProviderEntry } from "../types/index.js";
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
/**
 * Parse provider configuration from environment variables.
 * Returns an ordered array of providers (primary first, then fallbacks).
 *
 * OpenRouter is auto-configured if OPENROUTER_API_KEY is set:
 *   - Primary: uses LLM_BASE_URL etc if provided
 *   - Fallback: auto-adds OpenRouter with glm-5.2:free model
 */
export declare function loadProviders(): ProviderEntry[];
/**
 * Create client instances from provider entries.
 * Ollama Cloud providers get flagged for native API usage.
 */
export declare function createClients(providers: ProviderEntry[]): LLMInstance[];
/**
 * Try calling the LLM across providers in order.
 * Falls through to the next provider on any error.
 * Ollama Cloud providers use native /api/chat, all others use OpenAI SDK.
 * Returns the successful response or throws if all providers fail.
 */
export declare function callWithFallback(clients: LLMInstance[], messages: {
    role: string;
    content: string;
}[], options?: {
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}): Promise<{
    content: string;
    providerName: string;
}>;
/**
 * Call a single provider with streaming support.
 * Returns an async generator yielding text chunks.
 * Ollama Cloud providers use native /api/chat with streaming.
 */
export declare function streamWithProvider(instance: LLMInstance, messages: {
    role: string;
    content: string;
}[], options?: {
    temperature?: number;
    max_tokens?: number;
}): AsyncGenerator<string, void, unknown>;
//# sourceMappingURL=MultiProvider.d.ts.map