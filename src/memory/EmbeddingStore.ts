// ─── EmbeddingStore ─────────────────────────────────────────────────────────
// Lightweight embedding-based semantic memory store.
// Uses the OpenAI SDK embeddings endpoint (same LLM_BASE_URL / LLM_API_KEY)
// for vector generation. Persists entries as JSONL in state/embeddings.jsonl.

import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmbeddingEntry {
  id: string;
  source: "memory" | "context" | "inbox" | "conversation";
  content: string;
  embedding: number[];
  metadata: {
    timestamp: string;
    tags?: string[];
    file?: string;
  };
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  source: string;
  metadata: EmbeddingEntry["metadata"];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(content: string, source: string): string {
  let hash = 0;
  const str = `${source}:${content.toLowerCase().slice(0, 200)}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Cosine similarity between two vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dotProduct / denom;
}

/**
 * L2-normalize a vector in-place and return it.
 */
function normalizeVector(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) {
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  for (let i = 0; i < vec.length; i++) {
    vec[i] = vec[i]! / norm;
  }
  return vec;
}

// ─── EmbeddingStore ───────────────────────────────────────────────────────────

export class EmbeddingStore {
  private storePath: string;
  private embeddingClient: OpenAI | null = null;
  private readonly model: string;
  private readonly maxEntries: number;

  constructor(options?: {
    rootDir?: string;
    model?: string;
    maxEntries?: number;
  }) {
    const root = options?.rootDir ?? process.cwd();
    this.storePath = path.join(root, "state", "embeddings.jsonl");
    this.model = options?.model ?? process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
    this.maxEntries = options?.maxEntries ??
    parseInt(process.env.EMBEDDING_MAX_ENTRIES ?? "10000", 10);
  }

  // ─── OpenAI client (lazy init) ──────────────────────────────────────────

  private getClient(): OpenAI | null {
    if (this.embeddingClient) return this.embeddingClient;

    const baseURL = process.env.LLM_BASE_URL;
    const apiKey = process.env.LLM_API_KEY;
    if (!baseURL || !apiKey) return null;

    try {
      this.embeddingClient = new OpenAI({ baseURL, apiKey });
      return this.embeddingClient;
    } catch {
      return null;
    }
  }

  // ─── Embedding generation ───────────────────────────────────────────────

  /**
   * Generate an embedding vector for the given text.
   * Returns null if the API call fails.
   */
  async embed(text: string): Promise<number[] | null> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS ?? "1536", 10);
      const response = await client.embeddings.create({
        model: this.model,
        input: text,
        ...(dimensions > 0 ? { dimensions } : {}),
      });

      const data = response.data;
      if (data && data.length > 0 && data[0]?.embedding) {
        return normalizeVector([...data[0].embedding]);
      }
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[EmbeddingStore] Embedding API failed: ${message}`);
      return null;
    }
  }

  // ─── Persistence (JSONL) ────────────────────────────────────────────────

  /** Ensure the state directory exists. */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
  }

  /** Append a single entry as one JSONL line. */
  private async appendEntry(entry: EmbeddingEntry): Promise<void> {
    await this.ensureDir();
    await fs.appendFile(this.storePath, JSON.stringify(entry) + "\n", "utf-8");
  }

  /** Read all entries from the JSONL file. */
  async loadAll(): Promise<EmbeddingEntry[]> {
    try {
      const raw = await fs.readFile(this.storePath, "utf-8");
      if (!raw.trim()) return [];

      const entries: EmbeddingEntry[] = [];
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed) as EmbeddingEntry);
        } catch {
          // Skip malformed lines
        }
      }
      return entries;
    } catch {
      // File doesn't exist yet
      return [];
    }
  }

  /** Rewrite the entire JSONL file with the given entries. */
  private async writeAll(entries: EmbeddingEntry[]): Promise<void> {
    await this.ensureDir();
    const lines = entries.map((e) => JSON.stringify(e));
    await fs.writeFile(this.storePath, lines.join("\n") + (lines.length ? "\n" : ""), "utf-8");
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Add a new entry to the embedding store.
   * Generates an embedding for the content and appends to the JSONL file.
   * Returns the entry ID, or null if embedding generation fails.
   */
  async add(
    content: string,
    source: EmbeddingEntry["source"],
    metadata?: Partial<EmbeddingEntry["metadata"]>
  ): Promise<string | null> {
    const embedding = await this.embed(content);
    if (!embedding) return null;

    const id = generateId(content, source);
    const entry: EmbeddingEntry = {
      id,
      source,
      content,
      embedding,
      metadata: {
        timestamp: metadata?.timestamp ?? new Date().toISOString(),
        tags: metadata?.tags,
        file: metadata?.file,
      },
    };

    await this.appendEntry(entry);

    // Auto-compact if we've exceeded max entries
    const currentSize = await this.size();
    if (currentSize > this.maxEntries) {
      await this.compact();
    }

    return id;
  }

  /**
   * Search for entries most similar to the query text.
   * Generates a query embedding and uses cosine similarity.
   */
  async search(
    query: string,
    topK: number = 5,
    filter?: { source?: EmbeddingEntry["source"]; tags?: string[] }
  ): Promise<SearchResult[]> {
    const queryEmbedding = await this.embed(query);
    if (!queryEmbedding) return [];

    const entries = await this.loadAll();
    if (entries.length === 0) return [];

    const scored: SearchResult[] = [];

    for (const entry of entries) {
      // Apply source filter
      if (filter?.source && entry.source !== filter.source) continue;

      // Apply tag filter: at least one tag must overlap
      if (filter?.tags && filter.tags.length > 0) {
        const entryTags = entry.metadata.tags ?? [];
        const hasOverlap = filter.tags.some((t) => entryTags.includes(t));
        if (!hasOverlap) continue;
      }

      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      scored.push({
        id: entry.id,
        content: entry.content,
        score,
        source: entry.source,
        metadata: entry.metadata,
      });
    }

    // Sort by score descending (highest similarity first)
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }

  /**
   * Delete an entry by ID. Rewrites the file without the matching entry.
   */
  async delete(id: string): Promise<void> {
    const entries = await this.loadAll();
    const filtered = entries.filter((e) => e.id !== id);

    if (filtered.length === entries.length) return; // Nothing to delete

    await this.writeAll(filtered);
  }

  /**
   * Compact the store: remove duplicates (same content), normalize all vectors.
   */
  async compact(): Promise<void> {
    const entries = await this.loadAll();
    if (entries.length === 0) return;

    const seen = new Map<string, EmbeddingEntry>();

    for (const entry of entries) {
      const key = `${entry.source}:${entry.content.toLowerCase().trim()}`;
      const existing = seen.get(key);

      if (!existing) {
        // Normalize the vector
        entry.embedding = normalizeVector([...entry.embedding]);
        seen.set(key, entry);
      } else {
        // Keep the newer entry (by timestamp)
        if (entry.metadata.timestamp > existing.metadata.timestamp) {
          entry.embedding = normalizeVector([...entry.embedding]);
          seen.set(key, entry);
        }
      }
    }

    await this.writeAll(Array.from(seen.values()));
  }

  /**
   * Return the number of entries currently in the store.
   */
  async size(): Promise<number> {
    const entries = await this.loadAll();
    return entries.length;
  }
}
