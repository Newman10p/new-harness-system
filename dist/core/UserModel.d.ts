export type PreferenceCategory = "output_format" | "voice" | "coding_style" | "workflow" | "tool" | "communication";
export interface UserPreference {
    category: PreferenceCategory;
    key: string;
    value: string;
    confidence: number;
    source: string;
    detected: string;
}
export interface InteractionStats {
    totalSessions: number;
    avgSessionLength: number;
    mostUsedActions: Array<{
        action: string;
        count: number;
    }>;
    successRate: number;
    avgLoopIterations: number;
    commonErrors: string[];
    peakUsageHours: number[];
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
export declare class UserModel {
    private profile;
    private actionCounts;
    private sessionStart;
    private loopIterationsInSession;
    private errorsInSession;
    private dirty;
    constructor();
    /**
     * Initialize by loading profile from disk. Never throws.
     */
    init(): Promise<void>;
    /**
     * Called after every agent loop completion to learn from the interaction.
     */
    updateFromInteraction(params: {
        userMessage: string;
        actions: string[];
        loopIterations: number;
        success: boolean;
        errors: string[];
    }): Promise<void>;
    /**
     * Detect preferences from a user message using keyword/frequency analysis.
     */
    detectPreferences(message: string): UserPreference[];
    /**
     * Return a formatted summary of the user profile for system prompt injection.
     */
    getProfileSummary(): string;
    /**
     * Search for contextually relevant preferences based on a query.
     */
    getRelevantMemories(query: string): UserPreference[];
    /**
     * Get the full profile object.
     */
    getProfile(): UserProfile;
    /**
     * Persist profile to disk. Called by the orchestrator or on shutdown.
     */
    save(): Promise<void>;
    /**
     * Get the peak usage hour.
     */
    getPeakUsageHour(): number;
    /**
     * Check if the profile has unsaved changes.
     */
    isDirty(): boolean;
    /**
     * Merge a new preference observation into the profile.
     * If the same key already exists, boost confidence.
     */
    private mergePreference;
    /**
     * Detect behavioral patterns from interaction data.
     */
    private detectBehaviors;
    private observeBehavior;
    private updateCommonErrors;
    private getTopActions;
    /**
     * Serialize profile to YAML frontmatter + markdown format.
     */
    private serializeProfile;
    private parseProfile;
}
export declare function getUserModel(): UserModel;
//# sourceMappingURL=UserModel.d.ts.map