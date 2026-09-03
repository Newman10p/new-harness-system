// ─── M.A.I. OpenRouter Integration ────────────────────────────────────────
// Direct integration with OpenRouter API using their official SDK.
// Provides streaming support with reasoning token tracking.
// Used as a fallback provider when primary providers fail.
//
// Usage:
//   const openRouter = new OpenRouterHandler(apiKey);
//   const stream = await openRouter.chat(messages, { model: "z-ai/glm-5.2:free" });
//   for await (const chunk of stream) { process.stdout.write(chunk); }

import { OpenRouter } from "@openrouter/sdk";

export interface OpenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenRouterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface OpenRouterUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export class OpenRouterHandler {
  private client: OpenRouter;
  private defaultModel: string;

  constructor(apiKey: string, options?: { baseURL?: string }) {
    this.client = new OpenRouter({
      apiKey,
      ...(options?.baseURL && { baseURL: options.baseURL })
    });
    this.defaultModel = "z-ai/glm-5.2:free";
  }

  /**
   * Send a chat request to OpenRouter.
   * Returns the response content and usage information.
   */
  async chat(
    messages: OpenRouterMessage[],
    options: OpenRouterOptions = {}
  ): Promise<{ content: string; usage?: OpenRouterUsage }> {
    const response = await this.client.chat.send({
      chatRequest: {
        model: options.model || this.defaultModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 4096,
        stream: false
      }
    });

    const content = (response as any).choices?.[0]?.message?.content ?? "";
    const usageData = (response as any).usage;
    const usage = usageData ? {
      promptTokens: usageData.promptTokens,
      completionTokens: usageData.completionTokens,
      totalTokens: usageData.totalTokens,
      reasoningTokens: usageData.completionTokensDetails?.reasoningTokens
    } : undefined;

    return { content, usage };
  }

  /**
   * Stream a chat request to OpenRouter.
   * Yields content chunks as they arrive.
   * Usage information comes in the final chunk.
   */
  async *chatStream(
    messages: OpenRouterMessage[],
    options: OpenRouterOptions = {}
  ): AsyncGenerator<{ content?: string; usage?: OpenRouterUsage; done: boolean }> {
    const stream = await this.client.chat.send({
      chatRequest: {
        model: options.model || this.defaultModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 4096,
        stream: true
      }
    }) as any;

    let response = "";
    
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      
      if (content) {
        response += content;
        yield { content, done: false };
      }

      // Usage information comes in the final chunk
      if (chunk.usage) {
        const usage: OpenRouterUsage = {
          promptTokens: chunk.usage.promptTokens,
          completionTokens: chunk.usage.completionTokens,
          totalTokens: chunk.usage.totalTokens,
          reasoningTokens: chunk.usage.completionTokensDetails?.reasoningTokens
        };
        yield { content: undefined, usage, done: true };
      }
    }
  }

  /**
   * Simple streaming method that yields just strings (for compatibility).
   */
  async *simpleStream(
    messages: OpenRouterMessage[],
    options: OpenRouterOptions = {}
  ): AsyncGenerator<string> {
    for await (const chunk of this.chatStream(messages, options)) {
      if (chunk.content) {
        yield chunk.content;
      }
    }
  }

  /**
   * Check if OpenRouter is available by making a test request.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.chat(
        [{ role: "user", content: "Hello" }],
        { maxTokens: 1 }
      );
      return !!response.content;
    } catch {
      return false;
    }
  }
}

/**
 * Create an OpenRouter handler from environment variables.
 * Returns null if OPENROUTER_API_KEY is not set.
 */
export function createOpenRouterFromEnv(): OpenRouterHandler | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return null;
  }

  const baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  return new OpenRouterHandler(apiKey, { baseURL });
}
