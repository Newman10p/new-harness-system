// ─── M.A.I. SIP/VoIP Channel ────────────────────────────────────────────────
// SIP/VoIP call adapter for the M.A.I. gateway.
//
// Capabilities:
//   - Handle incoming SIP calls: answer → play greeting → record audio → transcribe → process → TTS response → play back
//   - Outbound calls via SIP INVITE
//   - Call state management (ringing, connected, on-hold, ended)
//   - DTMF tone detection for in-call commands
//   - Audio recording/playback integration points
//   - Call duration limits and hangup logic
//
// Config:
//   { sipServer, sipPort, username, password, dtmfEnabled, maxCallDuration, greetingPrompt }

import crypto from "node:crypto";
import type {
  ChannelAdapter,
  ChannelConfig,
  ChannelStatus,
  GatewayMessage,
  GatewayResponse,
} from "../types.js";

// ─── SIP Call State ────────────────────────────────────────────────────────
export type CallState = "idle" | "ringing" | "connecting" | "active" | "on-hold" | "transcribing" | "processing" | "playing-back" | "ended";

/**
 * Represents an active or recent SIP call.
 */
export interface SipCall {
  /** Unique call identifier. */
  callId: string;
  /** SIP URI of the caller. */
  callerUri: string;
  /** SIP URI of the callee. */
  calleeUri: string;
  /** Current call state. */
  state: CallState;
  /** When the call started (Unix ms). */
  startedAt: number;
  /** When the call was last updated (Unix ms). */
  updatedAt: number;
  /** Total call duration in seconds. */
  duration: number;
  /** Caller display name (if available). */
  callerName?: string;
  /** Whether the call is inbound or outbound. */
  direction: "inbound" | "outbound";
  /** Transcription of the call audio. */
  transcript: string[];
  /** DTMF tones detected during the call. */
  dtmfBuffer: string[];
  /** Call metadata (SIP headers, etc.). */
  metadata: Record<string, unknown>;
  /** Hangup reason (if ended). */
  hangupReason?: string;
}

// ─── SIP Rate Limiter ───────────────────────────────────────────────────────
class SipRateLimiter {
  private counters: Map<string, { count: number; resetAt: number }> = new Map();
  private maxPerMinute: number;

  constructor(maxPerMinute = 5) {
    this.maxPerMinute = maxPerMinute;
  }

  check(uri: string): boolean {
    const now = Date.now();
    let entry = this.counters.get(uri);

    if (!entry || now >= entry.resetAt) {
      entry = { count: this.maxPerMinute, resetAt: now + 60_000 };
      this.counters.set(uri, entry);
    }

    if (entry.count <= 0) return false;
    entry.count--;
    return true;
  }

  reset(): void {
    this.counters.clear();
  }
}

// ─── SIP Channel Adapter ────────────────────────────────────────────────────
/**
 * SIP/VoIP channel adapter for the M.A.I. gateway.
 *
 * Provides voice call integration through SIP protocol. The channel manages
 * call lifecycle, audio recording, transcription, and TTS playback.
 *
 * Audio recording and playback are provided through configurable hooks
 * (audioRecorder and audioPlayer) that bridge to the actual SIP stack.
 *
 * Example config:
 * ```json
 * {
 *   "enabled": true,
 *   "sipServer": "sip.example.com",
 *   "sipPort": 5060,
 *   "username": "mai-agent",
 *   "password": "sip-password",
 *   "dtmfEnabled": true,
 *   "maxCallDuration": 300,
 *   "greetingPrompt": "Hello, this is M.A.I. How can I help you?"
 * }
 * ```
 */
export class SipChannel implements ChannelAdapter {
  readonly type = "sip" as const;
  readonly name = "SIP/VoIP";
  private config: ChannelConfig | null = null;
  private messageHandler: ((msg: GatewayMessage) => Promise<void>) | null = null;
  private status: ChannelStatus = "disconnected";
  private rateLimiter = new SipRateLimiter();
  private activeCalls: Map<string, SipCall> = new Map();
  private callHistory: SipCall[] = [];
  private messageCount = 0;
  private errorCount = 0;

  // ─── Audio Integration Hooks ────────────────────────────────────────────

  /** Hook for recording audio during a call. */
  audioRecorder?: (callId: string) => Promise<string>;

  /** Hook for playing audio during a call (TTS playback). */
  audioPlayer?: (callId: string, audioUrl: string) => Promise<void>;

  /** Hook for transcribing audio to text. */
  audioTranscriber?: (audioUrl: string) => Promise<string>;

  /** Hook for generating TTS audio from text. */
  textToSpeech?: (text: string) => Promise<string>;

  // ─── Adapter Interface ────────────────────────────────────────────────────

  /**
   * Initialize the SIP channel with server credentials.
   * In production, this would establish a SIP user agent registration.
   */
  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    this.status = "connecting";

    // Validate required configuration
    const { sipServer, username } = config;
    if (!sipServer || !username) {
      console.warn("[SipChannel] Missing required configuration (sipServer, username)");
      this.status = "error";
      return;
    }

    // Configure rate limiter (stricter for voice calls)
    const maxPerMinute = config.maxCallsPerMinute as number;
    if (maxPerMinute && maxPerMinute > 0) {
      this.rateLimiter = new SipRateLimiter(maxPerMinute);
    }

    console.log(`[SipChannel] Initialized with SIP server: ${sipServer}`);

    // In a full implementation, we would:
    // 1. Create a SIP user agent (e.g., using JsSIP or SIP.js)
    // 2. Register with the SIP server
    // 3. Set up event listeners for incoming calls
    // 4. Configure RTP for audio media

    this.status = "connected";
  }

  /**
   * Send a response through the SIP channel.
   * For active calls, this speaks the response via TTS.
   * For non-active calls, this initiates an outbound call.
   */
  async sendMessage(response: GatewayResponse): Promise<void> {
    if (!this.config) {
      throw new Error("[SipChannel] Not initialized");
    }

    // Check if there's an active call for this target
    const activeCall = this.findActiveCall(response.targetId);

    if (activeCall) {
      // Speak the response through the active call
      await this.speakInCall(activeCall, response.text);
    } else {
      // Initiate an outbound call to deliver the message
      console.log(`[SipChannel] No active call for ${response.targetId} — consider outbound call`);
    }

    this.messageCount++;
  }

  /**
   * Gracefully shut down the SIP channel.
   * Hangs up all active calls and deregisters from the SIP server.
   */
  async shutdown(): Promise<void> {
    // Hang up all active calls
    for (const call of this.activeCalls.values()) {
      try {
        await this.hangupCall(call.callId);
      } catch {
        /* non-fatal */
      }
    }

    this.status = "disconnected";
    this.rateLimiter.reset();
    console.log("[SipChannel] Shut down");
  }

  /**
   * Register a handler for transcribed call audio.
   * The handler receives GatewayMessage objects with the transcribed text.
   */
  onMessage(handler: (msg: GatewayMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Get the current channel status.
   */
  getStatus(): ChannelStatus {
    return this.status;
  }

  /**
   * Get channel diagnostic information.
   */
  getDiagnostics(): Record<string, unknown> {
    return {
      status: this.status,
      sipServer: this.config?.sipServer ?? "not configured",
      username: this.config?.username ?? "not configured",
      activeCalls: this.activeCalls.size,
      totalCalls: this.callHistory.length,
      messagesSent: this.messageCount,
      errors: this.errorCount,
    };
  }

  // ─── Call Management ──────────────────────────────────────────────────────

  /**
   * Initiate an outbound SIP call to a target URI.
   */
  async initiateCall(targetUri: string, callerName?: string): Promise<SipCall | null> {
    if (!this.config) {
      console.error("[SipChannel] Not initialized");
      return null;
    }

    // Rate limit check
    if (!this.rateLimiter.check(targetUri)) {
      console.warn(`[SipChannel] Rate limited: ${targetUri}`);
      return null;
    }

    const callId = crypto.randomUUID();
    const username = this.config.username as string;
    const sipServer = this.config.sipServer as string;

    const call: SipCall = {
      callId,
      callerUri: `sip:${username}@${sipServer}`,
      calleeUri: targetUri,
      state: "connecting",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      duration: 0,
      callerName,
      direction: "outbound",
      transcript: [],
      dtmfBuffer: [],
      metadata: {},
    };

    this.activeCalls.set(callId, call);
    console.log(`[SipChannel] Outbound call initiated: ${callId} → ${targetUri}`);

    // In a full implementation:
    // 1. Create SIP INVITE to targetUri
    // 2. Wait for 100 Trying, 180 Ringing, 200 OK
    // 3. Send ACK, start RTP media
    // 4. Transition to "active" state

    return call;
  }

  /**
   * Handle an incoming SIP call (called by the SIP stack when a call arrives).
   */
  async handleIncomingCall(
    callerUri: string,
    callerName?: string,
    sipHeaders?: Record<string, string>
  ): Promise<SipCall | null> {
    if (!this.config) {
      console.error("[SipChannel] Not initialized");
      return null;
    }

    // Rate limit check
    if (!this.rateLimiter.check(callerUri)) {
      console.warn(`[SipChannel] Rate limited: ${callerUri}`);
      return null;
    }

    const callId = crypto.randomUUID();
    const username = this.config.username as string;
    const sipServer = this.config.sipServer as string;

    const call: SipCall = {
      callId,
      callerUri,
      calleeUri: `sip:${username}@${sipServer}`,
      state: "ringing",
      startedAt: Date.now(),
      updatedAt: Date.now(),
      duration: 0,
      callerName,
      direction: "inbound",
      transcript: [],
      dtmfBuffer: [],
      metadata: { sipHeaders: sipHeaders ?? {} },
    };

    this.activeCalls.set(callId, call);
    console.log(`[SipChannel] Incoming call: ${callId} from ${callerUri}`);

    // Auto-answer the call (in production, this would send a 200 OK)
    await this.answerCall(callId);

    return call;
  }

  /**
   * Answer an incoming call.
   */
  async answerCall(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      console.warn(`[SipChannel] Cannot answer unknown call: ${callId}`);
      return;
    }

    call.state = "active";
    call.updatedAt = Date.now();

    // Play greeting message if TTS is available
    const greeting = (this.config?.greetingPrompt as string) || "Hello, this is M.A.I. How can I help you?";
    await this.speakInCall(call, greeting);

    // Start recording audio
    this.startRecording(callId);
  }

  /**
   * Hang up a specific call.
   */
  async hangupCall(callId: string, reason = "normal"): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      console.warn(`[SipChannel] Cannot hang up unknown call: ${callId}`);
      return;
    }

    call.state = "ended";
    call.updatedAt = Date.now();
    call.duration = Math.floor((Date.now() - call.startedAt) / 1000);
    call.hangupReason = reason;

    this.activeCalls.delete(callId);
    this.callHistory.push(call);

    // Keep only the last 100 calls in history
    if (this.callHistory.length > 100) {
      this.callHistory = this.callHistory.slice(-100);
    }

    console.log(`[SipChannel] Call ended: ${callId} (duration: ${call.duration}s, reason: ${reason})`);
  }

  /**
   * Handle a DTMF tone received during an active call.
   */
  handleDtmfTone(callId: string, tone: string): void {
    const call = this.activeCalls.get(callId);
    if (!call || !this.config?.dtmfEnabled) return;

    call.dtmfBuffer.push(tone);
    call.updatedAt = Date.now();

    // Check for special DTMF sequences
    const buffer = call.dtmfBuffer.join("");

    if (buffer.endsWith("*")) {
      // '#' ends current input, process as command
      const command = call.dtmfBuffer.join("").replace(/\*$/, "");
      call.dtmfBuffer = [];

      if (command === "1") {
        this.hangupCall(callId, "user-hangup");
      }
    }

    console.log(`[SipChannel] DTMF tone '${tone}' on call ${callId}`);
  }

  /**
   * Get a specific call by ID.
   */
  getCall(callId: string): SipCall | undefined {
    return this.activeCalls.get(callId) ?? this.callHistory.find(c => c.callId === callId);
  }

  /**
   * Get all active calls.
   */
  getActiveCalls(): SipCall[] {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get recent call history.
   */
  getCallHistory(limit = 20): SipCall[] {
    return this.callHistory.slice(-limit);
  }

  // ─── Audio Processing Pipeline ────────────────────────────────────────────

  /**
   * Start recording audio for an active call.
   * In production, this would start RTP audio capture.
   */
  private async startRecording(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    const maxDuration = (this.config?.maxCallDuration as number) || 300; // 5 minutes default
    const recordingInterval = (this.config?.recordingSegmentLength as number) || 30; // 30s segments

    // Simulate recording segments in a loop
    const segmentLoop = async (): Promise<void> => {
      while (this.activeCalls.has(callId)) {
        await new Promise(resolve => setTimeout(resolve, recordingInterval * 1000));

        if (!this.activeCalls.has(callId)) break;

        // Check max duration
        const elapsed = Math.floor((Date.now() - call.startedAt) / 1000);
        if (elapsed >= maxDuration) {
          console.log(`[SipChannel] Call ${callId} exceeded max duration (${maxDuration}s)`);
          await this.hangupCall(callId, "max-duration-exceeded");
          return;
        }

        // Use the audioRecorder hook if available
        if (this.audioRecorder) {
          try {
            const audioUrl = await this.audioRecorder(callId);
            await this.processAudioSegment(callId, audioUrl);
          } catch (err) {
            console.error(
              `[SipChannel] Recording error on ${callId}:`,
              err instanceof Error ? err.message : String(err)
            );
          }
        }

        call.updatedAt = Date.now();
      }
    };

    // Run the recording loop (non-blocking)
    segmentLoop().catch(err => {
      console.error(`[SipChannel] Recording loop error:`, err instanceof Error ? err.message : String(err));
    });
  }

  /**
   * Process an audio segment: transcribe → forward to agent → speak response.
   */
  private async processAudioSegment(callId: string, audioUrl: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    call.state = "transcribing";

    try {
      // Transcribe audio
      let transcription = "";
      if (this.audioTranscriber) {
        transcription = await this.audioTranscriber(audioUrl);
      } else {
        // If no transcriber, skip processing
        console.log(`[SipChannel] No transcriber configured — audio segment ignored`);
        call.state = "active";
        return;
      }

      if (!transcription.trim()) return;

      call.transcript.push(transcription);
      call.state = "processing";

      // Forward transcribed text to gateway manager
      if (this.messageHandler) {
        const message: GatewayMessage = {
          id: crypto.randomUUID(),
          channel: "sip",
          source: call.callerUri,
          sourceDevice: call.callerName ?? call.callerUri,
          text: transcription,
          mediaUrl: audioUrl,
          timestamp: Date.now(),
          metadata: {
            callId: call.callId,
            callDirection: call.direction,
            callDuration: Math.floor((Date.now() - call.startedAt) / 1000),
            transcriptLength: call.transcript.length,
            audioUrl,
            dtmfBuffer: [...call.dtmfBuffer],
          },
        };

        await this.messageHandler(message);
      }

      call.state = "active";
    } catch (err) {
      this.errorCount++;
      call.state = "active";
      console.error(
        `[SipChannel] Audio processing error on ${callId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /**
   * Speak text through an active call via TTS.
   */
  private async speakInCall(call: SipCall, text: string): Promise<void> {
    if (!this.activeCalls.has(call.callId)) return;

    call.state = "playing-back";
    call.updatedAt = Date.now();

    try {
      if (this.textToSpeech && this.audioPlayer) {
        const audioUrl = await this.textToSpeech(text);
        await this.audioPlayer(call.callId, audioUrl);
      } else {
        // No TTS configured — just log the intended speech
        console.log(`[SipChannel] Would speak: "${text.substring(0, 100)}..."`);
      }
    } catch (err) {
      this.errorCount++;
      console.error(
        `[SipChannel] TTS playback error:`,
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      if (this.activeCalls.has(call.callId)) {
        call.state = "active";
        call.updatedAt = Date.now();
      }
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Find an active call for a given target/source URI.
   */
  private findActiveCall(uri: string): SipCall | undefined {
    for (const call of this.activeCalls.values()) {
      if (call.callerUri === uri || call.calleeUri === uri) {
        return call;
      }
    }
    return undefined;
  }
}
