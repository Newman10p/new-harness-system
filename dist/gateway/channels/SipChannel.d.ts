import type { ChannelAdapter, ChannelConfig, ChannelStatus, GatewayMessage, GatewayResponse } from "../types.js";
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
export declare class SipChannel implements ChannelAdapter {
    readonly type: "sip";
    readonly name = "SIP/VoIP";
    private config;
    private messageHandler;
    private status;
    private rateLimiter;
    private activeCalls;
    private callHistory;
    private messageCount;
    private errorCount;
    /** Hook for recording audio during a call. */
    audioRecorder?: (callId: string) => Promise<string>;
    /** Hook for playing audio during a call (TTS playback). */
    audioPlayer?: (callId: string, audioUrl: string) => Promise<void>;
    /** Hook for transcribing audio to text. */
    audioTranscriber?: (audioUrl: string) => Promise<string>;
    /** Hook for generating TTS audio from text. */
    textToSpeech?: (text: string) => Promise<string>;
    /**
     * Initialize the SIP channel with server credentials.
     * In production, this would establish a SIP user agent registration.
     */
    initialize(config: ChannelConfig): Promise<void>;
    /**
     * Send a response through the SIP channel.
     * For active calls, this speaks the response via TTS.
     * For non-active calls, this initiates an outbound call.
     */
    sendMessage(response: GatewayResponse): Promise<void>;
    /**
     * Gracefully shut down the SIP channel.
     * Hangs up all active calls and deregisters from the SIP server.
     */
    shutdown(): Promise<void>;
    /**
     * Register a handler for transcribed call audio.
     * The handler receives GatewayMessage objects with the transcribed text.
     */
    onMessage(handler: (msg: GatewayMessage) => Promise<void>): void;
    /**
     * Get the current channel status.
     */
    getStatus(): ChannelStatus;
    /**
     * Get channel diagnostic information.
     */
    getDiagnostics(): Record<string, unknown>;
    /**
     * Initiate an outbound SIP call to a target URI.
     */
    initiateCall(targetUri: string, callerName?: string): Promise<SipCall | null>;
    /**
     * Handle an incoming SIP call (called by the SIP stack when a call arrives).
     */
    handleIncomingCall(callerUri: string, callerName?: string, sipHeaders?: Record<string, string>): Promise<SipCall | null>;
    /**
     * Answer an incoming call.
     */
    answerCall(callId: string): Promise<void>;
    /**
     * Hang up a specific call.
     */
    hangupCall(callId: string, reason?: string): Promise<void>;
    /**
     * Handle a DTMF tone received during an active call.
     */
    handleDtmfTone(callId: string, tone: string): void;
    /**
     * Get a specific call by ID.
     */
    getCall(callId: string): SipCall | undefined;
    /**
     * Get all active calls.
     */
    getActiveCalls(): SipCall[];
    /**
     * Get recent call history.
     */
    getCallHistory(limit?: number): SipCall[];
    /**
     * Start recording audio for an active call.
     * In production, this would start RTP audio capture.
     */
    private startRecording;
    /**
     * Process an audio segment: transcribe → forward to agent → speak response.
     */
    private processAudioSegment;
    /**
     * Speak text through an active call via TTS.
     */
    private speakInCall;
    /**
     * Find an active call for a given target/source URI.
     */
    private findActiveCall;
}
//# sourceMappingURL=SipChannel.d.ts.map