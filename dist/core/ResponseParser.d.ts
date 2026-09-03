import type { Action, ParsedResponse, ActionResult } from "../types/index.js";
export declare class ResponseParser {
    /**
     * Parse a raw LLM response string into structured text + actions.
     *
     * - Extracts all ```action blocks as JSON actions
     * - Strips ALL code fences from the remaining text (reduces noise)
     * - Counts malformed blocks for debugging
     */
    static parseResponse(raw: string): ParsedResponse;
    /**
     * Format an action result into a compact string suitable for
     * injecting back into the conversation as assistant context.
     * Truncates to 2000 characters to prevent context bloat.
     */
    static formatActionResult(action: Action, result: ActionResult): string;
}
//# sourceMappingURL=ResponseParser.d.ts.map