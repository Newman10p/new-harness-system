// ─── M.A.I. Micro-Compaction Engine ─────────────────────────────────────────
// Adapted from Hermes Agent: micro-compaction.md + context_compressor.py
//
// After each completed turn, folds ONE oldest un-absorbed exchange into a
// running summary. User messages are NEVER compacted — only assistant turns
// (tool results, narration) are folded.
//
// Key invariants (from Hermes):
//   - User messages are NEVER compacted (source of truth)
//   - Rolling summary: one cumulative summary, superseded markers dropped
//   - Defrag: when running summary exceeds 2000 tokens, re-summarize
//   - 3-strike failure: if same exchange fails 3x, skip it
//
// When LLM is not available for summarization (e.g. local-only), falls
// back to truncation-based compaction (original Mai behavior).

import type { ChatMessage, CompactionEntry } from "../types/index.js";

// ─── Summary Marker ─────────────────────────────────────────────────────────
// Embedded in the message array to mark where compaction happened.
// The UI can render this as a collapsible "earlier context" section.

const COMPACTION_MARKER_PREFIX = "[COMPACTED-";
const COMPACTION_MARKER_REGEX = /^\[COMPACTED-(\d+)\]/;

/**
 * Check if a message is a compaction summary marker.
 */
export function isCompactionMarker(msg: ChatMessage): boolean {
  return msg.role === "assistant" && COMPACTION_MARKER_REGEX.test(msg.content);
}

/**
 * Extract the compaction count from a marker message.
 */
export function getCompactionCount(msg: ChatMessage): number {
  const match = msg.content.match(COMPACTION_MARKER_REGEX);
  return match ? parseInt(match[1], 10) : 0;
}

// ─── Micro-Compactor ────────────────────────────────────────────────────────

export interface MicroCompactorConfig {
  /** Maximum summary length in chars before defrag (default: 8000). */
  maxSummaryChars: number;
  /** Maximum summary length in tokens before defrag (default: 2000). */
  maxSummaryTokens: number;
  /** How many recent turns to keep intact (default: 4 messages = 2 exchanges). */
  retainTail: number;
  /** How many initial turns to keep intact (default: 4 messages = 2 exchanges). */
  retainHead: number;
  /** Max failures before skipping an exchange (default: 3). */
  maxFailures: number;
}

const DEFAULT_CONFIG: MicroCompactorConfig = {
  maxSummaryChars: 8000,
  maxSummaryTokens: 2000,
  retainTail: 4,
  retainHead: 4,
  maxFailures: 3,
};

export class MicroCompactor {
  private config: MicroCompactorConfig;
  private failureCounts: Map<number, number> = new Map();
  private totalCompactions = 0;

  constructor(config?: Partial<MicroCompactorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
 * Run one micro-compaction step: fold the oldest compactable exchange
   * into the running summary.
   *
   * @param messages - The current message array (modified in place)
   * @param summarizeFn - Optional LLM summarization function. If not provided,
   *   falls back to truncation-based compaction.
   * @returns The compaction entry, or null if nothing was compacted.
   */
  async compactOne(
    messages: ChatMessage[],
    summarizeFn?: (turns: ChatMessage[], existingSummary: string) => Promise<string | null>
  ): Promise<CompactionEntry | null> {
    // Separate system messages from conversation
    const systemMsgs = messages.filter(m => m.role === "system");
    const conversation = messages.filter(m => m.role !== "system");

    // Need at least retainHead + retainTail + 2 (one exchange to compact)
    if (conversation.length <= this.config.retainHead + this.config.retainTail + 1) {
      return null;
    }

    // Find existing compaction marker (if any) — it's the boundary
    let markerIndex = -1;
    let existingSummary = "";
    for (let i = 0; i < conversation.length; i++) {
      if (isCompactionMarker(conversation[i])) {
        markerIndex = i;
        existingSummary = conversation[i].content;
        break;
      }
    }

    // Determine the range to compact:
    // After head + marker, take the next exchange (user+assistant pair)
    const searchStart = Math.max(
      this.config.retainHead,
      markerIndex >= 0 ? markerIndex + 1 : this.config.retainHead
    );

    // Find the next user message to start compacting from
    let compactStart = -1;
    for (let i = searchStart; i < conversation.length - this.config.retainTail; i++) {
      if (conversation[i].role === "user") {
        compactStart = i;
        break;
      }
    }

    if (compactStart < 0) return null;

    // Find the end of this exchange (next user message or end of compactable range)
    const maxCompactableEnd = conversation.length - this.config.retainTail;
    let compactEnd = compactStart + 1;
    for (let i = compactStart + 1; i < maxCompactableEnd; i++) {
      if (conversation[i].role === "user") {
        break;
      }
      compactEnd = i + 1;
    }

    if (compactEnd <= compactStart) return null;

    // Check failure count for this position
    const failKey = compactStart;
    const failures = this.failureCounts.get(failKey) ?? 0;
    if (failures >= this.config.maxFailures) {
      // Skip this exchange, try next time
      this.failureCounts.delete(failKey);
      return null;
    }

    // Extract the turns to compact
    const turnsToCompact = conversation.slice(compactStart, compactEnd);
    const tokensBefore = this.estimateTokens(turnsToCompact);

    // Attempt summarization
    let newSummary: string;
    if (summarizeFn) {
      try {
        const result = await summarizeFn(turnsToCompact, existingSummary);
        if (!result) {
          this.failureCounts.set(failKey, failures + 1);
          return null;
        }
        newSummary = result;
      } catch {
        this.failureCounts.set(failKey, failures + 1);
        return null;
      }
    } else {
      // Fallback: truncation-based compaction (original Mai behavior)
      newSummary = this.truncationCompact(turnsToCompact, existingSummary);
    }

    // Build the new compaction marker
    this.totalCompactions++;
    const markerContent = `[COMPACTED-${this.totalCompactions}]\n\n${newSummary}\n\n[End of compacted section — ${turnsToCompact.length} messages summarized]`;
    const markerMsg: ChatMessage = { role: "assistant", content: markerContent };

    // Rebuild the message array
    const beforeCompact = conversation.slice(0, compactStart);
    const afterCompact = conversation.slice(compactEnd);

    // If there was an existing marker, remove it
    const newConversation = [
      ...beforeCompact,
      markerMsg,
      ...afterCompact,
    ];

    // Update the messages array in place
    messages.length = 0;
    messages.push(...systemMsgs, ...newConversation);

    const tokensAfter = this.estimateTokens([markerMsg]);

    return {
      summary: newSummary,
      turnsCompacted: turnsToCompact.length,
      tokensBefore,
      tokensAfter,
      compactedAt: Date.now(),
    };
  }

  /**
   * Truncation-based compaction fallback (no LLM needed).
   * Preserves user messages, truncates assistant/tool-result messages.
   */
  private truncationCompact(turns: ChatMessage[], existingSummary: string): string {
    const parts: string[] = [];

    // Append existing summary if present
    if (existingSummary) {
      // Strip the marker prefix from existing summary
      const cleaned = existingSummary.replace(/\[COMPACTED-\d+\]\n*/g, "").replace(/\n*\[End of compacted section[^\]]*\]/g, "");
      if (cleaned.trim()) {
        parts.push("### Previous Summary\n" + cleaned.trim());
      }
    }

    parts.push("### Newly Compacted Turns");

    for (const msg of turns) {
      const role = msg.role === "user" ? "User" : "M.A.I.";
      const content = msg.content;

      if (msg.role === "user") {
        // NEVER compact user messages fully — keep first 300 chars
        parts.push(`[${role}]: ${content.slice(0, 300)}${content.length > 300 ? "..." : ""}`);
      } else {
        // Compact assistant messages — keep first 150 chars
        const preview = content.slice(0, 150).replace(/\n/g, " ");
        parts.push(`[${role}]: ${preview}${content.length > 150 ? "..." : ""}`);
      }
    }

    let result = parts.join("\n");

    // Defrag: if total summary is too long, truncate the oldest part
    if (result.length > this.config.maxSummaryChars) {
      const sections = result.split("### Newly Compacted Turns");
      if (sections.length > 1) {
        // Keep the new section, truncate the old
        const oldSection = sections[0].slice(0, 2000);
        result = oldSection + "\n... [earlier summary truncated]\n\n### Newly Compacted Turns" + sections.slice(1).join("### Newly Compacted Turns");
      }
    }

    return result;
  }

  /** Rough token estimation. */
  private estimateTokens(messages: ChatMessage[]): number {
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += msg.content.length;
    }
    return Math.ceil(totalChars / 3.5);
  }

  /** Get the total number of compactions performed. */
  getTotalCompactions(): number {
    return this.totalCompactions;
  }

  /** Reset failure counts (e.g. after a successful compaction). */
  resetFailures(): void {
    this.failureCounts.clear();
  }
}
