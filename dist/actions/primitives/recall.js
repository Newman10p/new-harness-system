"use strict";
// ─── recall ───────────────────────────────────────────
// Retrieves relevant memories based on a keyword query. Searches
// memory/long-term.md, memory/user-profile.md, and memory/context.md.
// Results are scored by keyword overlap * confidence * recency.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recall = recall;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const ROOT = process.cwd();
const VALID_CATEGORIES = ["preference", "fact", "pattern", "instruction", "relationship"];
function parseMemoryFile(content) {
    const entries = [];
    const regex = /<--\s*memory:(\w+)\s*-->([\s\S]*?)<--\s*\/memory:\1\s*-->/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        try {
            entries.push(JSON.parse(match[2].trim()));
        }
        catch {
            // Skip malformed entries
        }
    }
    return entries;
}
function isExpired(entry) {
    if (!entry.expires)
        return false;
    return new Date(entry.expires) < new Date();
}
function scoreMemory(query, entry) {
    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 1);
    if (queryTerms.length === 0)
        return 0;
    const factLower = entry.fact.toLowerCase();
    const tagsLower = entry.tags.join(" ").toLowerCase();
    const combined = `${factLower} ${tagsLower}`;
    let matches = 0;
    for (const term of queryTerms) {
        if (combined.includes(term))
            matches++;
    }
    // Keyword overlap (0-1)
    const keywordScore = matches / queryTerms.length;
    // Recency bonus (0-1, decays over 30 days)
    const ageMs = Date.now() - new Date(entry.updated).getTime();
    const recency = Math.max(0, 1 - ageMs / (30 * 24 * 60 * 60 * 1000));
    return keywordScore * entry.confidence * (0.6 + 0.4 * recency);
}
async function searchMarkdownFile(filePath, query, maxResults) {
    const results = [];
    try {
        const content = await promises_1.default.readFile(filePath, "utf-8");
        if (!content.trim())
            return results;
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
                source: node_path_1.default.relative(ROOT, filePath),
            });
        }
    }
    catch {
        // File doesn't exist
    }
    return results;
}
async function recall(action, _ctx) {
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
        node_path_1.default.join(ROOT, "memory", "long-term.md"),
        node_path_1.default.join(ROOT, "memory", "user-profile.md"),
        node_path_1.default.join(ROOT, "memory", "context.md"),
    ];
    const allResults = [];
    for (const file of files) {
        const results = await searchMarkdownFile(file, query, maxResults);
        allResults.push(...results);
    }
    // Filter by category if specified
    const filtered = category
        ? allResults.filter((r) => r.category === category)
        : allResults;
    // Deduplicate by fact text
    const seen = new Set();
    const deduped = [];
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
    const result = {
        query,
        memories: final,
        total_found: deduped.length,
    };
    return { ok: true, data: result };
}
//# sourceMappingURL=recall.js.map