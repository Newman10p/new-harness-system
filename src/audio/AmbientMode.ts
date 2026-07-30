// ─── M.A.I. Ambient Mode ─────────────────────────────────────────
// Always-listening mode with wake word detection, STT, and TTS.
//
// Flow: wake word → listen → process → speak → back to listening
// Integrates with HUD server to broadcast listening state.
//
// Note: This uses Node.js built-ins and the existing WhisperSttAdapter
// and HttpTtsAdapter. Actual microphone access requires platform-specific
// bindings (e.g., node-microphone), so this module provides the
// orchestration layer with a polling-based fallback.

import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────

export type AmbientState = "idle" | "listening" | "processing" | "speaking";

export interface AmbientModeConfig {
  wakeWord: string;
  noiseGateThreshold: number; // 0.0 - 1.0
  listenTimeoutMs: number;
  ttsEndpoint: string;
  ttsApiKey?: string;
  ttsVoice?: string;
  sttModelPath?: string;
  enabled: boolean;
}

interface AudioLevelSample {
  timestamp: number;
  level: number; // 0.0 - 1.0
}

// ─── Default Configuration ─────────────────────────────────────────────────

const DEFAULT_CONFIG: AmbientModeConfig = {
  wakeWord: "hey mai",
  noiseGateThreshold: 0.05,
  listenTimeoutMs: 10_000,
  ttsEndpoint: "",
  sttModelPath: undefined,
  enabled: false,
};

// ─── Ambient Mode ─────────────────────────────────────────────────────────

export class AmbientMode extends EventEmitter {
  private config: AmbientModeConfig;
  private state: AmbientState = "idle";
  private audioLevel: number = 0;
  private audioLevelHistory: AudioLevelSample[] = [];
  private listenTimer: ReturnType<typeof setTimeout> | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private micStream: any = null;
  private sttAdapter: any = null;
  private ttsAdapter: any = null;
  private hudEmitter: ((channel: string, payload: Record<string, unknown>) => void) | null = null;
  private running = false;
  private conversationMode = false;

  constructor(config?: Partial<AmbientModeConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Start ambient listening mode.
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log("[Ambient] Already running");
      return;
    }

    this.running = true;
    this.setState("idle");

    // Try to load STT adapter
    await this.loadSttAdapter();

    // Try to load TTS adapter
    this.loadTtsAdapter();

    // Start audio level polling
    this.startAudioPolling();

    // Try to open microphone (best effort)
    this.openMicrophone();

    console.log(`[Ambient] Started. Wake word: "${this.config.wakeWord}"`);
    console.log(`[Ambient] STT: ${this.sttAdapter ? "available" : "unavailable"}`);
    console.log(`[Ambient] TTS: ${this.ttsAdapter ? "available" : "unavailable"}`);
  }

  /**
   * Stop ambient listening mode.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.conversationMode = false;
    this.clearListenTimer();
    this.stopAudioPolling();
    this.closeMicrophone();
    this.setState("idle");
    console.log("[Ambient] Stopped");
  }

  /**
   * Change the wake word.
   */
  setWakeWord(word: string): void {
    this.config.wakeWord = word.toLowerCase().trim();
    console.log(`[Ambient] Wake word changed to: "${this.config.wakeWord}"`);
  }

  /**
   * Get the current ambient state.
   */
  isListening(): boolean {
    return this.state === "listening";
  }

  /**
   * Get the current audio level (0.0 - 1.0).
   */
  getAudioLevel(): number {
    return this.audioLevel;
  }

  /**
   * Get the current state.
   */
  getState(): AmbientState {
    return this.state;
  }

  /**
   * Wire a HUD emitter for broadcasting listening state.
   */
  setHudEmitter(emitter: (channel: string, payload: Record<string, unknown>) => void): void {
    this.hudEmitter = emitter;
  }

  /**
   * Set the TTS endpoint for spoken responses.
   */
  setTtsEndpoint(endpoint: string, apiKey?: string, voice?: string): void {
    this.config.ttsEndpoint = endpoint;
    this.config.ttsApiKey = apiKey;
    this.config.ttsVoice = voice;
    this.loadTtsAdapter();
  }

  // ─── State Management ───────────────────────────────────────────────────

  private setState(newState: AmbientState): void {
    const oldState = this.state;
    this.state = newState;

    if (oldState !== newState) {
      this.emit("state_change", { from: oldState, to: newState });
      console.log(`[Ambient] State: ${oldState} → ${newState}`);

      // Broadcast to HUD
      this.broadcastToHud({
        state: newState,
        audioLevel: this.audioLevel,
        wakeWord: this.config.wakeWord,
        conversationMode: this.conversationMode,
      });
    }
  }

  // ─── Wake Word Detection ─────────────────────────────────────────────────

  /**
   * Process a transcription and check for wake word.
   */
  private async processTranscription(text: string): Promise<void> {
    const normalized = text.toLowerCase().trim();
    const containsWakeWord = normalized.includes(this.config.wakeWord);

    if (containsWakeWord) {
      console.log(`[Ambient] Wake word detected! Transcription: "${text}"`);
      this.emit("wake_word_detected", { text, timestamp: Date.now() });
      await this.beginListening();
    }
  }

  // ─── Listening Flow ─────────────────────────────────────────────────────

  /**
   * Begin listening for a command after wake word detection.
   */
  private async beginListening(): Promise<void> {
    this.setState("listening");
    this.emit("listen_chime", { type: "start_listening" });

    // Set a timeout for listening
    this.clearListenTimer();
    this.listenTimer = setTimeout(() => {
      if (this.state === "listening") {
        console.log("[Ambient] Listen timeout");
        this.setState("idle");
        this.emit("listen_chime", { type: "timeout" });

        // If in conversation mode, go back to wake word listening
        if (this.conversationMode) {
          this.conversationMode = false;
        }
      }
    }, this.config.listenTimeoutMs);

    // In a real implementation, we'd capture audio here
    // and pass it to the STT adapter when the user stops speaking.
    // For now, we emit an event so the caller can handle it.
    this.emit("ready_for_command", {});
  }

  /**
   * Process a recognized command.
   */
  async processCommand(text: string): Promise<void> {
    this.clearListenTimer();
    this.setState("processing");

    this.emit("command", { text, timestamp: Date.now() });

    // The caller should listen for the "command" event,
    // process it through AgentLoop, and then call speakResponse()
  }

  /**
   * Speak a response using TTS and return to listening.
   */
  async speakResponse(text: string): Promise<void> {
    this.setState("speaking");

    try {
      if (this.ttsAdapter) {
        const audioBuffer = await this.ttsAdapter.synthesize(text, {
          voice: this.config.ttsVoice,
        });

        // Emit the audio buffer for playback
        this.emit("speak", { audio: audioBuffer, text });
      } else {
        // No TTS available — emit text-only
        this.emit("speak", { text, audio: null });
      }
    } catch (err) {
      console.error(`[Ambient] TTS failed: ${err instanceof Error ? err.message : err}`);
      this.emit("speak", { text, audio: null });
    }

    // If in conversation mode, go back to listening instead of idle
    if (this.conversationMode) {
      await this.beginListening();
    } else {
      this.setState("idle");
      this.emit("listen_chime", { type: "done" });
    }
  }

  /**
   * Enter conversation mode: after speaking, go back to listening.
   */
  enterConversationMode(): void {
    this.conversationMode = true;
    console.log("[Ambient] Conversation mode enabled");
  }

  /**
   * Exit conversation mode.
   */
  exitConversationMode(): void {
    this.conversationMode = false;
    console.log("[Ambient] Conversation mode disabled");
  }

  // ─── Audio Level Monitoring ─────────────────────────────────────────────

  private startAudioPolling(): void {
    this.stopAudioPolling();

    // Poll audio level every 100ms
    this.pollingTimer = setInterval(() => {
      if (!this.running) return;

      // Simulate audio level (real implementation reads from mic stream)
      if (this.micStream && this.micStream.readableLength > 0) {
        // Real mic data would be processed here
        this.audioLevel = Math.random() * 0.3; // placeholder
      } else {
        // Decay to baseline noise
        this.audioLevel = Math.max(0, this.audioLevel * 0.9);
      }

      // Record history (keep last 10s)
      const now = Date.now();
      this.audioLevelHistory.push({ timestamp: now, level: this.audioLevel });
      this.audioLevelHistory = this.audioLevelHistory.filter(s => now - s.timestamp < 10_000);

      // Noise gate: if audio level exceeds threshold, check for wake word
      if (this.audioLevel > this.config.noiseGateThreshold && this.state === "idle") {
        // In real implementation, capture audio segment and run STT
        // For now, we check if STT is available and emit a potential detection
        if (this.sttAdapter && this.audioLevel > 0.15) {
          // Simulated: in production this would capture and transcribe
          this.emit("audio_activity", { level: this.audioLevel, timestamp: now });
        }
      }
    }, 100);
  }

  private stopAudioPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  // ─── Microphone Management ───────────────────────────────────────────────

  private async openMicrophone(): Promise<void> {
    try {
      // Try to load node-microphone or similar
      const micModule = await import("node-microphone").catch(() => null);
      if (micModule) {
        this.micStream = new (micModule as any).default({
          rate: 16000,
          channels: 1,
          fileType: "wav",
        });
        this.micStream.start();
        console.log("[Ambient] Microphone opened (node-microphone)");
      } else {
        console.log("[Ambient] node-microphone not available — using polling mode");
      }
    } catch (err) {
      console.log(`[Ambient] Microphone unavailable: ${err instanceof Error ? err.message : err}`);
      console.log("[Ambient] Ambient mode running in polling mode (no live mic)");
    }
  }

  private closeMicrophone(): void {
    if (this.micStream) {
      try {
        this.micStream.stop();
      } catch { /* already stopped */ }
      this.micStream = null;
    }
  }

  // ─── Adapter Loading ────────────────────────────────────────────────────

  private async loadSttAdapter(): Promise<void> {
    try {
      const module = await import("./WhisperSttAdapter.js");
      this.sttAdapter = new module.WhisperSttAdapter(this.config.sttModelPath);
      console.log("[Ambient] STT adapter loaded (Whisper)");
    } catch {
      console.log("[Ambient] STT adapter not available");
      this.sttAdapter = null;
    }
  }

  private loadTtsAdapter(): void {
    if (!this.config.ttsEndpoint) {
      this.ttsAdapter = null;
      return;
    }

    try {
      // Dynamic require for the TTS adapter (ESM compatibility)
      const adapter = {
        synthesize: async (text: string, opts?: { voice?: string }) => {
          const resp = await fetch(this.config.ttsEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voice: opts?.voice }),
          });
          if (!resp.ok) throw new Error(`TTS error: ${resp.status}`);
          const buf = await resp.arrayBuffer();
          return Buffer.from(buf);
        },
      };
      this.ttsAdapter = adapter;
      console.log("[Ambient] TTS adapter configured");
    } catch {
      this.ttsAdapter = null;
    }
  }

  // ─── HUD Integration ───────────────────────────────────────────────────

  private broadcastToHud(data: Record<string, unknown>): void {
    this.hudEmitter?.("ambient_state", data);
  }

  // ─── Timer Helpers ─────────────────────────────────────────────────────

  private clearListenTimer(): void {
    if (this.listenTimer) {
      clearTimeout(this.listenTimer);
      this.listenTimer = null;
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: AmbientMode | null = null;

export function getAmbientMode(config?: Partial<AmbientModeConfig>): AmbientMode {
  if (!_instance) {
    _instance = new AmbientMode(config);
  }
  return _instance;
}
