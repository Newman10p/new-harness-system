export interface ToneConfig {
    formality: number;
    verbosity: number;
    enthusiasm: number;
    humor: boolean;
    proactivity: number;
    voiceRate: number;
}
export type UrgencyLevel = "low" | "normal" | "high" | "critical";
export type UserMood = "focused" | "relaxed" | "frustrated" | "curious" | "tired";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";
export interface SituationContext {
    urgency: UrgencyLevel;
    userMood: UserMood;
    timeOfDay: TimeOfDay;
    errorCount: number;
    sessionAge: number;
    taskComplexity: number;
}
export declare class ToneAdapter {
    private userToneOverrides;
    constructor();
    /**
     * Generate a ToneConfig based on the current situation.
     * Never throws — returns defaults on any error.
     */
    adaptTone(situation: SituationContext): ToneConfig;
    /**
     * Generate a system prompt addon that instructs the LLM on tone.
     */
    getSystemPromptAddon(tone: ToneConfig): string;
    /**
     * Optional post-processing of response text based on tone.
     * Applies light formatting adjustments (not rewriting).
     */
    formatResponse(text: string, tone: ToneConfig): string;
    /**
     * Infer time of day from the current hour.
     */
    static getTimeOfDay(hour?: number): TimeOfDay;
    /**
     * Infer user mood from recent interaction patterns.
     */
    static inferMood(errorCount: number, sessionAgeSec: number, lastUserMessage?: string): UserMood;
    private adaptToneInternal;
    /**
     * Load user tone preferences from the user profile.
     */
    private loadUserTonePreferences;
}
export declare function getToneAdapter(): ToneAdapter;
//# sourceMappingURL=ToneAdapter.d.ts.map