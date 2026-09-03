import type { PolicyConfig } from "../types/index.js";
export declare class ContextAssembler {
    /**
     * Build the system prompt from identity + policy body + tools catalog.
     * Policy frontmatter (YAML rules) is NOT included — only the human-readable
     * policy body, so the LLM understands intent, not enforcement mechanics.
     */
    static assembleSystemPrompt(policyConfig?: PolicyConfig): Promise<string>;
    /**
     * Build the user-context payload from inbox + memory files.
     * These provide the LLM with real-time state: recent events,
     * user notes, accumulated context from prior loops.
     */
    static assembleContextPayload(): Promise<string>;
}
//# sourceMappingURL=ContextAssembler.d.ts.map