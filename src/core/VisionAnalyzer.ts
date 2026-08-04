// ─── M.A.I. VisionAnalyzer ─────────────────────────────────────────────────
// Sends images to a Vision Language Model (VLM) for analysis.
// Uses the OpenAI SDK's chat completions with image_url content blocks.
// Configurable via env vars — falls back to primary LLM provider.

import OpenAI from "openai";

const DEFAULT_PROMPT =
  "Describe what you see in this screenshot. Be specific about UI elements, text, and any notable state.";

export interface VisionConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export class VisionAnalyzer {
  private client: OpenAI;
  private model: string;

  constructor(config?: Partial<VisionConfig>) {
    // Priority: explicit config → VISION_* env vars → LLM_* env vars
    const baseURL =
      config?.baseURL ??
      process.env.VISION_BASE_URL ??
      process.env.LLM_BASE_URL ??
      "";
    const apiKey =
      config?.apiKey ??
      process.env.VISION_API_KEY ??
      process.env.LLM_API_KEY ??
      "";
    const model =
      config?.model ??
      process.env.VISION_MODEL ??
      "gpt-4o-mini";

    if (!baseURL || !apiKey) {
      throw new Error(
        "VisionAnalyzer: no API credentials configured. " +
          "Set VISION_BASE_URL/VISION_API_KEY or LLM_BASE_URL/LLM_API_KEY."
      );
    }

    this.client = new OpenAI({ baseURL, apiKey });
    this.model = model;
  }

  /**
   * Analyze a base64-encoded image with an optional text prompt.
   * Returns { ok, description } on success, { ok, error } on failure.
   */
  async analyze(
    imageBase64: string,
    prompt?: string
  ): Promise<{
    ok: boolean;
    description?: string;
    error?: string;
  }> {
    const userPrompt = prompt ?? DEFAULT_PROMPT;

    // Strip data-url prefix if present (e.g. "data:image/png;base64,...")
    let base64Data = imageBase64;
    if (base64Data.includes(",")) {
      base64Data = base64Data.split(",")[1];
    }

    // Detect MIME type from file header or default to png
    const mime = detectMimeType(base64Data);
    const dataUrl = `data:${mime};base64,${base64Data}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
            ] as OpenAI.ChatCompletionContentPart[],
          },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      });

      const content = (response as {
        choices?: Array<{ message?: { content?: string } }>;
      }).choices?.[0]?.message?.content;

      if (!content) {
        return {
          ok: false,
          error: "Vision model returned empty response.",
        };
      }

      return { ok: true, description: content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `Vision analysis failed: ${message}`,
      };
    }
  }
}

/**
 * Heuristic MIME detection from base64-decoded header bytes.
 * Falls back to "image/png".
 */
function detectMimeType(base64: string): string {
  try {
    // Decode just enough bytes to check the magic number (8 bytes)
    const binary = atob(base64.slice(0, 16));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    // PNG: 89 50 4E 47
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "image/png";
    }
    // GIF: 47 49 46
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return "image/gif";
    }
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
  } catch {
    // If base64 decode fails, just use default
  }
  return "image/png";
}
