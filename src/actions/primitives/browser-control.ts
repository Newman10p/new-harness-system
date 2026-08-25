// ─── M.A.I. Browser Control Primitive ──────────────────────────────────
// Operations: discover, list-browsers, list-tabs, search-tabs, new-tab,
//   close-tab, activate-tab, navigate, google-search, screenshot,
//   get-content, extract-search-results, evaluate-js, browser-info, stats

import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";
import { getBrowserControlManager } from "../../sandbox2/BrowserControlManager.js";
import type { BrowserControlManager } from "../../sandbox2/BrowserControlManager.js";

let _manager: BrowserControlManager | null = null;
function getManager(): BrowserControlManager {
  if (!_manager) { _manager = getBrowserControlManager(); }
  return _manager;
}

export async function browserControl(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const manager = getManager();
  const operation = String(action.operation ?? "list-tabs").toLowerCase();

  try {
    switch (operation) {
      // ─── Discovery & Info ───────────────────────────────────────
      case "discover":
        return await discover(action, ctx, manager);
      case "list-browsers":
        return listBrowsers(manager);
      case "browser-info":
        return await browserInfo(action, manager);
      case "stats":
        return { ok: true, data: manager.getStats() };

      // ─── Tab Management ────────────────────────────────────────
      case "list-tabs":
        return await listTabs(action, ctx, manager);
      case "search-tabs":
        return await searchTabs(action, ctx, manager);
      case "new-tab":
        return await newTab(action, ctx, manager);
      case "close-tab":
        return await closeTab(action, ctx, manager);
      case "activate-tab":
        return await activateTab(action, manager);

      // ─── Navigation ────────────────────────────────────────────
      case "navigate":
        return await navigate(action, ctx, manager);
      case "google-search":
        return await googleSearch(action, ctx, manager);

      // ─── Content ───────────────────────────────────────────────
      case "screenshot":
        return await screenshot(action, ctx, manager);
      case "get-content":
        return await getContent(action, ctx, manager);
      case "extract-search-results":
        return await extractSearchResults(action, ctx, manager);
      case "evaluate-js":
        return await evaluateJs(action, manager);

      default:
        return { ok: false, error: `Unknown browser-control operation: "${operation}". Valid: discover, list-browsers, list-tabs, search-tabs, new-tab, close-tab, activate-tab, navigate, google-search, screenshot, get-content, extract-search-results, evaluate-js, browser-info, stats` };
    }
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─── Operation Handlers ──────────────────────────────────────────────────

async function discover(
  _action: Action,
  ctx: ActionContext,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const instances = await manager.discoverBrowsers();
  ctx.emitHud("activity_log" as HudChannel, {
    message: `Browser discovery found ${instances.length} instance(s): ${instances.map(i => `${i.name} (${i.cdpUrl})`).join(", ") || "none"}`,
    level: "info",
  } as never);
  return { ok: true, data: { discovered: instances } };
}

function listBrowsers(manager: BrowserControlManager): ActionResult {
  const browsers = manager.listBrowsers();
  if (browsers.length === 0) {
    return {
      ok: false,
      error: "No browsers found. Ensure Chrome/Brave is running with --remote-debugging-port=9222, or enable autoLaunch in config.",
    };
  }
  return {
    ok: true,
    data: {
      browsers: browsers.map(b => ({
        id: b.id,
        name: b.name,
        cdpUrl: b.cdpUrl,
        pid: b.pid,
        connected: b.connected,
      })),
    },
  };
}

async function browserInfo(
  action: Action,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const browserId = String(action.browser_id ?? action.browserId ?? "");
  if (!browserId) {
    return { ok: false, error: "browser-info requires 'browser_id' parameter" };
  }
  const info = await manager.getBrowserInfo(browserId);
  if (!info) {
    return { ok: false, error: `Browser '${browserId}' not found or not connected` };
  }
  return { ok: true, data: info };
}

async function listTabs(
  action: Action,
  ctx: ActionContext,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const browserId = action.browser_id as string | undefined;
  const tabs = await manager.listTabs(browserId);

  ctx.emitHud("activity_log" as HudChannel, {
    message: `Listed ${tabs.length} tab(s) across browsers`,
    level: "info",
  } as never);

  return {
    ok: true,
    data: {
      totalTabs: tabs.length,
      tabs: tabs.map(t => ({
        id: t.id,
        browser: t.browserName,
        title: t.title,
        url: t.url,
      })),
    },
  };
}

async function searchTabs(
  action: Action,
  ctx: ActionContext,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const query = String(action.query ?? "");
  if (!query) {
    return { ok: false, error: "search-tabs requires 'query' parameter" };
  }

  const tabs = await manager.searchTabs(query);

  ctx.emitHud("activity_log" as HudChannel, {
    message: `Tab search for "${query}": ${tabs.length} match(es)`,
    level: "info",
  } as never);

  return {
    ok: true,
    data: {
      query,
      totalMatches: tabs.length,
      tabs: tabs.map(t => ({
        id: t.id,
        browser: t.browserName,
        title: t.title,
        url: t.url,
      })),
    },
  };
}

async function newTab(
  action: Action,
  ctx: ActionContext,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const browserId = action.browser_id as string | undefined;
  const url = action.url as string | undefined;
  const tab = await manager.newTab(browserId, url);

  if (!tab) {
    return {
      ok: false,
      error: "Failed to create new tab. No connected browser available.",
    };
  }

  ctx.emitHud("activity_log" as HudChannel, {
    message: `New tab opened: ${tab.title || tab.url} in ${tab.browserName}`,
    level: "info",
  } as never);

  await ctx.audit({
    type: "action_executed",
    action: "browser-control",
    detail: `New tab in ${tab.browserName}: ${url || "blank"}`,
    ok: true,
  });

  return { ok: true, data: tab };
}

async function closeTab(
  action: Action,
  ctx: ActionContext,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const tabId = String(action.tab_id ?? "");
  if (!tabId) {
    return { ok: false, error: "close-tab requires 'tab_id' parameter" };
  }

  const success = await manager.closeTab(tabId);

  ctx.emitHud("activity_log" as HudChannel, {
    message: success ? `Tab ${tabId} closed` : `Failed to close tab ${tabId}`,
    level: success ? "info" : "warn",
  } as never);

  return { ok: success, data: { tabId, closed: success } };
}

async function activateTab(
  action: Action,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const tabId = String(action.tab_id ?? "");
  if (!tabId) {
    return { ok: false, error: "activate-tab requires 'tab_id' parameter" };
  }

  const success = await manager.activateTab(tabId);
  return { ok: success, data: { tabId, activated: success } };
}

async function navigate(
  action: Action,
  ctx: ActionContext,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const tabId = String(action.tab_id ?? "");
  const url = String(action.url ?? "");

  if (!tabId || !url) {
    return { ok: false, error: "navigate requires 'tab_id' and 'url' parameters" };
  }

  ctx.emitHud("action_progress" as HudChannel, {
    id: `nav-${tabId}`,
    action: "browser-control",
    step: "navigating",
    percent: 50,
    detail: `Navigating to ${url.slice(0, 80)}`,
  } as never);

  const result = await manager.navigate(tabId, url);

  ctx.emitHud("bg_activity" as HudChannel, {
    id: `nav-${tabId}`,
    action: "browser-control",
    status: result.status === "navigated" ? "completed" : "failed",
    detail: `${result.status}: ${url} → ${result.title || "(no title)"}`,
  } as never);

  await ctx.audit({
    type: "action_executed",
    action: "browser-control",
    detail: `Navigated tab ${tabId} to ${url} (${result.elapsed_ms}ms)`,
    ok: result.status === "navigated",
  });

  return { ok: result.status === "navigated", data: result };
}

async function googleSearch(
  action: Action,
  ctx: ActionContext,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const tabId = String(action.tab_id ?? "");
  const query = String(action.query ?? "");

  if (!query) {
    return { ok: false, error: "google-search requires 'query' parameter" };
  }

  // If no tab specified, create one
  let targetTabId = tabId;
  if (!targetTabId) {
    const tab = await manager.newTab(undefined);
    if (!tab) {
      return { ok: false, error: "No connected browser to open Google search" };
    }
    targetTabId = tab.id;
  }

  ctx.emitHud("action_progress" as HudChannel, {
    id: `gsearch-${Date.now()}`,
    action: "browser-control",
    step: "searching-google",
    percent: 30,
    detail: `Searching Google for: ${query.slice(0, 60)}`,
  } as never);

  const result = await manager.googleSearch(targetTabId, query);

  if (result.status !== "navigated") {
    return { ok: false, error: `Google search navigation failed: ${result.status}` };
  }

  // Wait a moment for the page to render, then extract results
  await new Promise(r => setTimeout(r, 2000));

  const searchResults = await manager.extractSearchResults(targetTabId);

  ctx.emitHud("bg_activity" as HudChannel, {
    id: `gsearch-${Date.now()}`,
    action: "browser-control",
    status: "completed",
    detail: `Google search for "${query.slice(0, 40)}" returned ${searchResults.length} results`,
  } as never);

  await ctx.audit({
    type: "action_executed",
    action: "browser-control",
    detail: `Google search: "${query.slice(0, 80)}" → ${searchResults.length} results`,
    ok: true,
  });

  return {
    ok: true,
    data: {
      tabId: targetTabId,
      query,
      searchUrl: result.url,
      results: searchResults,
    },
  };
}

async function screenshot(
  action: Action,
  ctx: ActionContext,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const tabId = String(action.tab_id ?? "");
  const fullPage = Boolean(action.full_page ?? action.fullPage ?? false);

  if (!tabId) {
    return { ok: false, error: "screenshot requires 'tab_id' parameter" };
  }

  const result = await manager.takeScreenshot(tabId, fullPage);

  if (!result) {
    return { ok: false, error: `Failed to capture screenshot of tab ${tabId}` };
  }

  ctx.emitHud("activity_log" as HudChannel, {
    message: `Screenshot captured for tab ${tabId} (${result.width}x${result.height})`,
    level: "info",
  } as never);

  return {
    ok: true,
    data: {
      tabId: result.tabId,
      format: result.format,
      width: result.width,
      height: result.height,
      dataLength: result.data.length,
      data: result.data, // base64 PNG
    },
  };
}

async function getContent(
  action: Action,
  ctx: ActionContext,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const tabId = String(action.tab_id ?? "");
  const includeHtml = Boolean(action.include_html ?? false);

  if (!tabId) {
    return { ok: false, error: "get-content requires 'tab_id' parameter" };
  }

  const content = await manager.getPageContent(tabId, includeHtml);

  if (!content) {
    return { ok: false, error: `Failed to get content from tab ${tabId}` };
  }

  ctx.emitHud("activity_log" as HudChannel, {
    message: `Extracted content from tab ${tabId}: ${content.url} (${content.text.length} chars)`,
    level: "info",
  } as never);

  return {
    ok: true,
    data: {
      tabId: content.tabId,
      url: content.url,
      title: content.title,
      text: content.text,
      html: content.html,
      links: content.links,
      textLength: content.text.length,
    },
  };
}

async function extractSearchResults(
  action: Action,
  ctx: ActionContext,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const tabId = String(action.tab_id ?? "");

  if (!tabId) {
    return { ok: false, error: "extract-search-results requires 'tab_id' parameter" };
  }

  const results = await manager.extractSearchResults(tabId);

  ctx.emitHud("activity_log" as HudChannel, {
    message: `Extracted ${results.length} search results from tab ${tabId}`,
    level: "info",
  } as never);

  return { ok: true, data: { tabId, results } };
}

async function evaluateJs(
  action: Action,
  manager: BrowserControlManager
): Promise<ActionResult> {
  const tabId = String(action.tab_id ?? "");
  const expression = String(action.expression ?? "");

  if (!tabId || !expression) {
    return { ok: false, error: "evaluate-js requires 'tab_id' and 'expression' parameters" };
  }

  const result = await manager.evaluateJs(tabId, expression);

  if (result.error) {
    return { ok: false, error: result.error, data: { tabId: result.tabId, result: null } };
  }

  return { ok: true, data: result };
}
