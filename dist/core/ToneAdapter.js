"use strict";
// ─── M.A.I. Tone Adapter ──────────────────────────────────────────────
// Adjusts M.A.I.'s communication style based on situation context,
// time of day, and detected user mood. Generates LLM prompt addons
// and optional post-processing of responses.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToneAdapter = void 0;
exports.getToneAdapter = getToneAdapter;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const constants_js_1 = require("./constants.js");
// ─── Defaults ───────────────────────────────────────────────────────────────
const DEFAULT_TONE = {
    formality: 0.4,
    verbosity: 0.5,
    enthusiasm: 0.5,
    humor: true,
    proactivity: 0.3,
    voiceRate: 1.0,
};
const MEMORY_DIR = node_path_1.default.join(constants_js_1.PROJECT_ROOT, "memory");
const USER_PROFILE_PATH = node_path_1.default.join(MEMORY_DIR, "user-profile.md");
// ─── Adapter ───────────────────────────────────────────────────────────────
class ToneAdapter {
    userToneOverrides = null;
    constructor() {
        this.loadUserTonePreferences().catch(() => { });
    }
    // ─── Public API ────────────────────────────────────────────────────────
    /**
     * Generate a ToneConfig based on the current situation.
     * Never throws — returns defaults on any error.
     */
    adaptTone(situation) {
        try {
            return this.adaptToneInternal(situation);
        }
        catch {
            return { ...DEFAULT_TONE, ...this.userToneOverrides };
        }
    }
    /**
     * Generate a system prompt addon that instructs the LLM on tone.
     */
    getSystemPromptAddon(tone) {
        const lines = ["## Communication Style"];
        // Formality
        if (tone.formality < 0.3) {
            lines.push("- Be casual and conversational. Use contractions. No stiff language.");
        }
        else if (tone.formality > 0.7) {
            lines.push("- Be formal and precise. Avoid contractions. Use professional language.");
        }
        else {
            lines.push("- Be friendly but professional. Balanced tone.");
        }
        // Verbosity
        if (tone.verbosity < 0.3) {
            lines.push("- Be extremely terse. Give the shortest correct answer. No preamble.");
        }
        else if (tone.verbosity < 0.5) {
            lines.push("- Be concise. Answer directly, minimal explanation.");
        }
        else if (tone.verbosity > 0.8) {
            lines.push("- Be thorough and detailed. Explain your reasoning step by step.");
        }
        // Enthusiasm
        if (tone.enthusiasm < 0.3) {
            lines.push("- Be matter-of-fact and neutral. No exclamation marks or enthusiasm.");
        }
        else if (tone.enthusiasm > 0.7) {
            lines.push("- Be enthusiastic and energetic. Show genuine interest and excitement.");
        }
        // Humor
        if (tone.humor) {
            lines.push("- Occasional mild wit or humor is welcome when appropriate.");
        }
        else {
            lines.push("- No humor or wit. Stay strictly professional.");
        }
        // Proactivity
        if (tone.proactivity > 0.7) {
            lines.push("- Be proactive: anticipate next steps and suggest them.");
        }
        else if (tone.proactivity < 0.3) {
            lines.push("- Be reactive: only do exactly what's asked, don't assume.");
        }
        return lines.join("\n");
    }
    /**
     * Optional post-processing of response text based on tone.
     * Applies light formatting adjustments (not rewriting).
     */
    formatResponse(text, tone) {
        let result = text;
        // If very terse and response is long, try to summarize the first paragraph
        if (tone.verbosity < 0.3 && result.length > 500) {
            const paragraphs = result.split("\n\n");
            if (paragraphs.length > 3) {
                result = paragraphs[0] + "\n\n" + paragraphs.slice(-1).join("");
            }
        }
        // Remove excessive exclamation marks if flat tone
        if (tone.enthusiasm < 0.3) {
            result = result.replace(/!+/g, ".");
        }
        return result;
    }
    /**
     * Infer time of day from the current hour.
     */
    static getTimeOfDay(hour) {
        const h = hour ?? new Date().getHours();
        if (h >= 5 && h < 12)
            return "morning";
        if (h >= 12 && h < 17)
            return "afternoon";
        if (h >= 17 && h < 21)
            return "evening";
        return "night";
    }
    /**
     * Infer user mood from recent interaction patterns.
     */
    static inferMood(errorCount, sessionAgeSec, lastUserMessage) {
        // High error count → frustrated
        if (errorCount >= 3)
            return "frustrated";
        if (errorCount >= 2)
            return "frustrated";
        // Long session → tired
        if (sessionAgeSec > 3600)
            return "tired";
        // Analyze message patterns
        if (lastUserMessage) {
            const lower = lastUserMessage.toLowerCase();
            if (/\b(why|how come|explain|interesting|tell me more|curious)\b/.test(lower)) {
                return "curious";
            }
            if (/\b(ugh|dammit|damn|sigh|frustrat|annoy|seriously)\b/.test(lower)) {
                return "frustrated";
            }
            if (/\b(quick|fast|hurry|rush|busy)\b/.test(lower)) {
                return "focused";
            }
            if (/\b(haha|lol|nice|cool|great|awesome|thanks|thx)\b/.test(lower)) {
                return "relaxed";
            }
        }
        return "focused";
    }
    // ─── Private ───────────────────────────────────────────────────────────
    adaptToneInternal(situation) {
        const tone = { ...DEFAULT_TONE, ...this.userToneOverrides };
        // ── Time of Day adjustments ──
        switch (situation.timeOfDay) {
            case "night":
                tone.formality = Math.max(0, tone.formality - 0.2);
                tone.verbosity = Math.max(0, tone.verbosity - 0.2);
                tone.voiceRate = Math.max(0.7, tone.voiceRate - 0.2);
                break;
            case "morning":
                tone.enthusiasm = Math.min(1, tone.enthusiasm + 0.1);
                break;
            case "evening":
                tone.verbosity = Math.max(0, tone.verbosity - 0.1);
                break;
        }
        // ── Urgency adjustments ──
        switch (situation.urgency) {
            case "critical":
                tone.verbosity = Math.max(0, tone.verbosity - 0.4);
                tone.humor = false;
                tone.enthusiasm = Math.max(0, tone.enthusiasm - 0.3);
                tone.voiceRate = Math.min(2.0, tone.voiceRate + 0.3);
                tone.formality = Math.max(0, tone.formality - 0.2);
                break;
            case "high":
                tone.verbosity = Math.max(0, tone.verbosity - 0.2);
                tone.humor = false;
                tone.voiceRate = Math.min(2.0, tone.voiceRate + 0.15);
                break;
            case "low":
                tone.verbosity = Math.min(1, tone.verbosity + 0.1);
                tone.proactivity = Math.min(1, tone.proactivity + 0.1);
                break;
        }
        // ── User Mood adjustments ──
        switch (situation.userMood) {
            case "frustrated":
                tone.humor = false;
                tone.verbosity = Math.min(1, tone.verbosity + 0.1); // be extra clear
                tone.enthusiasm = Math.max(0, tone.enthusiasm - 0.3); // empathetic, not bubbly
                tone.formality = Math.max(0, tone.formality - 0.1); // more human
                tone.proactivity = Math.min(1, tone.proactivity + 0.2); // offer alternatives
                break;
            case "focused":
                tone.verbosity = Math.max(0, tone.verbosity - 0.15);
                tone.humor = false;
                tone.proactivity = Math.max(0, tone.proactivity - 0.2); // minimal interruptions
                break;
            case "relaxed":
                tone.enthusiasm = Math.min(1, tone.enthusiasm + 0.1);
                tone.humor = true;
                tone.formality = Math.max(0, tone.formality - 0.1);
                break;
            case "curious":
                tone.verbosity = Math.min(1, tone.verbosity + 0.15);
                tone.enthusiasm = Math.min(1, tone.enthusiasm + 0.15);
                tone.proactivity = Math.min(1, tone.proactivity + 0.15);
                break;
            case "tired":
                tone.verbosity = Math.max(0, tone.verbosity - 0.2);
                tone.formality = Math.max(0, tone.formality - 0.15);
                tone.enthusiasm = Math.max(0, tone.enthusiasm - 0.2);
                break;
        }
        // ── Error count adjustments ──
        if (situation.errorCount >= 3) {
            // Switch to teaching mode
            tone.verbosity = Math.min(1, tone.verbosity + 0.2);
            tone.humor = false;
            tone.proactivity = Math.min(1, tone.proactivity + 0.3);
        }
        else if (situation.errorCount >= 1) {
            tone.verbosity = Math.min(1, tone.verbosity + 0.1);
            tone.humor = false;
        }
        // ── Task complexity adjustments ──
        if (situation.taskComplexity > 0.7) {
            tone.verbosity = Math.min(1, tone.verbosity + 0.15);
            tone.proactivity = Math.min(1, tone.proactivity + 0.1);
        }
        // ── Session age adjustments ──
        if (situation.sessionAge > 1800) {
            // After 30 minutes, reduce verbosity
            tone.verbosity = Math.max(0, tone.verbosity - 0.1);
        }
        // Clamp all values to valid ranges
        tone.formality = clamp(tone.formality, 0, 1);
        tone.verbosity = clamp(tone.verbosity, 0, 1);
        tone.enthusiasm = clamp(tone.enthusiasm, 0, 1);
        tone.proactivity = clamp(tone.proactivity, 0, 1);
        tone.voiceRate = clamp(tone.voiceRate, 0.5, 2.0);
        return tone;
    }
    /**
     * Load user tone preferences from the user profile.
     */
    async loadUserTonePreferences() {
        try {
            const content = await promises_1.default.readFile(USER_PROFILE_PATH, "utf-8");
            const lower = content.toLowerCase();
            const overrides = {};
            // Detect voice preference
            if (lower.includes("voice_enabled: false")) {
                overrides.voiceRate = 0; // signal to disable voice
            }
            // Detect verbosity preference
            if (lower.includes("verbosity: concise")) {
                overrides.verbosity = 0.3;
            }
            else if (lower.includes("verbosity: detailed")) {
                overrides.verbosity = 0.8;
            }
            // Detect formality preference
            if (lower.includes("casual") && lower.includes("communication")) {
                overrides.formality = 0.2;
            }
            if (Object.keys(overrides).length > 0) {
                this.userToneOverrides = overrides;
            }
        }
        catch {
            // No profile yet — use defaults
        }
    }
}
exports.ToneAdapter = ToneAdapter;
// ─── Helpers ────────────────────────────────────────────────────────────────
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
// ─── Singleton Accessor ─────────────────────────────────────────────────────
let _instance = null;
function getToneAdapter() {
    if (!_instance) {
        _instance = new ToneAdapter();
    }
    return _instance;
}
//# sourceMappingURL=ToneAdapter.js.map