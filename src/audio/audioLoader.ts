import { HarnessConfig } from "../config";
import { HttpTtsAdapter } from "./HttpTtsAdapter";
import { PiperTtsAdapter } from "./PiperTtsAdapter";
import { WhisperSttAdapter } from "./WhisperSttAdapter";

export interface AudioAdapters {
  stt?: import("./AudioAdapter").SpeechToTextAdapter;
  tts?: import("./AudioAdapter").TextToSpeechAdapter;
}

export function loadAudioAdapters(config: HarnessConfig): AudioAdapters {
  const adapters: AudioAdapters = {};

  if (config.audio?.stt?.enabled) {
    switch (config.audio.stt.backend) {
      case "whisper":
        adapters.stt = new WhisperSttAdapter(config.audio.stt.modelPath);
        break;
      default:
        throw new Error(`Unsupported STT backend: ${config.audio.stt.backend}`);
    }
  }

  if (config.audio?.tts?.enabled) {
    switch (config.audio.tts.backend) {
      case "http":
        if (!config.audio.tts.endpoint) {
          throw new Error("TTS HTTP endpoint is required when audio.tts.backend is 'http'.");
        }
        adapters.tts = new HttpTtsAdapter(config.audio.tts.endpoint, config.audio.tts.apiKey);
        break;
      case "piper":
        adapters.tts = new PiperTtsAdapter({
          model: config.audio.tts.endpoint || process.env.PIPER_MODEL || "",
          bin: process.env.PIPER_BIN || undefined,
          config: process.env.PIPER_CONFIG || undefined,
          dataDir: process.env.PIPER_DATA || undefined,
          speakerId: (config.audio.tts as any).speakerId,
          noiseScale: (config.audio.tts as any).noiseScale,
          lengthScale: (config.audio.tts as any).lengthScale,
        }) as any;
        break;
      default:
        throw new Error(`Unsupported TTS backend: ${config.audio.tts.backend}`);
    }
  }

  return adapters;
}
