// ─── semantic-recall ──────────────────────────────────────────────────
// Searches memory/context files for relevant information.
// Primary: embedding-based cosine similarity search.
// Fallback: keyword/TF matching when embeddings are unavailable.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";
import { EmbeddingStore } from "../../memory/EmbeddingStore.js";

interface RecallResult {
  query: string;
  sources: RecallSource[];
  totalMatches: number;
  mode: "semantic" | "keyword" | "hybrid";
  note?: string;
}

interface RecallSource {
  file: string;
  sections: RecallSection[];
}

interface RecallSection {
  heading: string;
  content: string;
  score: number;
}

// Files to search for memory/context (used in keyword fallback and reindex)
const MEMORY_FILES = [
  "memory/context.md",
  "state/inbox.md",
  "memory/notes.md",
  "memory/long-term.md",
];

/**
 * Simple keyword-based relevance scoring.
 * Splits query into terms and scores each section by term frequency.
 */
function scoreSection(query: string, heading: string, content: string): number {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (queryTerms.length === 0) return 0;

  const headingLower = heading.toLowerCase();
  const contentLower = content.toLowerCase();
  let score = 0;

  for (const term of queryTerms) {
    // Heading matches are worth more
    const headingCount = (headingLower.match(new RegExp(escapeRegex(term), "g")) || []).length;
    score += headingCount * 3;

    // Content matches
    const contentCount = (contentLower.match(new RegExp(escapeRegex(term), "g")) || []).length;
    score += contentCount;
  }

  return score;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits a markdown file into sections by ## headings.
 * Returns an array of { heading, content } objects.
 */
function splitIntoSections(markdown: string): RecallSection[] {
  const lines = markdown.split("\n");
  const sections: RecallSection[] = [];
  let currentHeading = "(top)";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line.trim())) {
      // Save previous section if it has content
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join("\n").trim(),
          score: 0,
        });
      }
      currentHeading = line.trim().replace(/^#{1,3}\s+/, "");
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Don't forget the last section
  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join("\n").trim(),
      score: 0,
    });
  }

  return sections;
}

/**
 * Keyword-only search across memory files (original behavior).
 */
async function keywordSearch(query: string, rootDir: string): Promise<{ sources: RecallSource[]; totalMatches: number }> {
  const results: RecallSource[] = [];
  let totalMatches = 0;

  for (const relPath of MEMORY_FILES) {
    const fullPath = path.join(rootDir, relPath);

    let content: string;
    try {
      content = await fs.readFile(fullPath, "utf-8");
    } catch {
      continue;
    }

    if (!content.trim()) continue;

    const sections = splitIntoSections(content);

    for (const section of sections) {
      section.score = scoreSection(query, section.heading, section.content);
    }

    const matches = sections
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (matches.length > 0) {
      totalMatches += matches.length;
      results.push({
        file: relPath,
        sections: matches,
      });
    }
  }

  return { sources: results, totalMatches };
}

/**
 * Reindex: read all memory files and add their sections to the embedding store.
 */
async function reindexStore(store: EmbeddingStore, rootDir: string): Promise<number> {
  let indexed = 0;

  for (const relPath of MEMORY_FILES) {
    const fullPath = path.join(rootDir, relPath);

    let content: string;
    try {
      content = await fs.readFile(fullPath, "utf-8");
    } catch {
      continue;
    }

    if (!content.trim()) continue;

    const sections = splitIntoSections(content);
    const source = relPath.startsWith("memory/") ? "memory" as const
      : relPath.startsWith("inbox") ? "inbox" as const
      : "context" as const;

    for (const section of sections) {
      if (section.content.length < 10) continue; // Skip very short sections

      const id = await store.add(section.content, source, {
        file: relPath,
        tags: [section.heading].filter((h) => h !== "(top)"),
      });

      if (id) indexed++;
    }
  }

  return indexed;
}

export async function semanticRecall(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const query = String(action.query ?? "").trim();
  const forceKeyword = Boolean(action.force_keyword ?? false);
  const reindex = Boolean(action.reindex ?? false);
  const topK = typeof action.top_k === "number" ? Math.max(1, Math.min(action.top_k, 20)) : 5;

  if (!query && !reindex) {
    return { ok: false, error: "Missing required field: query" };
  }

  const rootDir = process.cwd();
  const store = new EmbeddingStore({ rootDir });

  // ── Reindex mode ─────────────────────────────────────────────────────
  if (reindex) {
    const indexed = await reindexStore(store, rootDir);
    return {
      ok: true,
      data: {
        query: query || "(reindex)",
        sources: [],
        totalMatches: 0,
        mode: "semantic",
        note: `Reindex complete. ${indexed} sections embedded into the store. ${await store.size()} total entries.`,
      } satisfies RecallResult,
    };
  }

  // ── Force keyword mode ───────────────────────────────────────────────
  if (forceKeyword) {
    const { sources, totalMatches } = await keywordSearch(query, rootDir);
    return {
      ok: true,
      data: {
        query,
        sources,
        totalMatches,
        mode: "keyword",
        note:
          totalMatches === 0
            ? "No relevant sections found (keyword mode). Try different keywords."
            : "Results ranked by keyword relevance (force_keyword=true).",
      } satisfies RecallResult,
    };
  }

  // ── Semantic search (primary) ────────────────────────────────────────
  try {
    const storeSize = await store.size();

    if (storeSize > 0) {
      // Embedding store has data — do semantic search
      const results = await store.search(query, topK);

      if (results.length > 0) {
        // Convert embedding results into the RecallSource format
        const sources: RecallSource[] = [];

        for (const r of results) {
          sources.push({
            file: r.metadata.file ?? `embedding-store://${r.source}`,
            sections: [{
              heading: r.metadata.tags?.join(", ") ?? `(${r.source})`,
              content: r.content,
              score: Math.round(r.score * 1000) / 1000, // 3 decimal places
            }],
          });
        }

        return {
          ok: true,
          data: {
            query,
            sources,
            totalMatches: results.length,
            mode: "semantic",
            note: `Embedding-based semantic search. Top ${results.length} of ${storeSize} entries. Score is cosine similarity (0-1).`,
          } satisfies RecallResult,
        };
      }

      // Embedding search returned nothing — fall through to keyword
      const { sources, totalMatches } = await keywordSearch(query, rootDir);
      return {
        ok: true,
        data: {
          query,
          sources,
          totalMatches,
          mode: "hybrid",
          note: totalMatches > 0
            ? "Semantic search found no close matches. Showing keyword fallback results."
            : "No results from semantic or keyword search. The embedding store has data but no matches for this query.",
        } satisfies RecallResult,
      };
    }

    // Store is empty — fall through to keyword search
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[semantic-recall] Embedding search failed, falling back to keyword: ${message}`);
  }

  // ── Keyword fallback ─────────────────────────────────────────────────
  const { sources, totalMatches } = await keywordSearch(query, rootDir);

  await ctx.audit({
    type: "action_executed",
    action: "semantic-recall",
    detail: `keyword fallback, ${totalMatches} matches`,
    ok: true,
  });

  return {
    ok: true,
    data: {
      query,
      sources,
      totalMatches,
      mode: "keyword",
      note: totalMatches === 0
        ? "No relevant sections found. The embedding store is empty — run with reindex=true to build the index, or try different keywords."
        : "Keyword results shown. Embedding store is empty — run with reindex=true for true semantic search.",
    } satisfies RecallResult,
  };
}
