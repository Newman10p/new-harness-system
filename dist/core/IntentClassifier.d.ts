export type IntentType = "command" | "question" | "observation" | "complaint" | "correction" | "preference" | "emergency" | "casual" | "complex_task" | "self_improvement";
export type Urgency = "low" | "normal" | "high" | "critical";
export interface IntentEntity {
    type: string;
    value: string;
}
export interface IntentResult {
    type: IntentType;
    confidence: number;
    entities: IntentEntity[];
    urgency: Urgency;
    requiresClarification: boolean;
    suggestedSystemBehavior: string;
}
export declare class IntentClassifier {
    /**
     * Classify a user input string and return the full intent result.
     * Never throws — returns a safe default on any error.
     */
    classify(input: string): IntentResult;
    /**
     * Quick type-only classification (no entity extraction).
     */
    classifyType(input: string): {
        type: IntentType;
        confidence: number;
    };
    private classifyInternal;
    private makeResult;
    /**
     * Detect complex multi-step tasks from input structure.
     */
    private detectComplexTask;
    /**
     * Extract entities using regex patterns.
     */
    private extractEntities;
    /**
     * Detect urgency from input patterns.
     */
    private detectUrgency;
    /**
     * Determine if the input needs clarification.
     */
    private needsClarification;
    /**
     * Generate system behavior suggestions based on intent and urgency.
     */
    private suggestBehavior;
}
export declare function getIntentClassifier(): IntentClassifier;
//# sourceMappingURL=IntentClassifier.d.ts.map