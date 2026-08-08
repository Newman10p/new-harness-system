import { HarnessConfig } from "../config";
import { HttpTtsAdapter } from "./HttpTtsAdapter";
import { PiperTtsAdapter } from "./PiperTtsAdapter";
import { KokoroTtsAdapter } from "./KokoroTtsAdapter";
import { WhisperSttAdapter } from "./WhisperSttAdapter";
import { MoonshineSttAdapter } from "./MoonshineSttAdapter";

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
      case "moonshine":
        adapters.stt = new MoonshineSttAdapter({
          modelDir: config.audio.stt.modelDir,
          model: config.audio.stt.modelPath,
          language: config.audio.stt.language,
          sampleRate: config.audio.stt.sampleRate,
          maxDuration: config.audio.stt.maxDuration,
        });
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
          speakerId: config.audio.tts.speakerId,
          noiseScale: config.audio.tts.noiseScale,
          lengthScale: (config.audio.tts as any).lengthScale,
        }) as any;
        break;
      case "kokoro":
        adapters.tts = new KokoroTtsAdapter({
          model: config.audio.tts.modelPath || process.env.KOKORO_MODEL || "",
          bin: config.audio.tts.binPath || process.env.KOKORO_BIN,
          config: config.audio.tts.configPath,
          voice: config.audio.tts.voice,
          speakerId: config.audio.tts.speakerId,
          speed: config.audio.tts.speed,
          noiseScale: config.audio.tts.noiseScale,
        });
        break;
      default:
        throw new Error(`Unsupported TTS backend: ${config.audio.tts.backend}`);
    }
  }

  return adapters;
}
