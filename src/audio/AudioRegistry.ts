import { HarnessConfig, AudioMode } from "../config";
import { SpeechToTextAdapter, TextToSpeechAdapter } from "./AudioAdapter";
import { WhisperSttAdapter } from "./WhisperSttAdapter";
import { HttpTtsAdapter } from "./HttpTtsAdapter";

export interface AudioAdapterSet {
  stt?: SpeechToTextAdapter;
  tts?: TextToSpeechAdapter;
  mode: AudioMode;
}

/**
 * AudioRegistry loads STT/TTS adapters based on config.
 */
export class AudioRegistry {
  private adapters: AudioAdapterSet;

  constructor(config: HarnessConfig) {
    this.adapters = this.loadFromConfig(config);
  }

  private loadFromConfig(config: HarnessConfig): AudioAdapterSet {
    const audioConfig = config.audio;
    const mode = audioConfig?.mode ?? "disabled";
    const result: AudioAdapterSet = { mode };

    if (mode === "disabled") return result;

    // STT
    if (audioConfig?.stt?.enabled) {
      if (audioConfig.stt.backend === "whisper") {
        result.stt = new WhisperSttAdapter(audioConfig.stt.modelPath);
      } else if (mode === "custom" && audioConfig.custom?.sttEndpoint) {
        // Custom STT via HTTP
        result.stt = new CustomSttAdapter(audioConfig.custom.sttEndpoint);
      }
    }

    // TTS
    if (audioConfig?.tts?.enabled) {
      if (audioConfig.tts.backend === "http") {
        result.tts = new HttpTtsAdapter(
          audioConfig.tts.endpoint ?? "http://localhost:5002/api/tts",
          audioConfig.tts.apiKey
        );
      } else if (mode === "custom" && audioConfig.custom?.ttsEndpoint) {
        result.tts = new CustomTtsAdapter(audioConfig.custom.ttsEndpoint);
      }
    }

    return result;
  }

  getStt(): SpeechToTextAdapter | undefined {
    return this.adapters.stt;
  }

  getTts(): TextToSpeechAdapter | undefined {
    return this.adapters.tts;
  }

  getMode(): AudioMode {
    return this.adapters.mode;
  }

  isVoiceEnabled(): boolean {
    return this.adapters.mode !== "disabled" && !!(this.adapters.stt || this.adapters.tts);
  }

  getStatus(): { mode: AudioMode; stt: boolean; tts: boolean } {
    return {
      mode: this.adapters.mode,
      stt: !!this.adapters.stt,
      tts: !!this.adapters.tts
    };
  }
}

/**
 * Simple custom STT adapter that posts audio to an HTTP endpoint.
 */
class CustomSttAdapter implements SpeechToTextAdapter {
  constructor(private endpoint: string) {}

  async transcribe(input: { filePath?: string; buffer?: Buffer }): Promise<string> {
    if (input.buffer) {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: input.buffer
      });
      if (!response.ok) throw new Error(`Custom STT error ${response.status}`);
      const data = await response.json();
      return (data as any)?.text ?? String(data);
    }
    if (input.filePath) {
      const fs = await import("node:fs");
      const buffer = fs.readFileSync(input.filePath);
      return this.transcribe({ buffer });
    }
    throw new Error("Custom STT requires filePath or buffer");
  }
}

/**
 * Simple custom TTS adapter that sends text to an HTTP endpoint.
 */
class CustomTtsAdapter implements TextToSpeechAdapter {
  constructor(private endpoint: string) {}

  async synthesize(text: string, options?: { voice?: string; rate?: number }): Promise<Buffer> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: options?.voice, rate: options?.rate })
    });
    if (!response.ok) throw new Error(`Custom TTS error ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

export { CustomSttAdapter, CustomTtsAdapter };