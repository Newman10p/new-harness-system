import { HarnessConfig } from "../config";
import { HttpTtsAdapter } from "./HttpTtsAdapter";
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
      default:
        throw new Error(`Unsupported TTS backend: ${config.audio.tts.backend}`);
    }
  }

  return adapters;
}
