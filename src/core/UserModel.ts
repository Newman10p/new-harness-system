// ─── M.A.I. User Model ─────────────────────────────────────────────────────
// Tracks and learns user preferences, behavior patterns, and builds a
// user profile. Persists to memory/user-profile.md.
//
// Called after every agent loop completion to learn from interactions.

import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "./constants.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PreferenceCategory =
  | "output_format"
  | "voice"
  | "coding_style"
  | "workflow"
  | "tool"
  | "communication";

export interface UserPreference {
  category: PreferenceCategory;
  key: string;
  value: string;
  confidence: number; // 0-1, increases with repeated observations
  source: string; // which interaction taught this
  detected: string; // ISO timestamp
}

export interface InteractionStats {
  totalSessions: number;
  avgSessionLength: number; // seconds
  mostUsedActions: Array<{ action: string; count: number }>;
  successRate: number;
  avgLoopIterations: number;
  commonErrors: string[];
  peakUsageHours: number[]; // 24-element array (0-23)
}

export interface LearnedBehavior {
  pattern: string;
  observed: number;
  lastObserved: string;
  autoAction: string;
}

export interface UserProfile {
  detectedPreferences: UserPreference[];
  interactionStats: InteractionStats;
  learnedBehaviors: LearnedBehavior[];
  lastUpdated: string;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const MEMORY_DIR = path.join(PROJECT_ROOT, "memory");
const USER_PROFILE_PATH = path.join(MEMORY_DIR, "user-profile.md");

// ─── Defaults ───────────────────────────────────────────────────────────────

function defaultProfile(): UserProfile {
  return {
    detectedPreferences: [],
    interactionStats: {
      totalSessions: 0,
      avgSessionLength: 0,
      mostUsedActions: [],
      successRate: 1.0,
      avgLoopIterations: 1,
      commonErrors: [],
      peakUsageHours: new Array(24).fill(0),
    },
    learnedBehaviors: [],
    lastUpdated: new Date().toISOString(),
  };
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export class UserModel {
  private profile: UserProfile;
  private actionCounts = new Map<string, number>();
  private sessionStart = Date.now();
  private loopIterationsInSession = 0;
  private errorsInSession: string[] = [];
  private dirty = false;

  constructor() {
    this.profile = defaultProfile();
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Initialize by loading profile from disk. Never throws.
   */
  async init(): Promise<void> {
    try {
      const content = await fs.readFile(USER_PROFILE_PATH, "utf-8");
      this.profile = this.parseProfile(content);
    } catch {
      // No profile yet — use defaults
      this.profile = defaultProfile();
    }
  }

  /**
   * Called after every agent loop completion to learn from the interaction.
   */
  async updateFromInteraction(params: {
    userMessage: string;
    actions: string[];
    loopIterations: number;
    success: boolean;
    errors: string[];
  }): Promise<void> {
    // Track action usage
    for (const action of params.actions) {
      this.actionCounts.set(action, (this.actionCounts.get(action) ?? 0) + 1);
    }

    this.loopIterationsInSession = params.loopIterations;
    this.errorsInSession.push(...params.errors);

    // Detect preferences from user message
    const newPrefs = this.detectPreferences(params.userMessage);
 for (const pref of newPrefs) {
      await this.mergePreference(pref);
    }

    // Update stats
    const stats = this.profile.interactionStats;
    stats.totalSessions++;

    // Update peak usage hours
    const hour = new Date().getHours();
    stats.peakUsageHours[hour]++;

    // Update action usage
    stats.mostUsedActions = this.getTopActions(10);

    // Update success rate (exponential moving average)
    const alpha = 0.1;
    stats.successRate = stats.successRate * (1 - alpha) + (params.success ? 1 : 0) * alpha;

    // Update avg loop iterations
    stats.avgLoopIterations =
      stats.avgLoopIterations * 0.9 + params.loopIterations * 0.1;

    // Update common errors
    this.updateCommonErrors(params.errors);

    // Detect behaviors
    this.detectBehaviors(params);

    this.profile.lastUpdated = new Date().toISOString();
    this.dirty = true;
  }

  /**
   * Detect preferences from a user message using keyword/frequency analysis.
   */
  detectPreferences(message: string): UserPreference[] {
    const prefs: UserPreference[] = [];
    const lower = message.toLowerCase();

    // Output format detection
    if (/\b(json|yaml|csv|table|markdown|md|html)\b/.test(lower)) {
      const formatMatch = lower.match(/\b(json|yaml|csv|table|markdown|md|html)\b/);
      if (formatMatch) {
        prefs.push({
          category: "output_format",
          key: "preferred_format",
          value: formatMatch[1] === "md" ? "markdown" : formatMatch[1],
          confidence: 0.3,
          source: message.slice(0, 100),
          detected: new Date().toISOString(),
        });
      }
    }

    // Communication style: brief/concise vs detailed
    if (/\b(brief|concise|short|quick|tl;dr|summarize)\b/.test(lower)) {
      prefs.push({
        category: "communication",
        key: "verbosity",
        value: "concise",
        confidence: 0.3,
        source: message.slice(0, 100),
        detected: new Date().toISOString(),
      });
    }
    if (/\b(detailed|explain|elaborate|thorough|in.?depth|step.?by.?step)\b/.test(lower)) {
      prefs.push({
        category: "communication",
        key: "verbosity",
        value: "detailed",
        confidence: 0.3,
        source: message.slice(0, 100),
        detected: new Date().toISOString(),
      });
    }

    // Coding style
    if (/\b(typescript|javascript|python|rust|go|java)\b/.test(lower)) {
      const langMatch = lower.match(/\b(typescript|javascript|python|rust|go|java)\b/);
      if (langMatch) {
        prefs.push({
          category: "coding_style",
          key: "preferred_language",
          value: langMatch[1],
          confidence: 0.4,
          source: message.slice(0, 100),
          detected: new Date().toISOString(),
        });
      }
    }

    // Tool preferences
    if (/\b(vs.?code|vim|neovim|emacs|cursor|jetbrains|intellij)\b/.test(lower)) {
      const toolMatch = lower.match(/\b(vs.?code|vim|neovim|emacs|cursor|jetbrains|intellij)\b/);
      if (toolMatch) {
        prefs.push({
          category: "tool",
          key: "preferred_editor",
          value: toolMatch[1],
          confidence: 0.5,
          source: message.slice(0, 100),
          detected: new Date().toISOString(),
        });
      }
    }

    // Voice preferences
    if (/\b(no voice|don'?t speak|text only|quiet|mute|silent)\b/.test(lower)) {
      prefs.push({
        category: "voice",
        key: "voice_enabled",
        value: "false",
        confidence: 0.6,
        source: message.slice(0, 100),
        detected: new Date().toISOString(),
      });
    }
    if (/\b(speak|say it|read it|voice|tts)\b/.test(lower)) {
      prefs.push({
        category: "voice",
        key: "voice_enabled",
        value: "true",
        confidence: 0.3,
        source: message.slice(0, 100),
        detected: new Date().toISOString(),
      });
    }

    // Workflow preferences
    if (/\b(test|tests|testing)\b/.test(lower) && /\b(before|first|always)\b/.test(lower)) {
      prefs.push({
        category: "workflow",
        key: "test_first",
        value: "true",
        confidence: 0.4,
        source: message.slice(0, 100),
        detected: new Date().toISOString(),
      });
    }

    return prefs;
  }

  /**
   * Return a formatted summary of the user profile for system prompt injection.
   */
  getProfileSummary(): string {
    const p = this.profile;
    const lines: string[] = ["## User Profile"];

    if (p.detectedPreferences.length > 0) {
      lines.push("");
      lines.push("### Detected Preferences");
      for (const pref of p.detectedPreferences) {
        if (pref.confidence >= 0.4) {
          lines.push(`- **${pref.category}/${pref.key}**: ${pref.value} (${Math.round(pref.confidence * 100)}% confidence)`);
        }
      }
    }

    const stats = p.interactionStats;
    if (stats.totalSessions > 0) {
      lines.push("");
      lines.push("### Interaction Stats");
      lines.push(`- Sessions: ${stats.totalSessions}`);
      lines.push(`- Success rate: ${Math.round(stats.successRate * 100)}%`);
      lines.push(`- Avg loop iterations: ${stats.avgLoopIterations.toFixed(1)}`);

      if (stats.mostUsedActions.length > 0) {
        const topActions = stats.mostUsedActions.slice(0, 5).map((a) => `${a.action}(${a.count})`);
        lines.push(`- Top actions: ${topActions.join(", ")}`);
      }

      // Peak usage hour
      const peakHour = stats.peakUsageHours.indexOf(Math.max(...stats.peakUsageHours));
      lines.push(`- Peak usage hour: ${peakHour}:00`);
    }

    if (p.learnedBehaviors.length > 0) {
      lines.push("");
      lines.push("### Learned Behaviors");
      for (const b of p.learnedBehaviors) {
        lines.push(`- ${b.pattern} (observed ${b.observed}x)`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Search for contextually relevant preferences based on a query.
   */
  getRelevantMemories(query: string): UserPreference[] {
    const lower = query.toLowerCase();
    const keywords = lower.split(/\s+/).filter((w) => w.length > 2);

    return this.profile.detectedPreferences.filter((pref) => {
      const haystack = `${pref.category} ${pref.key} ${pref.value} ${pref.source}`.toLowerCase();
      return keywords.some((kw) => haystack.includes(kw));
    });
  }

  /**
   * Get the full profile object.
   */
  getProfile(): UserProfile {
    return { ...this.profile };
  }

  /**
   * Persist profile to disk. Called by the orchestrator or on shutdown.
   */
  async save(): Promise<void> {
    try {
      await fs.mkdir(MEMORY_DIR, { recursive: true });
      const content = this.serializeProfile();
      await fs.writeFile(USER_PROFILE_PATH, content, "utf-8");
      this.dirty = false;
    } catch {
      // Persistence failure is non-fatal
    }
  }

  /**
   * Get the peak usage hour.
   */
  getPeakUsageHour(): number {
    const hours = this.profile.interactionStats.peakUsageHours;
    return hours.indexOf(Math.max(...hours));
  }

  /**
   * Check if the profile has unsaved changes.
   */
  isDirty(): boolean {
    return this.dirty;
  }

  // ─── Private: Preference Merging ───────────────────────────────────────

  /**
   * Merge a new preference observation into the profile.
   * If the same key already exists, boost confidence.
   */
  private async mergePreference(newPref: UserPreference): Promise<void> {
    const existing = this.profile.detectedPreferences.find(
      (p) => p.category === newPref.category && p.key === newPref.key
    );

    if (existing) {
      if (existing.value === newPref.value) {
        // Reinforce — boost confidence
        existing.confidence = Math.min(1.0, existing.confidence + 0.15);
        existing.source = newPref.source;
      } else {
        // Conflicting observation — reduce confidence
        existing.confidence = Math.max(0, existing.confidence - 0.2);
      }
    } else {
      this.profile.detectedPreferences.push({ ...newPref });
    }
  }

  /**
   * Detect behavioral patterns from interaction data.
   */
  private detectBehaviors(params: {
    userMessage: string;
    actions: string[];
    success: boolean;
  }): void {
    const lower = params.userMessage.toLowerCase();

    // User runs tests before pushing
    if (lower.includes("test") && params.actions.includes("execute-terminal") && params.success) {
      this.observeBehavior(
        "User frequently runs tests via terminal",
        "Pre-emptively offer to run tests after code changes"
      );
    }

    // User checks files before acting
    if (
      (lower.includes("what") || lower.includes("show") || lower.includes("list")) &&
      params.actions.some((a) => a.includes("list") || a.includes("read") || a.includes("search"))
    ) {
      this.observeBehavior(
        "User often inspects before acting",
        "Provide file/state context proactively before making changes"
      );
    }

    // User asks for status/summary
    if (lower.includes("status") || lower.includes("summary") || lower.includes("what's going on")) {
      this.observeBehavior(
        "User requests status updates regularly",
        "Offer periodic status digests"
      );
    }
  }

  private observeBehavior(pattern: string, autoAction: string): void {
    const existing = this.profile.learnedBehaviors.find((b) => b.pattern === pattern);
    if (existing) {
      existing.observed++;
      existing.lastObserved = new Date().toISOString();
    } else {
      this.profile.learnedBehaviors.push({
        pattern,
        observed: 1,
        lastObserved: new Date().toISOString(),
        autoAction,
      });
    }
  }

  private updateCommonErrors(errors: string[]): void {
    for (const err of errors) {
      const existing = this.profile.interactionStats.commonErrors.find(
        (e) => e.toLowerCase().includes(err.toLowerCase().slice(0, 30))
      );
      if (!existing && err.length > 5) {
        this.profile.interactionStats.commonErrors.push(err);
        // Keep only top 10
        if (this.profile.interactionStats.commonErrors.length > 10) {
          this.profile.interactionStats.commonErrors.shift();
        }
      }
    }
  }

  private getTopActions(n: number): Array<{ action: string; count: number }> {
    return Array.from(this.actionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([action, count]) => ({ action, count }));
  }

  // ─── Serialization ─────────────────────────────────────────────────────

  /**
   * Serialize profile to YAML frontmatter + markdown format.
   */
  private serializeProfile(): string {
    const p = this.profile;
    const stats = p.interactionStats;

    const parts: string[] = [];
    const NL = "\n";
    const BT = String.fromCharCode(96);

    parts.push("---" + NL);
    parts.push("lastUpdated: " + p.lastUpdated + NL);
    parts.push("totalSessions: " + stats.totalSessions + NL);
    parts.push("successRate: " + stats.successRate.toFixed(3) + NL);
    parts.push("avgLoopIterations: " + stats.avgLoopIterations.toFixed(2) + NL);
    parts.push("peakUsageHour: " + this.getPeakUsageHour() + NL);
    parts.push("---" + NL + NL);
    parts.push("# User Profile" + NL + NL);

    if (p.detectedPreferences.length > 0) {
      parts.push("## Preferences" + NL + NL);
      for (const pref of p.detectedPreferences) {
        parts.push(
          "- **" + pref.category + "/" + pref.key + "**: " + pref.value +
          " (" + Math.round(pref.confidence * 100) + "% confidence)" +
          " \u2014 *" + pref.detected + "*" + NL
        );
      }
      parts.push(NL);
    }

    if (stats.mostUsedActions.length > 0) {
      parts.push("## Top Actions" + NL + NL);
      for (const a of stats.mostUsedActions) {
        parts.push("- " + BT + a.action + BT + ": " + a.count + " uses" + NL);
      }
      parts.push(NL);
    }

    if (stats.commonErrors.length > 0) {
      parts.push("## Common Errors" + NL + NL);
      for (const err of stats.commonErrors) {
        parts.push("- " + err + NL);
      }
      parts.push(NL);
    }

    if (p.learnedBehaviors.length > 0) {
      parts.push("## Learned Behaviors" + NL + NL);
      for (const b of p.learnedBehaviors) {
        parts.push("### " + b.pattern + NL);
        parts.push("- Observed: " + b.observed + "x (last: " + b.lastObserved + ")" + NL);
        parts.push("- Auto-action: " + b.autoAction + NL + NL);
      }
    }

    return parts.join("");
  }

  private parseProfile(content: string): UserProfile {
    const profile = defaultProfile();

    try {
      // Extract YAML frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const yaml = fmMatch[1];
        const tsMatch = yaml.match(/lastUpdated:\s*(.+)/);
        if (tsMatch) profile.lastUpdated = tsMatch[1].trim();
        const sessMatch = yaml.match(/totalSessions:\s*(\d+)/);
        if (sessMatch) profile.interactionStats.totalSessions = parseInt(sessMatch[1], 10);
        const srMatch = yaml.match(/successRate:\s*([\d.]+)/);
        if (srMatch) profile.interactionStats.successRate = parseFloat(srMatch[1]);
        const aliMatch = yaml.match(/avgLoopIterations:\s*([\d.]+)/);
        if (aliMatch) profile.interactionStats.avgLoopIterations = parseFloat(aliMatch[1]);
      }

      // Extract preferences from markdown
      const prefRegex =
        /- \*\*(\w+)\/(\w+)\*\*:\s*(.+?)\s*\((\d+)% confidence\)/g;
      let match;
      while ((match = prefRegex.exec(content)) !== null) {
        profile.detectedPreferences.push({
          category: match[1] as PreferenceCategory,
          key: match[2],
          value: match[3].trim(),
          confidence: parseInt(match[4], 10) / 100,
          source: "parsed from profile",
          detected: profile.lastUpdated,
        });
      }

      // Extract top actions
      const actionRegex = /- `([^`]+)`: (\d+) uses/g;
      while ((match = actionRegex.exec(content)) !== null) {
        profile.interactionStats.mostUsedActions.push({
          action: match[1],
          count: parseInt(match[2], 10),
        });
      }

      // Extract common errors
      const errorRegex = /^- (.+)$/gm;
      const inErrors = content.includes("## Common Errors");
      if (inErrors) {
        const errorSection = content.split("## Common Errors")[1]?.split("##")[0] ?? "";
        for (const line of errorSection.split("\n")) {
          const em = line.match(/^- (.+)$/);
          if (em) {
            profile.interactionStats.commonErrors.push(em[1].trim());
          }
        }
      }

      // Extract learned behaviors
      const behaviorSections = content.split(/### (.+)/);
      for (let i = 1; i < behaviorSections.length; i += 2) {
        const pattern = behaviorSections[i].trim();
        const body = behaviorSections[i + 1] ?? "";
        const obsMatch = body.match(/Observed:\s*(\d+)x/);
        const lastMatch = body.match(/last:\s*([^\n]+)/);
        const autoMatch = body.match(/Auto-action:\s*(.+)/);
        if (obsMatch) {
          profile.learnedBehaviors.push({
            pattern,
            observed: parseInt(obsMatch[1], 10),
            lastObserved: lastMatch?.[1]?.trim() ?? new Date().toISOString(),
            autoAction: autoMatch?.[1]?.trim() ?? "",
          });
        }
      }
    } catch {
      // Parse failure — return defaults
    }

    return profile;
  }
}

// ─── Singleton Accessor ─────────────────────────────────────────────────────

let _instance: UserModel | null = null;

export function getUserModel(): UserModel {
  if (!_instance) {
    _instance = new UserModel();
  }
  return _instance;
}
