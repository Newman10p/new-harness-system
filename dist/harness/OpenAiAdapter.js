"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiAdapter = void 0;
class OpenAiAdapter {
    name = "openai";
    apiKey;
    model;
    baseUrl;
    maxRetries;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
        this.maxRetries = config.maxRetries ?? 2;
    }
    async generate(options) {
        const url = new URL("/chat/completions", this.baseUrl).toString();
        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify({
                        model: this.model,
                        max_tokens: options.maxTokens ?? 512,
                        temperature: options.temperature ?? 0.7,
                        messages: [{ role: "user", content: options.prompt }],
                        ...(options.stop ? { stop: options.stop } : {})
                    })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    // Retry on 429 (rate limit) or 5xx (server error)
                    if (response.status === 429 || response.status >= 500) {
                        lastError = new Error(`OpenAI error ${response.status}: ${errorText}`);
                        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                        continue;
                    }
                    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
                }
                const data = (await response.json());
                const text = data?.choices?.[0]?.message?.content ??
                    data?.choices?.[0]?.text ??
                    "";
                return {
                    text: String(text).trim(),
                    metadata: { raw: data, model: this.model, provider: "openai" }
                };
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt < this.maxRetries) {
                    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }
        throw lastError ?? new Error("OpenAI generation failed after retries");
    }
}
exports.OpenAiAdapter = OpenAiAdapter;
//# sourceMappingURL=OpenAiAdapter.js.map