// ─── M.A.I. Piper TTS Adapter ────────────────────────────────────────────────
// Local neural TTS via Piper (https://github.com/rhasspy/piper)
// Generates WAV audio locally — no network required, low latency.
//
// Requirements:
//   - Piper binary installed: `piper` (or `piper.exe` on Windows)
//   - At least one voice model downloaded (e.g., en_US-lessac-medium.onnx)
//   - Environment vars:
//       PIPER_BIN    — path to piper binary (default: "piper")
//       PIPER_MODEL  — path to .onnx model file
//       PIPER_CONFIG — path to .onnx.json config (default: same dir as model)
//       PIPER_DATA   — path to espeak-ng data dir (default: auto-detected)
//
// Usage in .env:
//   TTS_ENGINE=piper
//   PIPER_BIN=/usr/local/bin/piper
//   PIPER_MODEL=/home/user/.local/share/piper-voices/en-us-lessac-medium.onnx
//   PIPER_CONFIG=/home/user/.local/share/piper-voices/en-us-lessac-medium.onnx.json

import { TextToSpeechAdapter } from "./AudioAdapter";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import os from "node:os";

const execFileAsync = promisify(execFile);

export interface PiperConfig {
  /** Path to piper binary */
  bin?: string;
  /** Path to .onnx voice model */
  model: string;
  /** Path to .onnx.json config (optional — auto-detected from model path) */
  config?: string;
  /** Path to espeak-ng data directory */
  dataDir?: string;
  /** Speaker ID for multi-speaker models (optional) */
  speakerId?: number;
  /** Noise scale (0.0–1.0, default: 0.667) */
  noiseScale?: number;
  /** Length scale (0.0–2.0, default: 1.0 — higher = slower) */
  lengthScale?: number;
}

export class PiperTtsAdapter implements TextToSpeechAdapter {
  readonly name = "piper";
  private bin: string;
  private model: string;
  private config: string;
  private dataDir: string;
  private speakerId?: number;
  private noiseScale: number;
  private lengthScale: number;
  private ready = false;
  private initializing = false;

  constructor(config: PiperConfig) {
    this.bin = config.bin || process.env.PIPER_BIN || "piper";
    this.model = config.model || process.env.PIPER_MODEL || "";

    // Auto-detect config from model path: model.onnx → model.onnx.json
    if (config.config) {
      this.config = config.config;
    } else if (process.env.PIPER_CONFIG) {
      this.config = process.env.PIPER_CONFIG;
    } else if (this.model) {
      this.config = this.model + ".json";
    } else {
      this.config = "";
    }

    this.dataDir = config.dataDir || process.env.PIPER_DATA || "";
    this.speakerId = config.speakerId;
    this.noiseScale = config.noiseScale ?? 0.667;
    this.lengthScale = config.lengthScale ?? 1.0;

    // Verify model exists
    if (!this.model || !existsSync(this.model)) {
      console.warn(`[Piper] Model file not found: ${this.model}`);
      console.warn(`[Piper] Set PIPER_MODEL env var to your .onnx model path.`);
    } else {
      this.ready = true;
    }
  }

  /**
   * Check if Piper is available and ready.
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Initialize — validate binary and model availability.
   * Call this after construction to get a meaningful status.
   */
  async initialize(): Promise<{ ready: boolean; error?: string }> {
    if (this.initializing) return { ready: false, error: "Already initializing" };
    this.initializing = true;

    try {
      // Check piper binary exists
      await this.execPiper(["--help"], 5000);
      this.ready = true;
      return { ready: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.ready = false;
      return { ready: false, error: `Piper binary not available: ${msg}` };
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Synthesize text to WAV audio buffer.
   * Piper outputs a complete WAV file to stdout (with RIFF header).
   * Returns a Node.js Buffer containing the WAV data.
   */
  async synthesize(text: string, options?: { speakerId?: number; noiseScale?: number; lengthScale?: number }): Promise<Buffer> {
    if (!this.ready) {
      throw new Error("Piper TTS not ready — model or binary missing");
    }

    // Clean text for Piper (remove markdown, special chars)
    const cleanText = this.cleanText(text);

    if (!cleanText.trim()) {
      throw new Error("No text to synthesize");
    }

    const args: string[] = [
      "--model", this.model,
      "--config", this.config,
    ];

    if (this.dataDir) {
      args.push("--data-dir", this.dataDir);
    }

    const speaker = options?.speakerId ?? this.speakerId;
    if (speaker !== undefined) {
      args.push("--speaker", String(speaker));
    }

    const noiseScale = options?.noiseScale ?? this.noiseScale;
    args.push("--noise-scale", String(noiseScale));

    const lengthScale = options?.lengthScale ?? this.lengthScale;
    args.push("--length-scale", String(lengthScale));

    const result = await this.execPiper(args, 30000, cleanText);

    if (!result.stdout || result.stdout.length === 0) {
      throw new Error("Piper produced no audio output");
    }

    return result.stdout;
  }

  /**
   * Synthesize and return a base64-encoded WAV string for WebSocket transport.
   */
  async synthesizeToBase64(text: string, options?: { speakerId?: number; noiseScale?: number; lengthScale?: number }): Promise<string> {
    const buffer = await this.synthesize(text, options);
    return buffer.toString("base64");
  }

  /**
   * Get information about the configured Piper setup.
   */
  getInfo(): {
    name: string;
    ready: boolean;
    model: string;
    bin: string;
    speakerId?: number;
    supportedVoices: string[];
  } {
    // List available voice models in the model directory
    const voices: string[] = [];
    const modelDir = this.model ? dirname(this.model) : "";
    if (modelDir && existsSync(modelDir)) {
      try {
        const fs = require("node:fs");
        const files = fs.readdirSync(modelDir);
        for (const file of files) {
          if (file.endsWith(".onnx") && !file.endsWith(".onnx.json")) {
            voices.push(file.replace(/\.onnx$/, ""));
          }
        }
      } catch { /* skip */ }
    }

    return {
      name: "Piper TTS",
      ready: this.ready,
      model: this.model ? this.model.split("/").pop() || this.model : "none",
      bin: this.bin,
      speakerId: this.speakerId,
      supportedVoices: voices,
    };
  }

  /**
   * Clean text for Piper synthesis.
   * Piper handles plain text best — strip all formatting.
   */
  private cleanText(text: string): string {
    return text
      // Remove markdown formatting
      .replace(/#{1,6}\s+/g, "")
      .replace(/\*{1,3}(.*?)\*{1,3}/g, "$1")
      .replace(/~~(.*?)~~/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "• ")
      .replace(/^\s*\d+\.\s+/gm, "")
      .replace(/^---+$/gm, "")
      .replace(/^\s*>\s+/gm, "")
      // Pronunciation fixes
      .replace(/M\.A\.I\./g, "Mai")
      .replace(/M\.A\.I/g, "Mai")
      // Clean up whitespace
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, ", ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  /**
   * Execute Piper binary with arguments, piping text via stdin.
   */
  private execPiper(
    args: string[],
    timeout: number,
    stdinText?: string
  ): Promise<{ stdout: Buffer; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = execFile(
        this.bin,
        args,
        {
          maxBuffer: 10 * 1024 * 1024, // 10MB — WAV can be large
          timeout,
          encoding: "buffer",        // raw bytes for WAV audio
          env: {
            ...process.env,
            ...(this.dataDir ? { ESPEAK_DATA_DIR: this.dataDir } : {}),
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Piper exec error: ${error.message}`));
            return;
          }
          resolve({
            stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as unknown as ArrayBuffer),
            stderr: (stderr as Buffer).toString("utf-8").trim(),
          });
        }
      );

      // Pipe text to Piper's stdin
      if (stdinText && proc.stdin) {
        proc.stdin.write(stdinText);
        proc.stdin.end();
      }
    });
  }
}
