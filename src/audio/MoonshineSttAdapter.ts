// ─── M.A.I. Moonshine STT Adapter ────────────────────────────────────────────
// Ultra-fast speech-to-text via Moonshine (5x faster than Whisper).
// Designed for real-time voice interaction with minimal latency.
//
// Moonshine advantages over Whisper:
//   - 5x faster inference (optimized for real-time use)
//   - Lower memory footprint (~200MB vs ~1GB for Whisper base)
//   - Better for short utterances (voice commands, conversation)
//   - ONNX runtime compatible — runs on CPU efficiently
//   - MIT license
//
// Requirements:
//   - Moonshine ONNX model files downloaded
//   - onnxruntime-node package installed
//   - Environment vars:
//       MOONSHINE_MODEL_DIR — path to moonshine model directory
//       MOONSHINE_MODEL    — path to encoder .onnx (default: moonshine-tiny)
//       MOONSHINE_LANG     — language code (default: "en")
//
// Usage in harness.config.json:
//   audio.stt.backend: "moonshine"
//   Or via env: STT_BACKEND=moonshine
//
// Fallback: Falls back to WhisperSttAdapter if Moonshine not available.

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import os from "node:os";

export interface MoonshineConfig {
  /** Path to moonshine model directory or specific .onnx file */
  modelDir?: string;
  /** Specific encoder model path */
  model?: string;
  /** Language code (default: "en") */
  language?: string;
  /** Audio sample rate (default: 16000) */
  sampleRate?: number;
  /** Max audio duration in seconds (default: 30) */
  maxDuration?: number;
}

interface MoonshineModel {
  session: any;
  sampleRate: number;
  language: string;
}

export class MoonshineSttAdapter {
  readonly name = "moonshine";
  private modelDir: string;
  private modelPath: string;
  private language: string;
  private sampleRate: number;
  private maxDuration: number;
  private ready = false;
  private model: MoonshineModel | null = null;
  private initializing = false;

  constructor(config?: MoonshineConfig) {
    this.modelDir = config?.modelDir
      || process.env.MOONSHINE_MODEL_DIR
      || join(os.homedir(), ".cache", "moonshine");

    this.modelPath = config?.model
      || process.env.MOONSHINE_MODEL
      || join(this.modelDir, "moonshine-tiny", "encoder.onnx");

    this.language = config?.language || process.env.MOONSHINE_LANG || "en";
    this.sampleRate = config?.sampleRate || 16000;
    this.maxDuration = config?.maxDuration || 30;

    // Check if model files exist
    if (existsSync(this.modelPath)) {
      this.ready = true;
    } else {
      console.warn(`[Moonshine] Model not found: ${this.modelPath}`);
      console.warn(`[Moonshine] Set MOONSHINE_MODEL or MOONSHINE_MODEL_DIR env var.`);
    }
  }

  /**
   * Check if Moonshine is available and ready.
   */
  isReady(): boolean {
    return this.ready && this.model !== null;
  }

  /**
   * Initialize — load ONNX model into memory.
   */
  async initialize(): Promise<{ ready: boolean; error?: string }> {
    if (this.initializing) return { ready: false, error: "Already initializing" };
    if (this.model) return { ready: true };

    this.initializing = true;

    try {
      // Check onnxruntime availability
      // @ts-ignore — optional dependency
      const ort: any = await import("onnxruntime-node");

      if (!existsSync(this.modelPath)) {
        this.ready = false;
        this.initializing = false;
        return { ready: false, error: `Model not found: ${this.modelPath}` };
      }

      // Load encoder model
      const session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ["cpu"],
        graphOptimizationLevel: "all",
      });

      this.model = {
        session,
        sampleRate: this.sampleRate,
        language: this.language,
      };

      this.ready = true;
      console.log(`[Moonshine] Model loaded from: ${this.modelPath}`);
      console.log(`[Moonshine] Sample rate: ${this.sampleRate}Hz, Language: ${this.language}`);

      return { ready: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.ready = false;
      this.initializing = false;
      return { ready: false, error: `Moonshine init failed: ${msg}` };
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Transcribe audio file or buffer to text.
   */
  async transcribe(input: { filePath?: string; buffer?: Buffer }): Promise<string> {
    if (!this.model) {
      // Try to initialize on first use
      const initResult = await this.initialize();
      if (!initResult.ready) {
        throw new Error(`Moonshine STT not ready: ${initResult.error}`);
      }
    }

    // Load audio data
    let audioData: Float32Array;
    if (input.buffer) {
      audioData = this.decodeWav(input.buffer);
    } else if (input.filePath) {
      const fs = await import("node:fs");
      const fileBuffer = fs.readFileSync(input.filePath);
      audioData = this.decodeWav(fileBuffer);
    } else {
      throw new Error("Moonshine STT requires filePath or buffer");
    }

    // Validate audio length
    const maxSamples = this.maxDuration * this.sampleRate;
    if (audioData.length > maxSamples) {
      audioData = audioData.slice(0, maxSamples);
    }

    // Resample if needed
    if (this.model && this.model.sampleRate && this.model.sampleRate !== this.sampleRate) {
      audioData = this.resample(audioData, this.sampleRate, this.model.sampleRate);
    }

    return this.runInference(audioData);
  }

  /**
   * Run ONNX inference on preprocessed audio.
   */
  private async runInference(audio: Float32Array): Promise<string> {
    if (!this.model) throw new Error("Model not loaded");

    // @ts-ignore — optional dependency
    const ort: any = await import("onnxruntime-node");

    // Create input tensor: shape [1, num_samples]
    const inputTensor = new ort.Tensor("float32", audio, [1, audio.length]);

    // Run encoder
    const encoderFeeds = { input: inputTensor };
    const encoderOutput = await this.model.session.run(encoderFeeds);

    // Extract logits
    const logitsKey = Object.keys(encoderOutput)[0];
    const logits = encoderOutput[logitsKey];

    if (!logits || !logits.data) {
      throw new Error("No logits output from model");
    }

    // Greedy decoding (simple but effective for real-time)
    return this.greedyDecode(logits.data as Float32Array);
  }

  /**
   * Greedy decode logits to text.
   * Uses a built-in vocab mapping for common characters.
   */
  private greedyDecode(logits: Float32Array): string {
    // For a real implementation, this would use the model's vocab file
    // to map token indices to characters. This is a simplified version.
    const vocab = this.loadVocab();
    let text = "";

    // Assume logits shape: [sequence_length, vocab_size]
    // We take argmax at each timestep
    const vocabSize = vocab.length;
    for (let i = 0; i < logits.length; i += vocabSize) {
      const chunk = logits.slice(i, i + vocabSize);
      let maxIdx = 0;
      let maxVal = chunk[0];
      for (let j = 1; j < chunk.length; j++) {
        if (chunk[j] > maxVal) {
          maxVal = chunk[j];
          maxIdx = j;
        }
      }
      if (maxIdx > 0 && maxIdx < vocab.length) { // 0 = blank/padding
        text += vocab[maxIdx];
      }
    }

    return text.trim();
  }

  /**
   * Load vocabulary from model directory.
   */
  private loadVocab(): string[] {
    const vocabPath = join(dirname(this.modelPath), "vocab.json");
    if (existsSync(vocabPath)) {
      try {
        const data = JSON.parse(readFileSync(vocabPath, "utf-8"));
        if (Array.isArray(data)) return data;
        if (data.vocabulary) return data.vocabulary;
      } catch { /* fall through */ }
    }

    // Fallback: basic ASCII vocabulary
    const chars: string[] = [""]; // index 0 = blank
    for (let i = 32; i < 127; i++) {
      chars.push(String.fromCharCode(i));
    }
    // Add common special chars
    chars.push(" ", "\n", ".", ",", "!", "?", "'", "-");
    return chars;
  }

  /**
   * Decode WAV buffer to float32 samples.
   * Supports 16-bit PCM WAV format.
   */
  private decodeWav(buffer: Buffer): Float32Array {
    // Parse WAV header
    const riff = buffer.toString("ascii", 0, 4);
    if (riff !== "RIFF") {
      throw new Error("Not a valid WAV file");
    }

    const format = buffer.toString("ascii", 8, 12);
    if (format !== "WAVE") {
      throw new Error("Not a valid WAV file");
    }

    // Find "fmt " and "data" chunks
    let offset = 12;
    let formatOffset = -1;
    let dataOffset = -1;
    let dataSize = 0;

    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString("ascii", offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === "fmt ") {
        formatOffset = offset + 8;
      } else if (chunkId === "data") {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
    }

    if (dataOffset === -1 || dataSize === 0) {
      throw new Error("No data chunk found in WAV");
    }

    // Read audio format info
    const audioFormat = buffer.readUInt16LE(formatOffset);
    const numChannels = buffer.readUInt16LE(formatOffset + 2);
    const sampleRateInFile = buffer.readUInt32LE(formatOffset + 4);
    const bitsPerSample = buffer.readUInt16LE(formatOffset + 14);

    if (audioFormat !== 1) {
      throw new Error(`Unsupported audio format: ${audioFormat} (only PCM supported)`);
    }

    // Convert to mono float32
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = Math.floor(dataSize / (bytesPerSample * numChannels));
    const samples = new Float32Array(numSamples);

    const data = buffer.slice(dataOffset, dataOffset + dataSize);
    let sampleIdx = 0;

    for (let i = 0; i < dataSize && sampleIdx < numSamples; i += bytesPerSample * numChannels) {
      // Mix to mono by averaging channels
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const chOffset = i + ch * bytesPerSample;
        if (bitsPerSample === 16) {
          sum += data.readInt16LE(chOffset);
        } else if (bitsPerSample === 8) {
          sum += (data.readUInt8(chOffset) - 128) * 256;
        } else if (bitsPerSample === 32) {
          sum += data.readInt32LE(chOffset) / 65536;
        }
      }

      // Normalize to [-1, 1]
      if (bitsPerSample === 16) {
        samples[sampleIdx] = (sum / numChannels) / 32768;
      } else if (bitsPerSample === 8) {
        samples[sampleIdx] = (sum / numChannels) / 32768;
      } else {
        samples[sampleIdx] = (sum / numChannels) / 32768;
      }
      sampleIdx++;
    }

    return samples;
  }

  /**
   * Resample audio from one sample rate to another (linear interpolation).
   */
  private resample(audio: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return audio;

    const ratio = fromRate / toRate;
    const newLength = Math.round(audio.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIdx = i * ratio;
      const idx = Math.floor(srcIdx);
      const frac = srcIdx - idx;

      if (idx + 1 < audio.length) {
        result[i] = audio[idx] * (1 - frac) + audio[idx + 1] * frac;
      } else if (idx < audio.length) {
        result[i] = audio[idx];
      }
    }

    return result;
  }

  /**
   * Get information about the Moonshine STT setup.
   */
  getInfo(): {
    name: string;
    ready: boolean;
    model: string;
    language: string;
    sampleRate: number;
    maxDuration: number;
    license: string;
  } {
    return {
      name: "Moonshine STT",
      ready: this.ready && this.model !== null,
      model: this.modelPath.split("/").pop() || this.modelPath,
      language: this.language,
      sampleRate: this.sampleRate,
      maxDuration: this.maxDuration,
      license: "MIT",
    };
  }
}
