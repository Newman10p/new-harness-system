import { HarnessConfig, AudioMode } from "../config";
import { SpeechToTextAdapter, TextToSpeechAdapter } from "./AudioAdapter";
import { WhisperSttAdapter } from "./WhisperSttAdapter";
import { MoonshineSttAdapter } from "./MoonshineSttAdapter";
import { HttpTtsAdapter } from "./HttpTtsAdapter";
import { KokoroTtsAdapter } from "./KokoroTtsAdapter";

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

    // STT — supports whisper, moonshine, and custom HTTP backends
    if (audioConfig?.stt?.enabled) {
      const sttBackend = audioConfig.stt.backend || "whisper";
      if (sttBackend === "whisper") {
        result.stt = new WhisperSttAdapter(audioConfig.stt.modelPath);
      } else if (sttBackend === "moonshine") {
        // Moonshine: 5x faster than Whisper, optimized for real-time voice
        result.stt = new MoonshineSttAdapter({
          modelDir: audioConfig.stt.modelDir,
          model: audioConfig.stt.modelPath,
          language: audioConfig.stt.language,
          sampleRate: audioConfig.stt.sampleRate,
          maxDuration: audioConfig.stt.maxDuration,
        });
      } else if (mode === "custom" && audioConfig.custom?.sttEndpoint) {
        // Custom STT via HTTP
        result.stt = new CustomSttAdapter(audioConfig.custom.sttEndpoint);
      }
    }

    // TTS — supports http, piper, kokoro, and custom HTTP backends
    if (audioConfig?.tts?.enabled) {
      const ttsBackend = audioConfig.tts.backend || "http";
      if (ttsBackend === "http") {
        result.tts = new HttpTtsAdapter(
          audioConfig.tts.endpoint ?? "http://localhost:5002/api/tts",
          audioConfig.tts.apiKey
        );
      } else if (ttsBackend === "kokoro") {
        // Kokoro: 82M params, Apache 2.0, higher naturalness than Piper
        result.tts = new KokoroTtsAdapter({
          model: audioConfig.tts.modelPath || process.env.KOKORO_MODEL || "",
          bin: audioConfig.tts.binPath || process.env.KOKORO_BIN,
          config: audioConfig.tts.configPath,
          voice: audioConfig.tts.voice,
          speakerId: audioConfig.tts.speakerId,
          speed: audioConfig.tts.speed,
          noiseScale: audioConfig.tts.noiseScale,
        });
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