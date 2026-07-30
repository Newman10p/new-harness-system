// ─── M.A.I. Conversation Index ────────────────────────────────────
// Indexes chat history with timestamp, intent, and summary metadata.
// Supports full-text search, date range filtering, and markdown export.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const INDEX_FILE = path.resolve(process.cwd(), "memory", "conversation-index.json");
const MAX_ENTRIES = 10000;

// ─── Types ─────────────────────────────────────────────────────────────

export type IntentType =
  | "question"
  | "command"
  | "conversation"
  | "action_request"
  | "proactive"
  | "system"
  | "unknown";

export interface ConversationEntry {
  /** Unique ID */
  id: string;
  /** User's message */
  userMessage: string;
  /** Assistant's response */
  assistantResponse: string;
  /** Classified intent */
  intent: IntentType;
  /** Short summary (auto-generated or provided) */
  summary: string;
  /** Unix timestamp */
  timestamp: number;
  /** Optional metadata */
  metadata: {
    /** Extracted keywords */
    keywords: string[];
    /** Session ID if available */
    sessionId?: string;
    /** Macro that was triggered, if any */
    macroId?: string;
    /** Custom metadata fields */
    [key: string]: unknown;
  };
  /** Whether this entry has been compacted (summarized) */
  compacted: boolean;
}

export interface SearchFilters {
  /** Full-text search query */
  query?: string;
  /** Filter by intent type */
  intent?: IntentType;
  /** Minimum timestamp (inclusive) */
  from?: number;
  /** Maximum timestamp (inclusive) */
  to?: number;
  /** Filter by keyword (any match) */
  keywords?: string[];
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

export interface IndexStats {
  totalEntries: number;
  compactedEntries: number;
  dateRange: {
    earliest: number | null;
    latest: number | null;
  };
  intentBreakdown: Record<IntentType, number>;
  averageResponseLength: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomBytes(8).toString("hex");
}

/** Extract simple keywords from text (stop words removed) */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "out", "off", "over",
    "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own",
    "same", "so", "than", "too", "very", "just", "because", "but", "and",
    "or", "if", "while", "about", "up", "that", "this", "it", "i", "me",
    "my", "we", "you", "your", "he", "she", "they", "them", "what",
    "which", "who", "whom", "these", "those", "am", "s", "t", "d", "ll",
    "ve", "re", "m", "don", "doesn", "didn", "won", "wouldn", "shouldn",
    "couldn", "isn", "aren", "wasn", "weren", "hasn", "haven", "hadn",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 20);
}

/** Simple intent classifier based on heuristics */
function classifyIntent(userMessage: string): IntentType {
  const msg = userMessage.trim().toLowerCase();

  // Command patterns: starts with verb, imperative
  if (/^(run|execute|start|stop|restart|create|delete|remove|add|set|get|open|close|send|deploy|build|test|check|list|show|hide|enable|disable|toggle|install|update|upgrade|download|upload|copy|move|rename|search|find|grep|kill|restart|clear|reset)\b/.test(msg)) {
    return "command";
  }

  // Action request: asks M.A.I. to do something
  if (/^(can you|could you|please|will you|would you|help me|make|let|tell|ask|notify|remind|schedule)/.test(msg)) {
    return "action_request";
  }

  // Question patterns
  if (/^(what|who|where|when|why|how|is|are|do|does|can|will|would|could|should|has|have|did)\b|\?$/.test(msg)) {
    return "question";
  }

  // Very short messages tend to be conversational
  if (msg.length < 20 && !msg.includes(".")) {
    return "conversation";
  }

  return "unknown";
}

/** Generate a brief summary of a conversation exchange */
function generateSummary(userMsg: string, assistantResp: string): string {
  const userShort = userMsg.length > 80 ? userMsg.slice(0, 77) + "..." : userMsg;
  return `Q: ${userShort}`;
}

// ─── Conversation Index Class ─────────────────────────────────────────

export class ConversationIndex {
  private entries: ConversationEntry[] = [];
  private dirty = false;
  private initialized = false;

  /** Ensure the memory directory and index file exist */
  private ensureStorage(): void {
    const dir = path.dirname(INDEX_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(INDEX_FILE)) {
      fs.writeFileSync(INDEX_FILE, JSON.stringify([], null, 2), "utf-8");
    }
  }

  /** Load the index from disk */
 private load(): void {
    if (this.initialized) return;
    this.ensureStorage();
    try {
      const raw = fs.readFileSync(INDEX_FILE, "utf-8");
      this.entries = JSON.parse(raw) as ConversationEntry[];
    } catch {
      this.entries = [];
    }
    this.initialized = true;
  }

  /** Persist the index to disk if dirty */
  private save(): void {
    if (!this.dirty) return;
    this.ensureStorage();
    try {
      fs.writeFileSync(INDEX_FILE, JSON.stringify(this.entries, null, 2), "utf-8");
      this.dirty = false;
    } catch {
      // Disk write failed — data stays in memory
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /**
   * Index a conversation exchange.
   * @param userMessage - The user's input
   * @param assistantResponse - The assistant's reply
   * @param metadata - Optional extra metadata (sessionId, macroId, etc.)
   */
  addEntry(
    userMessage: string,
    assistantResponse: string,
    metadata?: Partial<ConversationEntry["metadata"]>
  ): ConversationEntry {
    this.load();

    const entry: ConversationEntry = {
      id: generateId(),
      userMessage,
      assistantResponse,
      intent: classifyIntent(userMessage),
      summary: generateSummary(userMessage, assistantResponse),
      timestamp: Date.now(),
      metadata: {
        keywords: extractKeywords(userMessage + " " + assistantResponse),
        ...metadata,
      },
      compacted: false,
    };

    this.entries.push(entry);

    // Trim if over max
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }

    this.dirty = true;
    this.save();
    return entry;
  }

  /**
   * Search the conversation index.
   * @param filters - Search criteria
   * @returns Matching entries sorted by timestamp (newest first)
   */
  search(filters: SearchFilters = {}): ConversationEntry[] {
    this.load();
    let results = [...this.entries];

    // Full-text query search (case-insensitive)
    if (filters.query) {
      const q = filters.query.toLowerCase();
      results = results.filter(
        (e) =>
          e.userMessage.toLowerCase().includes(q) ||
          e.assistantResponse.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q)
      );
    }

    // Intent filter
    if (filters.intent) {
      results = results.filter((e) => e.intent === filters.intent);
    }

    // Keyword filter (any match)
    if (filters.keywords && filters.keywords.length > 0) {
      const kwSet = new Set(filters.keywords.map((k) => k.toLowerCase()));
      results = results.filter((e) =>
        e.metadata.keywords.some((k) => kwSet.has(k.toLowerCase()))
      );
    }

    // Date range
    if (filters.from) {
      results = results.filter((e) => e.timestamp >= filters.from!);
    }
    if (filters.to) {
      results = results.filter((e) => e.timestamp <= filters.to!);
    }

    // Sort newest first
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    return results.slice(offset, offset + limit);
  }

  /** Get the most recent N conversation entries */
  getRecent(count: number = 20): ConversationEntry[] {
    return this.search({ limit: count });
  }

  /** Get entries within a date range */
  getByDateRange(from: number, to: number): ConversationEntry[] {
    return this.search({ from, to, limit: 1000 });
  }

  /** Get a single entry by ID */
  getById(id: string): ConversationEntry | undefined {
    this.load();
    return this.entries.find((e) => e.id === id);
  }

  /** Get index statistics */
  getStats(): IndexStats {
    this.load();
    const entries = this.entries;
    const compacted = entries.filter((e) => e.compacted).length;

    const intentBreakdown: Record<IntentType, number> = {
      question: 0,
      command: 0,
      conversation: 0,
      action_request: 0,
      proactive: 0,
      system: 0,
      unknown: 0,
    };

    let totalRespLen = 0;
    for (const e of entries) {
      intentBreakdown[e.intent] = (intentBreakdown[e.intent] || 0) + 1;
      totalRespLen += e.assistantResponse.length;
    }

    const timestamps = entries.map((e) => e.timestamp);

    return {
      totalEntries: entries.length,
      compactedEntries: compacted,
      dateRange: {
        earliest: timestamps.length > 0 ? Math.min(...timestamps) : null,
        latest: timestamps.length > 0 ? Math.max(...timestamps) : null,
      },
      intentBreakdown,
      averageResponseLength:
        entries.length > 0 ? Math.round(totalRespLen / entries.length) : 0,
    };
  }

  /**
   * Export conversations as markdown.
   * @param from - Optional start timestamp
   * @param to - Optional end timestamp
   * @returns Markdown string of conversations
   */
  exportMarkdown(from?: number, to?: number): string {
    const entries = this.getByDateRange(
      from || 0,
      to || Date.now()
    );

    // Reverse to chronological order for export
    const chronological = [...entries].reverse();

    const lines: string[] = [];
    lines.push("# M.A.I. Conversation History\n");
    lines.push(
      `Exported ${new Date().toISOString()} — ${chronological.length} entries\n`
    );
    lines.push("---\n");

    let lastDate = "";
    for (const entry of chronological) {
      const d = new Date(entry.timestamp).toLocaleDateString();
      if (d !== lastDate) {
        lines.push(`\n## ${d}\n`);
        lastDate = d;
      }

      const time = new Date(entry.timestamp).toLocaleTimeString();
      lines.push(`### ${time} [${entry.intent}]\n`);
      lines.push(`**User:** ${entry.userMessage}\n`);
      lines.push(`**M.A.I.:** ${entry.assistantResponse}\n`);
      if (entry.metadata.keywords.length > 0) {
        lines.push(`*Keywords: ${entry.metadata.keywords.join(", ")}*\n`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Compact old entries by summarizing them.
   * Entries older than `maxAge` ms get their responses trimmed and marked as compacted.
   * @param maxAge - Maximum age in ms for non-compacted entries (default: 7 days)
   * @returns Number of entries compacted
   */
  compact(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
    this.load();
    const cutoff = Date.now() - maxAge;
    let compacted = 0;

    for (const entry of this.entries) {
      if (entry.compacted || entry.timestamp >= cutoff) continue;

      // Summarize: keep summary, trim response to first 200 chars
      entry.assistantResponse =
        entry.assistantResponse.length > 200
          ? entry.assistantResponse.slice(0, 197) + "..."
          : entry.assistantResponse;
      entry.userMessage =
        entry.userMessage.length > 200
          ? entry.userMessage.slice(0, 197) + "..."
          : entry.userMessage;
      entry.compacted = true;
      compacted++;
    }

    if (compacted > 0) {
      this.dirty = true;
      this.save();
    }

    return compacted;
  }

  /**
   * Delete an entry by ID.
   * @returns true if the entry was found and deleted
   */
  deleteEntry(id: string): boolean {
    this.load();
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    this.dirty = true;
    this.save();
    return true;
  }

  /** Clear all entries */
  clear(): void {
    this.entries = [];
    this.dirty = true;
    this.save();
  }

  /** Force reload from disk */
  refresh(): void {
    this.initialized = false;
    this.load();
  }
}

/** Singleton instance for convenience */
export const conversationIndex = new ConversationIndex();
