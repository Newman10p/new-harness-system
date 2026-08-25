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
        try {
          adapters.stt = new WhisperSttAdapter(config.audio.stt.modelPath);
          console.log("[Audio] STT backend: whisper");
        } catch (err) {
          console.warn("[Audio] Whisper STT adapter failed to load:", err instanceof Error ? err.message : err);
        }
        break;
      case "moonshine":
        try {
          adapters.stt = new MoonshineSttAdapter({
            modelDir: config.audio.stt.modelDir,
            model: config.audio.stt.modelPath,
            language: config.audio.stt.language,
            sampleRate: config.audio.stt.sampleRate,
            maxDuration: config.audio.stt.maxDuration,
          });
          console.log("[Audio] STT backend: moonshine");
        } catch (err) {
          console.warn("[Audio] Moonshine STT adapter failed to load:", err instanceof Error ? err.message : err);
        }
        break;
      default:
        console.warn(`[Audio] Unsupported STT backend: ${config.audio.stt.backend} — STT disabled`);
    }
  }

  if (config.audio?.tts?.enabled) {
    switch (config.audio.tts.backend) {
      case "http":
        if (!config.audio.tts.endpoint) {
          console.warn("[Audio] TTS HTTP endpoint not configured — TTS disabled");
          break;
        }
        adapters.tts = new HttpTtsAdapter(config.audio.tts.endpoint, config.audio.tts.apiKey);
        console.log("[Audio] TTS backend: http");
        break;
      case "piper":
        try {
          adapters.tts = new PiperTtsAdapter({
            model: config.audio.tts.endpoint || process.env.PIPER_MODEL || "",
            bin: process.env.PIPER_BIN || undefined,
            config: process.env.PIPER_CONFIG || undefined,
            dataDir: process.env.PIPER_DATA || undefined,
            speakerId: config.audio.tts.speakerId,
            noiseScale: config.audio.tts.noiseScale,
          });
          console.log("[Audio] TTS backend: piper");
        } catch (err) {
          console.warn("[Audio] Piper TTS adapter failed to load:", err instanceof Error ? err.message : err);
        }
        break;
      case "kokoro":
        try {
          adapters.tts = new KokoroTtsAdapter({
            model: config.audio.tts.modelPath || process.env.KOKORO_MODEL || "",
            bin: config.audio.tts.binPath || process.env.KOKORO_BIN,
            config: config.audio.tts.configPath,
            voice: config.audio.tts.voice,
            speakerId: config.audio.tts.speakerId,
            speed: config.audio.tts.speed,
            noiseScale: config.audio.tts.noiseScale,
          });
          console.log("[Audio] TTS backend: kokoro");
        } catch (err) {
          console.warn("[Audio] Kokoro TTS adapter failed to load:", err instanceof Error ? err.message : err);
        }
        break;
      default:
        console.warn(`[Audio] Unsupported TTS backend: ${config.audio.tts.backend} — TTS disabled`);
    }
  }

  return adapters;
}
