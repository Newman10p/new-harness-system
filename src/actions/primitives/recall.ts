// ─── recall ───────────────────────────────────────────
// Retrieves relevant memories based on a keyword query. Searches
// memory/long-term.md, memory/user-profile.md, and memory/context.md.
// Results are scored by keyword overlap * confidence * recency.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const ROOT = process.cwd();

const VALID_CATEGORIES = ["preference", "fact", "pattern", "instruction", "relationship"];

interface MemoryEntry {
  id: string;
  fact: string;
  category: string;
  confidence: number;
  tags: string[];
  expires: string | null;
  created: string;
  updated: string;
}

interface RecallResult {
  query: string;
  memories: Array<{
    fact: string;
    category: string;
    confidence: number;
    score: number;
    source: string;
  }>;
  total_found: number;
}

function parseMemoryFile(content: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  const regex = /<--\s*memory:(\w+)\s*-->([\s\S]*?)<--\s*\/memory:\1\s*-->/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    try {
      entries.push(JSON.parse(match[2].trim()) as MemoryEntry);
    } catch {
      // Skip malformed entries
    }
  }
  return entries;
}

function isExpired(entry: MemoryEntry): boolean {
  if (!entry.expires) return false;
  return new Date(entry.expires) < new Date();
}

function scoreMemory(query: string, entry: MemoryEntry): number {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (queryTerms.length === 0) return 0;

  const factLower = entry.fact.toLowerCase();
  const tagsLower = entry.tags.join(" ").toLowerCase();
  const combined = `${factLower} ${tagsLower}`;

  let matches = 0;
  for (const term of queryTerms) {
    if (combined.includes(term)) matches++;
  }

  // Keyword overlap (0-1)
  const keywordScore = matches / queryTerms.length;

  // Recency bonus (0-1, decays over 30 days)
  const ageMs = Date.now() - new Date(entry.updated).getTime();
  const recency = Math.max(0, 1 - ageMs / (30 * 24 * 60 * 60 * 1000));

  return keywordScore * entry.confidence * (0.6 + 0.4 * recency);
}

async function searchMarkdownFile(
  filePath: string,
  query: string,
  maxResults: number
): Promise<Array<{ fact: string; category: string; confidence: number; score: number; source: string }>> {
  const results: Array<{ fact: string; category: string; confidence: number; score: number; source: string }> = [];

  try {
    const content = await fs.readFile(filePath, "utf-8");
    if (!content.trim()) return results;

    const entries = parseMemoryFile(content);
    const scored = entries
      .map((e) => ({ entry: e, score: scoreMemory(query, e) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    for (const s of scored) {
      results.push({
        fact: s.entry.fact,
        category: s.entry.category,
        confidence: s.entry.confidence,
        score: Math.round(s.score * 1000) / 1000,
        source: path.relative(ROOT, filePath),
      });
    }
  } catch {
    // File doesn't exist
  }

  return results;
}

export async function recall(
  action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
  const query = String(action.query ?? "").trim();
  const category = String(action.category ?? "").trim();
  const maxResults = Number(action.max_results ?? 5);
  const includeExpired = Boolean(action.include_expired ?? false);

  if (!query) {
    return { ok: false, error: "Missing required field: query" };
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return { ok: false, error: `Invalid category: ${category}. Valid: ${VALID_CATEGORIES.join(", ")}` };
  }

  // Search memory files
  const files = [
    path.join(ROOT, "memory", "long-term.md"),
    path.join(ROOT, "memory", "user-profile.md"),
    path.join(ROOT, "memory", "context.md"),
  ];

  const allResults: Array<{ fact: string; category: string; confidence: number; score: number; source: string }> = [];

  for (const file of files) {
    const results = await searchMarkdownFile(file, query, maxResults);
    allResults.push(...results);
  }

  // Filter by category if specified
  const filtered = category
    ? allResults.filter((r) => r.category === category)
    : allResults;

  // Deduplicate by fact text
  const seen = new Set<string>();
  const deduped: typeof filtered = [];
  for (const r of filtered) {
    const key = r.fact.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  // Sort by score and take top N
  const final = deduped
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  const result: RecallResult = {
    query,
    memories: final,
    total_found: deduped.length,
  };

  return { ok: true, data: result };
}
