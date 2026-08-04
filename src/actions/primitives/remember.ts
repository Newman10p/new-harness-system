// ─── remember ──────────────────────────────────────────────────────────
// Stores a fact in long-term memory. Supports categories, confidence scores,
// tags, and optional expiration. If the same fact already exists, it updates
// the confidence (averaged) and refreshes the timestamp.
// Input is sanitized to prevent markdown injection.

import fs from "node:fs/promises";
import path from "node:path";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";
import { EmbeddingStore } from "../../memory/EmbeddingStore.js";

const ROOT = process.cwd();
const MEMORY_FILE = path.join(ROOT, "memory", "long-term.md");

const VALID_CATEGORIES = ["preference", "fact", "pattern", "instruction", "relationship"] as const;
type ValidCategory = (typeof VALID_CATEGORIES)[number];

interface MemoryEntry {
  id: string;
  fact: string;
  category: ValidCategory;
  confidence: number;
  tags: string[];
  expires: string | null;
  created: string;
  updated: string;
}

/** Sanitize string to prevent markdown injection */
function sanitize(input: string): string {
  return input
    .replace(/\x3c/g, "(")
    .replace(/\x3e/g, ")")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "") // Control chars
    .replace(/^#{1,6}\s/gm, "# ") // Prevent heading injection
    .replace(/\[\[/g, "(())")   // Prevent wiki-link injection
    .replace(/\]\]/g, ")))")
    .trim()
    .slice(0, 2000); // Cap length
}

function generateId(fact: string, category: string): string {
 // Simple hash for dedup
  let hash = 0;
  const str = `${category}:${fact.toLowerCase()}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function parseMemoryFile(content: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  // Each entry is a block like:
  // <!-- memory:id --> ... <!-- /memory:id -->
  const regex = /<--\s*memory:(\w+)\s*-->([\s\S]*?)<--\s*\/memory:\1\s*-->/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    try {
      const entry = JSON.parse(match[2].trim()) as MemoryEntry;
      entries.push(entry);
    } catch {
      // Skip malformed entries
    }
  }

  return entries;
}

function formatMemoryFile(entries: MemoryEntry[]): string {
  const header = "# Long-Term Memory\n\n> Managed by the remember/recall/forget primitives.\n\n";
  const blocks = entries.map((e) => {
    return `<-- memory:${e.id} -->\n${JSON.stringify(e, null, 2)}\n<-- /memory:${e.id} -->`;
  });
  return header + blocks.join("\n\n") + "\n";
}

export async function remember(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const rawFact = String(action.fact ?? "").trim();
  const category = String(action.category ?? "fact").trim() as ValidCategory;
  const confidence = typeof action.confidence === "number"
    ? Math.max(0, Math.min(1, action.confidence))
    : 0.5;
  const rawTags = Array.isArray(action.tags) ? action.tags.map(String) : [];
  const expires = action.expires ? String(action.expires) : null;

  if (!rawFact) {
    return { ok: false, error: "Missing required field: fact" };
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return { ok: false, error: `Invalid category: ${category}. Valid: ${VALID_CATEGORIES.join(", ")}` };
  }

  const fact = sanitize(rawFact);
  const tags = rawTags.map(sanitize);
  const now = new Date().toISOString();
  const id = generateId(fact, category);

  try {
    await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true });

    const content = await fs.readFile(MEMORY_FILE, "utf-8").catch(() => "");
    let entries = parseMemoryFile(content);

    // Check for duplicate
    const existingIdx = entries.findIndex(
      (e) => e.id === id || (e.category === category && e.fact.toLowerCase() === fact.toLowerCase())
    );

    if (existingIdx >= 0) {
      // Update: average confidence, refresh timestamp
      const existing = entries[existingIdx];
      existing.confidence = Math.round(((existing.confidence + confidence) / 2) * 100) / 100;
      existing.updated = now;
      if (tags.length > 0) {
        const tagSet = new Set([...existing.tags, ...tags]);
        existing.tags = Array.from(tagSet);
      }
      if (expires) existing.expires = expires;
    } else {
      entries.push({ id, fact, category, confidence, tags, expires, created: now, updated: now });
    }

    await fs.writeFile(MEMORY_FILE, formatMemoryFile(entries), "utf-8");

    // Index the fact into the embedding store (fire-and-forget, non-blocking)
    const store = new EmbeddingStore({ rootDir: ROOT });
    store.add(
      `[${category}] ${fact}`,
      "memory",
      {
        tags: tags.length > 0 ? tags : undefined,
        file: "memory/long-term.md",
      }
    ).catch(() => {
      // Embedding failure is non-fatal — the fact is already stored in long-term.md
    });

    ctx.emitHud("activity_log", {
      message: `Remembered: ${fact.slice(0, 80)}${fact.length > 80 ? "..." : ""} [${category}]`,
      level: "info",
    });

    await ctx.audit({
      type: "action_executed",
      action: "remember",
      detail: `Stored fact [${category}] confidence=${confidence}, updated=${existingIdx >= 0}`,
      ok: true,
    });

    return {
      ok: true,
      data: {
        id,
        fact,
        category,
        confidence: existingIdx >= 0
          ? entries[existingIdx].confidence
          : confidence,
        updated: existingIdx >= 0,
        total_memories: entries.length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Remember failed: ${message}` };
  }
}
