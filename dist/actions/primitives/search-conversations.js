"use strict";
// ─── M.A.I. Primitive: search-conversations ───────────────────────────────────
// Search through indexed conversation history.
// Uses the ConversationIndex for full-text search with filters.
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchConversations = searchConversations;
async function searchConversations(action, ctx) {
    const query = action.query;
    const limit = action.limit;
    const intent = action.intent;
    const fromDate = action.from;
    const toDate = action.to;
    const keyword = action.keyword;
    if (!query && !keyword) {
        return { ok: false, error: "Missing query or keyword — specify what to search for" };
    }
    await ctx.emitHud("activity_log", {
        message: `[Search] Searching conversations: "${(query ?? keyword ?? "").toString().slice(0, 50)}"`,
        level: "info",
    });
    try {
        const { createRequire } = await import("node:module");
        const require = createRequire(import.meta.url);
        const indexMod = require("../../memory/ConversationIndex.js");
        const ConversationIndex = indexMod.ConversationIndex ?? indexMod.default;
        if (!ConversationIndex || typeof ConversationIndex !== "function") {
            return { ok: false, error: "ConversationIndex not available" };
        }
        const index = new ConversationIndex();
        // ConversationIndex.search takes a SearchFilters object:
        // { query?, keyword?, limit?, intent?, from?, to? }
        const filters = {};
        const searchQuery = (query ?? (Array.isArray(keyword) ? keyword.join(" ") : keyword));
        filters.query = searchQuery;
        if (limit)
            filters.limit = limit;
        if (intent)
            filters.intent = intent;
        if (fromDate)
            filters.from = new Date(fromDate).getTime();
        if (toDate)
            filters.to = new Date(toDate).getTime();
        const results = index.search(filters);
        await ctx.audit({
            type: "action_executed",
            action: "search-conversations",
            detail: `Found ${Array.isArray(results) ? results.length : 0} results for "${searchQuery.slice(0, 50)}"`,
            ok: true,
        });
        return { ok: true, data: results };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await ctx.emitHud("activity_log", {
            message: `[Search] Error: ${message}`,
            level: "error",
        });
        return { ok: false, error: `Conversation search failed: ${message}` };
    }
}
//# sourceMappingURL=search-conversations.js.map