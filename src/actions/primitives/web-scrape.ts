// ─── M.A.I. Web Scrape Primitive ───────────────────────────────────────────
// Fetches a web page and extracts readable text content.
// Strips HTML tags, scripts, styles, and navigation noise.
// Works with any publicly accessible URL.
//
// Action usage:
//   {"action": "web-scrape", "url": "https://example.com/article"}
//   {"action": "web-scrape", "url": "https://example.com", "max_chars": 5000}

import type { Action, ActionResult, ActionContext } from "../../types/index.js";
import { HTTP_TIMEOUT_MS } from "../../core/constants.js";

interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  char_count: number;
  word_count: number;
  elapsed_ms: number;
  truncated: boolean;
}

/**
 * Strip HTML tags and extract readable text content.
 * Removes: script, style, nav, header, footer, noscript, iframe elements.
 * Collapses whitespace and trims output.
 */
function extractReadableText(html: string): { title: string; text: string } {
  let title = "";

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  // Remove elements that contain non-content noise
  let text = html;

  // Remove script, style, nav, footer, header, noscript, iframe, svg
  const noisePatterns = [
    /<script[\s\S]*?<\/script>/gi,
    /<style[\s\S]*?<\/style>/gi,
    /<nav[\s\S]*?<\/nav>/gi,
    /<footer[\s\S]*?<\/footer>/gi,
    /<header[\s\S]*?<\/header>/gi,
    /<noscript[\s\S]*?<\/noscript>/gi,
    /<iframe[\s\S]*?<\/iframe>/gi,
    /<svg[\s\S]*?<\/svg>/gi,
    /<aside[\s\S]*?<\/aside>/gi,
    /<!--[\s\S]*?-->/g, // comments
  ];

  for (const pattern of noisePatterns) {
    text = text.replace(pattern, "");
  }

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => {
      const num = parseInt(code, 10);
      return num > 0 && num < 0x10ffff ? String.fromCharCode(num) : "";
    });

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Collapse multiple blank lines into single breaks
  text = text.replace(/\n\s*\n\s*\n/g, "\n\n");

  return { title, text };
}

/**
 * Fetch a URL and extract readable content.
 */
async function scrapeUrl(url: string, maxChars: number): Promise<ScrapeResult> {
  const start = Date.now();

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (
    !contentType.includes("text/html") &&
    !contentType.includes("text/plain") &&
    !contentType.includes("application/xhtml")
  ) {
    throw new Error(
      `Unsupported content type: ${contentType}. web-scrape works with HTML pages.`
    );
  }

  const html = await response.text();
  const { title, text } = extractReadableText(html);

  const truncated = text.length > maxChars;
  const content = truncated
    ? text.slice(0, maxChars) + "\n\n[... content truncated]"
    : text;

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    url: response.url || url, // use final URL after redirects
    title: title || "Untitled",
    content,
    char_count: content.length,
    word_count: wordCount,
    elapsed_ms: Date.now() - start,
    truncated,
  };
}

// ─── Primitive Export ────────────────────────────────────────────────────────

export async function webScrape(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const url = action.url as string | undefined;
  const maxChars = Math.min(
    Math.max((action.max_chars as number) || 15000, 500),
    50000
  );

  if (!url || typeof url !== "string") {
    return {
      ok: false,
      error:
        "web-scrape requires a 'url' parameter (the web page to fetch and read)",
    };
  }

  try {
    const result = await scrapeUrl(url, maxChars);

    // Emit HUD activity
    ctx.emitHud("bg_activity", {
      id: `scrape-${Date.now()}`,
      action: "web-scrape",
      status: "completed",
      detail: `Scraped "${result.title}" (${result.word_count} words, ${result.elapsed_ms}ms)`,
    });

    return {
      ok: true,
      data: {
        url: result.url,
        title: result.title,
        content: result.content,
        char_count: result.char_count,
        word_count: result.word_count,
        elapsed_ms: result.elapsed_ms,
        truncated: result.truncated,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    ctx.emitHud("bg_activity", {
      id: `scrape-${Date.now()}`,
      action: "web-scrape",
      status: "failed",
      detail: `Failed to scrape "${url}": ${message}`,
    });

    return {
      ok: false,
      error: `Failed to scrape "${url}": ${message}`,
    };
  }
}
