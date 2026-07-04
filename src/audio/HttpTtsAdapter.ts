import fetch from "node-fetch";
import { TextToSpeechAdapter } from "./AudioAdapter";

export class HttpTtsAdapter implements TextToSpeechAdapter {
  constructor(private endpoint: string, private apiKey?: string) {}

  async synthesize(text: string, options?: { voice?: string; rate?: number }): Promise<Buffer> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({ text, voice: options?.voice, rate: options?.rate })
    }) as any;

    if (!response.ok) {
      throw new Error(`TTS endpoint returned ${response.status}: ${await response.text()}`);
    }

    const audioBuffer = await response.arrayBuffer();
    return Buffer.from(audioBuffer);
  }
}
