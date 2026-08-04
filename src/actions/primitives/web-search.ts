// ─── M.A.I. Web Search Primitive ──────────────────────────────────────────
// Multi-backend web search: DuckDuckGo (free, no key), Tavily (AI-optimized),
// SearXNG (self-hosted). Falls back through engines automatically.
//
// Configuration via environment variables:
//   SEARCH_ENGINE=tavily|searxng|duckduckgo  (default: duckduckgo)
//   TAVILY_API_KEY=tvly-...                  (required for Tavily)
//   SEARXNG_URL=http://localhost:8888        (required for SearXNG)
//   SEARCH_MAX_RESULTS=10                    (default: 8)
//
// Action usage:
//   {"action": "web-search", "query": "latest Node.js release", "max_results": 5}

import type { Action, ActionResult, ActionContext } from "../../types/index.js";
import { HTTP_TIMEOUT_MS } from "../../core/constants.js";

// ─── Types ────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  engine: string;
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  engine: string;
  total: number;
  elapsed_ms: number;
}

// ─── DuckDuckGo Lite Backend (free, no API key) ───────────────────────────
// Scrapes DuckDuckGo Lite HTML — no API key required, no rate limits.

async function searchDuckDuckGo(
  query: string,
  maxResults: number
): Promise<SearchResult[]> {
  const start = Date.now();
  const encoded = encodeURIComponent(query);
  const url = `https://lite.duckduckgo.com/lite/?q=${encoded}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // DuckDuckGo Lite HTML structure (as of 2026):
  //   Results are in <td> cells within a single large <table>.
  //   Each result has this pattern of consecutive <td> cells:
  //     <td valign="top">N.</td>                          — result number
  //     <td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=ENCODED_URL&..." class='result-link'>TITLE</a></td>
  //     <td>&nbsp;&nbsp;&nbsp;</td>                       — spacer
  //     <td class='result-snippet'>SNIPPET TEXT</td>      — snippet with <b> tags
  //     <td>&nbsp;&nbsp;&nbsp;</td>                       — spacer
  //     <td><span class='link-text'>DISPLAY_URL</span></td> — shown URL
  //
  //   Strategy: Find all result-link anchors, then find the nearest result-snippet td after each.

  // Step 1: Find all result links with their positions
  // DDG Lite anchor format: <a rel="nofollow" href="..." class='result-link'>TITLE</a>
  // Attributes can be in any order, so use flexible matching.
  const linkPositions: Array<{
    pos: number;
    url: string;
    title: string;
  }> = [];

  const linkRegex = /<a\s+[^>]*rel="nofollow"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const rawUrl = linkMatch[1];
    const title = linkMatch[2]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .trim();

    // Extract actual URL from DDG redirect: //duckduckgo.com/l/?uddg=ENCODED_URL&...
    let resultUrl = rawUrl;
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      try {
        resultUrl = decodeURIComponent(uddgMatch[1]);
      } catch {
        // decode failed — use as-is
      }
    }

    // Prepend https:// if protocol-relative
    if (resultUrl.startsWith("//")) {
      resultUrl = "https:" + resultUrl;
    }

    linkPositions.push({
      pos: linkMatch.index,
      url: resultUrl,
      title,
    });
  }

  // Step 2: For each link, find the nearest result-snippet <td> after it
  for (const lp of linkPositions) {
    if (results.length >= maxResults) break;

    // Look for result-snippet in the 3000 chars after the link
    const afterLink = html.slice(lp.pos, lp.pos + 3000);
    let snippet = "";

    // Try to find result-snippet class
    const snippetIndex = afterLink.indexOf("result-snippet");
    if (snippetIndex >= 0) {
      // Find the closing > of the <td> tag, then find the next </td>
      const tdOpen = afterLink.indexOf(">", snippetIndex);
      const tdClose = afterLink.indexOf("</td>", tdOpen);
      if (tdOpen >= 0 && tdClose >= 0) {
        snippet = afterLink.slice(tdOpen + 1, tdClose)
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ")
          .replace(/&#(\d+);/g, (_, code) => {
            const num = parseInt(code, 10);
            return num > 0 && num < 0x10ffff ? String.fromCharCode(num) : "";
          })
          .trim();
      }
    }

    if (snippet.length < 10) {
      snippet = `Result for: ${lp.title}`;
    }

    // Skip if URL looks like a DDG internal link (shouldn't happen after uddg extraction)
    if (lp.url.includes("duckduckgo.com")) continue;

    results.push({
      title: lp.title,
      url: lp.url,
      snippet: snippet.slice(0, 300),
      engine: "duckduckgo",
    });
  }

  // Fallback: if the class-based parsing didn't work, try simpler rel="nofollow" matching
  if (results.length === 0) {
    const simpleLinkRegex = /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = simpleLinkRegex.exec(html)) !== null && results.length < maxResults) {
      let url = match[1];
      const title = match[2].trim();

      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        try { url = decodeURIComponent(uddgMatch[1]); } catch { /* skip */ }
      }
      if (url.startsWith("//")) url = "https:" + url;
      if (url.includes("duckduckgo.com") || title.length < 3) continue;

      results.push({
        title,
        url,
        snippet: `Result for: ${title}`,
        engine: "duckduckgo",
      });
    }
  }

  return results;
}

// ─── Tavily Backend (AI-optimized, free tier: 1000/mo) ────────────────────
// Purpose-built for AI agents. Returns clean, relevant results.

async function searchTavily(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<SearchResult[]> {
  const url = "https://api.tavily.com/search";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: Math.min(maxResults, 10),
      include_answer: true,
      include_raw_content: false,
      search_depth: "basic",
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Tavily API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      title: string;
      url: string;
      content: string;
      score: number;
    }>;
    answer?: string;
  };

  const results: SearchResult[] = [];

  // Include the AI-generated answer as the first result if available
  if (data.answer) {
    results.push({
      title: "AI Answer",
      url: "",
      snippet: data.answer.slice(0, 500),
      engine: "tavily",
    });
  }

  if (data.results) {
    for (const r of data.results) {
      if (results.length >= maxResults) break;
      results.push({
        title: r.title,
        url: r.url,
        snippet: r.content.slice(0, 300),
        engine: "tavily",
      });
    }
  }

  return results;
}

// ─── SearXNG Backend (self-hosted, free, unlimited) ───────────────────────
// Self-hosted meta search engine. Aggregates Google, Bing, DDG, etc.

async function searchSearXNG(
  query: string,
  maxResults: number,
  searxngUrl: string
): Promise<SearchResult[]> {
  const searchUrl = `${searxngUrl.replace(/\/+$/, "")}/search?q=${encodeURIComponent(query)}&format=json&engines=google,bing,duckduckgo,brave,wikipedia`;

  const response = await fetch(searchUrl, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "User-Agent": "M.A.I./2.0",
    },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`SearXNG error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      title: string;
      url: string;
      content: string;
      engine?: string;
    }>;
    number_of_results?: number;
  };

  const results: SearchResult[] = [];

  if (data.results) {
    for (const r of data.results.slice(0, maxResults)) {
      results.push({
        title: r.title,
        url: r.url,
        snippet: (r.content || "").slice(0, 300),
        engine: r.engine || "searxng",
      });
    }
  }

  return results;
}

// ─── Main Search Function with Fallback ────────────────────────────────────
// Tries engines in order: configured primary → DuckDuckGo (always fallback).

async function performSearch(
  query: string,
  maxResults: number
): Promise<SearchResponse> {
  const engines: Array<{
    name: string;
    search: () => Promise<SearchResult[]>;
  }> = [];

  // Build engine list based on configuration
  const primary = process.env.SEARCH_ENGINE?.toLowerCase() || "duckduckgo";
  const tavilyKey = process.env.TAVILY_API_KEY;
  const searxngUrl = process.env.SEARXNG_URL;

  // Add configured primary engine first
  if (primary === "tavily" && tavilyKey) {
    engines.push({
      name: "tavily",
      search: () => searchTavily(query, maxResults, tavilyKey),
    });
  } else if (primary === "searxng" && searxngUrl) {
    engines.push({
      name: "searxng",
      search: () => searchSearXNG(query, maxResults, searxngUrl),
    });
  } else {
    engines.push({
      name: "duckduckgo",
      search: () => searchDuckDuckGo(query, maxResults),
    });
  }

  // Add fallback engines (avoid duplicates)
  if (primary !== "duckduckgo") {
    engines.push({
      name: "duckduckgo",
      search: () => searchDuckDuckGo(query, maxResults),
    });
  }
  if (primary !== "tavily" && tavilyKey) {
    engines.push({
      name: "tavily",
      search: () => searchTavily(query, maxResults, tavilyKey),
    });
  }
  if (primary !== "searxng" && searxngUrl) {
    engines.push({
      name: "searxng",
      search: () => searchSearXNG(query, maxResults, searxngUrl),
    });
  }

  // Try each engine in order
  const errors: string[] = [];

  for (const engine of engines) {
    try {
      const start = Date.now();
      const results = await engine.search();
      const elapsed = Date.now() - start;

      if (results.length > 0) {
        return {
          results,
          query,
          engine: engine.name,
          total: results.length,
          elapsed_ms: elapsed,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${engine.name}: ${msg}`);
      console.warn(`[WebSearch] ${engine.name} failed: ${msg}`);
    }
  }

  // All engines failed
  return {
    results: [],
    query,
    engine: "none",
    total: 0,
    elapsed_ms: 0,
  };
}

// ─── Primitive Export ────────────────────────────────────────────────────────

export async function webSearch(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const query = action.query as string | undefined;
  const maxResults = Math.min(
    Math.max((action.max_results as number) || 8, 1),
    20
  );

  if (!query || typeof query !== "string") {
    return {
      ok: false,
      error:
        "web-search requires a 'query' parameter (the search term to look up on the web)",
    };
  }

  // Check if search is allowed by network policy
  // (the policy engine handles this — we just proceed)

  const result = await performSearch(query, maxResults);

  // Emit HUD activity
  ctx.emitHud("bg_activity", {
    id: `search-${Date.now()}`,
    action: "web-search",
    status: result.results.length > 0 ? "completed" : "failed",
    detail: `Searched for "${query.slice(0, 60)}" — ${result.results.length} results via ${result.engine} (${result.elapsed_ms}ms)`,
  });

  if (result.results.length === 0) {
    return {
      ok: false,
      error: `No results found for "${query}". All search engines failed or returned empty results.`,
      data: {
        query: result.query,
        engine: result.engine,
        elapsed_ms: result.elapsed_ms,
      },
    };
  }

  // Format results for LLM consumption
  const formatted = result.results
    .map((r, i) => {
      let line = `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.snippet}`;
      return line;
    })
    .join("\n\n");

  return {
    ok: true,
    data: {
      query: result.query,
      engine: result.engine,
      total: result.total,
      elapsed_ms: result.elapsed_ms,
      results: result.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      })),
    },
  };
}
