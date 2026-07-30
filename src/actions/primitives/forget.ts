// ─── forget ───────────────────────────────────
// Removes a specific memory or clears expired memories from
// memory/long-term.md. Archived entries go to memory/forgotten.md.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const ROOT = process.cwd();
const MEMORY_FILE = path.join(ROOT, "memory", "long-term.md");
const FORGOTTEN_FILE = path.join(ROOT, "memory", "forgotten.md");

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

function parseMemoryFile(content: string): Array<{ entry: MemoryEntry; raw: string }> {
  const results: Array<{ entry: MemoryEntry; raw: string }> = [];
  const regex = /<--\s*memory:(\w+)\s*-->([\s\S]*?)<--\s*\/memory:\1\s*-->/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    try {
      const entry = JSON.parse(match[2].trim()) as MemoryEntry;
      results.push({ entry, raw: match[0] });
    } catch {
      // Skip malformed entries
    }
  }
  return results;
}

function isExpired(entry: MemoryEntry): boolean {
  if (!entry.expires) return false;
  return new Date(entry.expires) < new Date();
}

function matchesQuery(entry: MemoryEntry, query: string, category: string): boolean {
  // Category filter
  if (category && entry.category !== category) return false;

  // Query match (keyword overlap)
  if (!query) return true;

  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (queryTerms.length === 0) return true;

  const factLower = entry.fact.toLowerCase();
  let matches = 0;
  for (const term of queryTerms) {
    if (factLower.includes(term)) matches++;
  }

  return matches > 0;
}

function formatForgotten(entries: MemoryEntry[]): string {
 const header = "# Forgotten Memories\n\n> Archived by the forget primitive. Restorable if needed.\n\n";
  const blocks = entries.map((e) => {
    const archivedAt = new Date().toISOString();
    return `<-- forgotten:${e.id} -->\n${JSON.stringify({ ...e, archived_at: archivedAt }, null, 2)}\n<-- /forgotten:${e.id} -->`;
  });
  return header + blocks.join("\n\n") + "\n";
}

export async function forget(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const query = String(action.query ?? "").trim();
  const category = String(action.category ?? "").trim();
  const clearExpired = Boolean(action.clear_expired ?? false);

  if (!query && !clearExpired) {
    return { ok: false, error: "Must provide 'query' or set clear_expired=true" };
  }

  try {
    await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true });

    const content = await fs.readFile(MEMORY_FILE, "utf-8").catch(() => "");
    const parsed = parseMemoryFile(content);

    // Determine which entries to remove
    const toRemove: Array<{ entry: MemoryEntry; raw: string }> = [];

    for (const { entry, raw } of parsed) {
      if (clearExpired && isExpired(entry)) {
        toRemove.push({ entry, raw });
        continue;
      }
      if (query && matchesQuery(entry, query, category)) {
        toRemove.push({ entry, raw });
      }
    }

    if (toRemove.length === 0) {
      return {
        ok: true,
        data: {
          message: "No memories matched the query",
          removed: 0,
        },
      };
    }

    // Archive to forgotten.md
    const forgottenEntries = toRemove.map((r) => r.entry);
    const forgottenContent = formatForgotten(forgottenEntries);

    // Append to forgotten.md (or create)
    const existingForgotten = await fs.readFile(FORGOTTEN_FILE, "utf-8").catch(() => "");
    await fs.writeFile(FORGOTTEN_FILE, existingForgotten + forgottenContent, "utf-8");

    // Remove from long-term.md
    let newContent = content;
    for (const { raw } of toRemove) {
      newContent = newContent.replace(raw, "");
    }
    // Clean up excess blank lines
    newContent = newContent.replace(/\n{3,}/g, "\n\n").trim();
    await fs.writeFile(MEMORY_FILE, newContent, "utf-8");

    await ctx.audit({
      type: "action_executed",
      action: "forget",
      detail: `Removed ${toRemove.length} memories (query=${query || "(none)"}, clearExpired=${clearExpired})`,
      ok: true,
    });

    return {
      ok: true,
      data: {
        removed: toRemove.length,
        forgotten: forgottenEntries.map((e) => ({
          id: e.id,
          fact: e.fact.slice(0, 80),
          category: e.category,
        })),
        archived_to: FORGOTTEN_FILE,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Forget failed: ${message}` };
  }
}
