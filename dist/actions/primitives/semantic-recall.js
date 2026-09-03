"use strict";
// ─── semantic-recall ────────────────────────────────────────────
// Searches memory/context files for relevant information using
// keyword matching. A stepping stone to full semantic memory.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.semanticRecall = semanticRecall;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
// Files to search for memory/context
const MEMORY_FILES = [
    "memory/context.md",
    "state/inbox.md",
    "memory/notes.md",
];
/**
 * Simple keyword-based relevance scoring.
 * Splits query into terms and scores each section by term frequency.
 */
function scoreSection(query, heading, content) {
    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 1);
    if (queryTerms.length === 0)
        return 0;
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
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * Splits a markdown file into sections by ## headings.
 * Returns an array of { heading, content } objects.
 */
function splitIntoSections(markdown) {
    const lines = markdown.split("\n");
    const sections = [];
    let currentHeading = "(top)";
    let currentLines = [];
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
        }
        else {
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
async function semanticRecall(action, _ctx) {
    const query = String(action.query ?? "").trim();
    if (!query) {
        return { ok: false, error: "Missing required field: query" };
    }
    const rootDir = process.cwd();
    const results = [];
    let totalMatches = 0;
    for (const relPath of MEMORY_FILES) {
        const fullPath = node_path_1.default.join(rootDir, relPath);
        let content;
        try {
            content = await promises_1.default.readFile(fullPath, "utf-8");
        }
        catch {
            continue; // File doesn't exist — skip
        }
        if (!content.trim())
            continue;
        const sections = splitIntoSections(content);
        // Score each section
        for (const section of sections) {
            section.score = scoreSection(query, section.heading, section.content);
        }
        // Keep only sections with a score > 0
        const matches = sections
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5); // Top 5 sections per file
        if (matches.length > 0) {
            totalMatches += matches.length;
            results.push({
                file: relPath,
                sections: matches,
            });
        }
    }
    return {
        ok: true,
        data: {
            query,
            sources: results,
            totalMatches,
            note: totalMatches === 0
                ? "No relevant sections found. Try different keywords or the memory files may be empty."
                : "Results ranked by keyword relevance. For true semantic search, embedding-based recall is a future feature.",
        },
    };
}
//# sourceMappingURL=semantic-recall.js.map