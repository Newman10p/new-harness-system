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
//
// Performance optimizations:
//   - Pre-warms model at init (dummy synthesis to cache ONNX in memory)
//   - Uses --sentence-silence 0.15 for faster sentence transitions
//   - Uses --length-scale 0.92 for slightly faster speech
//   - Detects stdout WAV mode to avoid temp file I/O
//   - Uses spawn for streaming output

import { TextToSpeechAdapter } from "./AudioAdapter";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import os from "node:os";
import { getLogger } from "../core/MaiLogger.js";

const log = getLogger("PiperTTS");

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
  /** Length scale (0.0–2.0, default: 0.92 for faster speech) */
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
  private prewarmed = false;
  /** Cached detection: does this piper version output WAV to stdout? */
  private stdoutWavMode = false;

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
    // Default to 0.92 for ~8% faster speech (still natural)
    this.lengthScale = config.lengthScale ?? 0.92;

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
   * Initialize — validate binary and model, detect output mode, pre-warm.
   */
  async initialize(): Promise<{ ready: boolean; error?: string }> {
    if (this.initializing) return { ready: false, error: "Already initializing" };
    this.initializing = true;

    try {
      // Check piper binary exists
      await this.spawnPiper(["--help"], 5000);
      this.ready = true;

      // Pre-warm: do a tiny synthesis to load the ONNX model into OS cache
      if (!this.prewarmed) {
        this.prewarmed = true;
        log.info("Pre-warming Piper model (loading ONNX into cache)..." );
        try {
          const warmStart = Date.now();
          await this.synthesize("hello");
          log.info("Piper model pre-warmed", { data: { warmupMs: Date.now() - warmStart } });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn("Pre-warm failed (non-fatal)", { error: msg });
        }
      }

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
   * Uses spawn for streaming, detects stdout WAV mode to avoid temp file I/O.
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

    // Reduced sentence silence for faster transitions (default is 0.4)
    args.push("--sentence-silence", "0.15");

    const result = await this.spawnPiper(args, 30_000, cleanText);

    if (!result.stdout || result.stdout.length === 0) {
      log.error("Piper produced no output", { data: { stderr: result.stderr, textLength: cleanText.length } });
      throw new Error("Piper produced no output");
    }

    // If stdout is binary WAV data (RIFF header), use it directly — no temp file I/O
    if (result.stdout.length >= 12 && result.stdout.toString("ascii", 0, 4) === "RIFF") {
      this.stdoutWavMode = true;
      log.debug("Piper stdout WAV mode", { data: { wavBytes: result.stdout.length } });
      return result.stdout;
    }

    // Otherwise treat stdout as a file path (legacy mode)
    const stdoutText = result.stdout.toString("utf-8").trim();
    const wavPath = stdoutText;

    log.debug("Piper file-path mode", { data: { wavPath, stdoutLength: result.stdout.length } });
    if (!existsSync(wavPath)) {
      log.error("Piper output file not found", { data: { wavPath, stdoutText: stdoutText.slice(0, 200) } });
      throw new Error(`Piper output file not found: ${wavPath}`);
    }

    let wavData: Buffer;
    try {
      wavData = readFileSync(wavPath);
    } catch (err) {
      throw new Error(`Failed to read Piper output file: ${wavPath}`);
    } finally {
      // Clean up the temp file
      try { unlinkSync(wavPath); } catch { /* ignore cleanup failure */ }
    }

    if (wavData.length < 12 || wavData.toString("ascii", 0, 4) !== "RIFF") {
      log.error("Piper output is not valid WAV", { data: { wavPath, size: wavData.length, header: wavData.slice(0, 12).toString('hex') } });
      throw new Error(`Piper output file is not valid WAV: ${wavPath}`);
    }

    log.debug("Piper synthesis OK", { data: { wavBytes: wavData.length, textChars: cleanText.length, mode: "file-path" } });

    return wavData;
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
    stdoutWavMode: boolean;
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
      stdoutWavMode: this.stdoutWavMode,
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
   * Spawn Piper binary with arguments, piping text via stdin.
   * Uses spawn instead of execFile for streaming output and better control.
   */
  private spawnPiper(
    args: string[],
    timeout: number,
    stdinText?: string
  ): Promise<{ stdout: Buffer; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.bin, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ...(this.dataDir ? { ESPEAK_DATA_DIR: this.dataDir } : {}),
        },
      });

      const stdoutChunks: Buffer[] = [];
      let stderr = "";
      let totalBytes = 0;
      const maxBytes = 10 * 1024 * 1024; // 10MB

      proc.stdout?.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes <= maxBytes) {
          stdoutChunks.push(chunk);
        }
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });

      // Timeout
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(`Piper timed out after ${timeout}ms`));
      }, timeout);

      proc.on("close", (code) => {
        clearTimeout(timer);
        const stdout = Buffer.concat(stdoutChunks);
        if (code !== 0 && stdout.length === 0) {
          reject(new Error(`Piper exited with code ${code}: ${stderr.trim() || "unknown error"}`));
          return;
        }
        resolve({ stdout, stderr: stderr.trim() });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Piper spawn error: ${err.message}`));
      });

      // Pipe text to Piper's stdin
      if (stdinText && proc.stdin) {
        proc.stdin.write(stdinText);
        proc.stdin.end();
      }
    });
  }
}
