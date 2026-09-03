"use strict";
// ─── M.A.I. Intent Classifier ─────────────────────────────────────────
// Pre-processes user input to classify intent before sending to the LLM.
// Uses keyword/pattern matching (no ML) for fast, deterministic results.
// Provides urgency detection, entity extraction, and behavior suggestions.
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentClassifier = void 0;
exports.getIntentClassifier = getIntentClassifier;
const RULES = [
    {
        type: "emergency",
        patterns: [
            /^\s*(stop|cancel|abort|halt|kill|emergency|shut down)\b/i,
            /\b(stop everything|cancel all|abort now)\b/i,
        ],
        boostKeywords: ["urgent", "now", "immediately", "asap", "right now"],
        baseConfidence: 0.9,
    },
    {
        type: "preference",
        patterns: [
            /\b(remember|always|never|prefer|don'?t|don't|please)\s+(i|to|my|we|the)/i,
            /\b(from now on|in the future|going forward)\b/i,
            /\b(my (preference|style|format|setting))\b/i,
        ],
        boostKeywords: ["remember", "prefer", "always", "never", "default", "setting"],
        baseConfidence: 0.8,
    },
    {
        type: "correction",
        patterns: [
            /^\s*(no|nope|nah|wrong|not that)\b/i,
            /\b(i meant|what i (really )?meant|that'?s not|that is not)\b/i,
            /\b(actually|instead|rather|correction)\b/i,
            /\b(not the .+ but)\b/i,
        ],
        boostKeywords: ["wrong", "not that", "i meant", "correction", "actually"],
        baseConfidence: 0.85,
    },
    {
        type: "complaint",
        patterns: [
            /\b(that (didn'?t|did not) work|that failed|still (not )?working|broke|broken)\b/i,
            /\b(why (can'?t|does(n'?t| not))|this is (wrong|bad|broken|slow|terrible))\b/i,
            /\b(fix this|this sucks|annoying|frustrating)\b/i,
        ],
        boostKeywords: ["fix", "wrong", "broken", "error", "failed", "bug"],
        baseConfidence: 0.8,
    },
    {
        type: "self_improvement",
        patterns: [
            /\b(why do you keep|why (does|do) (it|you)|what'?s wrong with)\b/i,
            /\b(you (always|keep|never)|learn to|improve|better)\b/i,
            /\b(your (mistake|error|fault|problem))\b/i,
        ],
        boostKeywords: ["improve", "learn", "mistake", "pattern", "better"],
        baseConfidence: 0.75,
    },
    {
        type: "question",
        patterns: [
            /\?/,
            /^\s*(what|who|when|where|why|how|is|are|can|do|does|will|would|should|could)\b/i,
        ],
        boostKeywords: ["?", "what", "how", "why", "explain", "tell me"],
        baseConfidence: 0.7,
    },
    {
        type: "command",
        patterns: [
            /^\s*(list|show|get|find|search|run|execute|start|stop|open|close|create|delete|remove|move|copy|rename|install|uninstall|build|test|deploy|check|monitor)\b/i,
        ],
        boostKeywords: ["do", "make", "run", "execute", "create", "delete", "list"],
        baseConfidence: 0.75,
    },
    {
        type: "complex_task",
        patterns: [
            /\b(set up|configure|implement|build|create)\b.*\b(and|then|also|plus)\b/i,
            /\b(from scratch|end.?to.?end|full|complete)\b/i,
        ],
        boostKeywords: ["and then", "also", "plus", "multiple", "several", "complete"],
        baseConfidence: 0.7,
    },
    {
        type: "observation",
        patterns: [
            /^\s*(it|that|this|the|there|here)\s+(is|was|seems|looks|feels|appears)\b/i,
            /^\s*(i (notice|see|think|feel|believe|guess))\b/i,
        ],
        boostKeywords: ["notice", "seems", "looks like", "interesting"],
        baseConfidence: 0.65,
    },
    {
        type: "casual",
        patterns: [
            /^\s*(hey|hi|hello|yo|sup|what'?s up|good (morning|afternoon|evening|night))\b/i,
            /^\s*(thanks|thank you|thx|cheers|nice|cool|great|awesome)\b/i,
        ],
        boostKeywords: ["hey", "hi", "hello", "thanks", "bye"],
        baseConfidence: 0.8,
    },
];
// ─── Entity Extraction Patterns ─────────────────────────────────────────────
const ENTITY_PATTERNS = [
    {
        type: "filepath",
        pattern: /(?:[\/~][\w\-./]+\.[\w]+)|(?:[A-Za-z]:\\[\w\\\-./]+\.[\w]+)/g,
    },
    {
        type: "url",
        pattern: /https?:\/\/[\w\-._~:/?#@!$&'()*+,;=%]+/g,
    },
    {
        type: "email",
        pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g,
    },
    {
        type: "number",
        pattern: /\b\d+(?:\.\d+)?\b/g,
    },
    {
        type: "port",
        pattern: /\bport\s*(?:=|:)?\s*(\d{1,5})\b/gi,
    },
    {
        type: "ip_address",
        pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    },
    {
        type: "hex_color",
        pattern: /#(?:[0-9a-fA-F]{3}){1,2}\b/g,
    },
    {
        type: "semver",
        pattern: /\bv?\d+\.\d+\.\d+(?:-[\w.]+)?\b/g,
    },
];
// ─── Urgency Keywords ───────────────────────────────────────────────────────
const URGENCY_CRITICAL = ["emergency", "critical", "urgent", "now!", "asap!", "immediately"];
const URGENCY_HIGH = ["urgent", "asap", "hurry", "quick", "fast", "important", "priority"];
const URGENCY_LOW = ["when you get a chance", "no rush", "eventually", "sometime", "low priority"];
// ─── Classifier ─────────────────────────────────────────────────────────────
class IntentClassifier {
    // ─── Public API ────────────────────────────────────────────────────────
    /**
     * Classify a user input string and return the full intent result.
     * Never throws — returns a safe default on any error.
     */
    classify(input) {
        try {
            return this.classifyInternal(input);
        }
        catch {
            return {
                type: "command",
                confidence: 0.3,
                entities: [],
                urgency: "normal",
                requiresClarification: true,
                suggestedSystemBehavior: "Unclear input — ask for clarification",
            };
        }
    }
    /**
     * Quick type-only classification (no entity extraction).
     */
    classifyType(input) {
        const result = this.classify(input);
        return { type: result.type, confidence: result.confidence };
    }
    // ─── Internal Classification ──────────────────────────────────────────
    classifyInternal(input) {
        const trimmed = input.trim();
        if (!trimmed) {
            return this.makeResult("casual", 0.3, [], "normal", false, "Empty input — greet the user");
        }
        // Score each rule
        let bestType = "command";
        let bestScore = 0;
        for (const rule of RULES) {
            let score = 0;
            // Check patterns
            for (const pattern of rule.patterns) {
                pattern.lastIndex = 0;
                if (pattern.test(trimmed)) {
                    score = rule.baseConfidence;
                    break;
                }
            }
            // Boost from keywords
            if (score > 0) {
                const lower = trimmed.toLowerCase();
                for (const kw of rule.boostKeywords) {
                    if (lower.includes(kw.toLowerCase())) {
                        score = Math.min(1.0, score + 0.05);
                    }
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestType = rule.type;
            }
        }
        // Complex task detection: multi-sentence with multiple action words
        if (bestType !== "complex_task" && this.detectComplexTask(trimmed)) {
            if (bestScore < 0.7) {
                bestType = "complex_task";
                bestScore = 0.7;
            }
        }
        // Extract entities
        const entities = this.extractEntities(trimmed);
        // Detect urgency
        const urgency = this.detectUrgency(trimmed);
        // Determine if clarification is needed
        const requiresClarification = this.needsClarification(trimmed, bestType, bestScore);
        // Generate behavior suggestion
        const suggestedSystemBehavior = this.suggestBehavior(bestType, urgency, entities);
        return this.makeResult(bestType, bestScore, entities, urgency, requiresClarification, suggestedSystemBehavior);
    }
    makeResult(type, confidence, entities, urgency, requiresClarification, suggestedSystemBehavior) {
        return { type, confidence, entities, urgency, requiresClarification, suggestedSystemBehavior };
    }
    /**
     * Detect complex multi-step tasks from input structure.
     */
    detectComplexTask(input) {
        const sentences = input.split(/[.!?]+/).filter((s) => s.trim().length > 3);
        if (sentences.length < 2)
            return false;
        const actionWords = [
            "create", "build", "set up", "configure", "install", "deploy",
            "write", "implement", "add", "remove", "update", "migrate",
        ];
        const lower = input.toLowerCase();
        const actionCount = actionWords.filter((w) => lower.includes(w)).length;
        return actionCount >= 2 || sentences.length >= 3;
    }
    /**
     * Extract entities using regex patterns.
     */
    extractEntities(input) {
        const entities = [];
        const seen = new Set();
        for (const { type, pattern } of ENTITY_PATTERNS) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(input)) !== null) {
                const value = match[1] ?? match[0];
                const key = `${type}:${value}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    entities.push({ type, value });
                }
            }
        }
        // Extract quoted strings as names
        const quotedRegex = /["']([^"']+)["']/g;
        let qMatch;
        while ((qMatch = quotedRegex.exec(input)) !== null) {
            entities.push({ type: "quoted_string", value: qMatch[1] });
        }
        // Extract process/command names (common tools)
        const toolRegex = /\b(git|npm|yarn|pnpm|docker|kubectl|ssh|curl|wget|python|node|cargo|go|rustc|gcc|make|cmake|pip|brew|apt|yum)\b/gi;
        let tMatch;
        while ((tMatch = toolRegex.exec(input)) !== null) {
            entities.push({ type: "tool", value: tMatch[1].toLowerCase() });
        }
        return entities;
    }
    /**
     * Detect urgency from input patterns.
     */
    detectUrgency(input) {
        const lower = input.toLowerCase();
        // Critical: caps lock, exclamation, critical keywords
        if ((input === input.toUpperCase() && input.length > 5) ||
            (input.endsWith("!!!") || input.endsWith("!!!")) ||
            URGENCY_CRITICAL.some((k) => lower.includes(k))) {
            return "critical";
        }
        if (URGENCY_HIGH.some((k) => lower.includes(k))) {
            return "high";
        }
        if (URGENCY_LOW.some((k) => lower.includes(k))) {
            return "low";
        }
        return "normal";
    }
    /**
     * Determine if the input needs clarification.
     */
    needsClarification(input, type, confidence) {
        // Low confidence → clarify
        if (confidence < 0.5)
            return true;
        // Very short input (except casual greetings)
        if (input.length < 10 && type !== "casual" && type !== "emergency")
            return true;
        // Ambiguous corrections
        if (type === "correction" && input.length < 15)
            return true;
        return false;
    }
    /**
     * Generate system behavior suggestions based on intent and urgency.
     */
    suggestBehavior(type, urgency, entities) {
        const suggestions = [];
        // Urgency-based suggestions
        switch (urgency) {
            case "critical":
                suggestions.push("Prioritize immediate response, skip non-essential steps");
                break;
            case "high":
                suggestions.push("Respond quickly, minimize preamble");
                break;
            case "low":
                suggestions.push("Take time to provide thorough response");
                break;
        }
        // Type-based suggestions
        switch (type) {
            case "emergency":
                suggestions.push("Immediately halt current operations and confirm");
                break;
            case "correction":
                suggestions.push("Acknowledge the correction, do not repeat the mistake");
                suggestions.push("Update memory with the correct preference");
                break;
            case "preference":
                suggestions.push("Store the preference and confirm understanding");
                suggestions.push("Skip TTS for preference-setting interactions");
                break;
            case "complaint":
                suggestions.push("Show empathy, acknowledge the issue, offer alternatives");
                break;
            case "self_improvement":
                suggestions.push("Reflect on past behavior, provide honest assessment");
                suggestions.push("Trigger self-improvement reflection if appropriate");
                break;
            case "complex_task":
                suggestions.push("Break into numbered steps, confirm plan before executing");
                break;
            case "casual":
                suggestions.push("Keep response brief and warm");
                suggestions.push("Consider using TTS for voice-friendly response");
                break;
            case "question":
                suggestions.push("Provide direct answer first, then context if needed");
                break;
            case "command":
                suggestions.push("Execute directly, report results concisely");
                break;
        }
        // Entity-based suggestions
        if (entities.some((e) => e.type === "filepath")) {
            suggestions.push("Verify file path exists before acting");
        }
        if (entities.some((e) => e.type === "url")) {
            suggestions.push("Validate URL before accessing");
        }
        return suggestions.join(". ");
    }
}
exports.IntentClassifier = IntentClassifier;
// ─── Singleton Accessor ─────────────────────────────────────────────────────
let _instance = null;
function getIntentClassifier() {
    if (!_instance) {
        _instance = new IntentClassifier();
    }
    return _instance;
}
//# sourceMappingURL=IntentClassifier.js.map