// ─── M.A.I. Browser Control Manager ──────────────────────────────────────
// Controls Chrome and Brave browsers via the Chrome DevTools Protocol (CDP).
// Discovers running browser instances, manages tab lifecycles, navigates,
// takes screenshots, extracts page content, and injects/evaluates JavaScript.
//
// Browser instances are discovered by:
//   1. Checking for --remote-debugging-port on running Chrome/Brave processes
//   2. Attempting to connect to known default CDP ports (9222, 9223, 9224)
//   3. Auto-launching browsers with remote debugging enabled if configured
//
// No external dependencies required — uses Node.js native fetch + WebSocket.

import { execSync, spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// ─── Types ────────────────────────────────────────────────────────────────

export interface BrowserInstance {
  id: string;
  name: string;          // "chrome" | "brave"
  cdpUrl: string;        // e.g. "http://localhost:9222"
  pid?: number;
  userDataDir?: string;
  connected: boolean;
  connectedAt?: number;
}

export interface BrowserTab {
  id: string;
  browserId: string;
  browserName: string;
  url: string;
  title: string;
  type: "page" | "background" | "service_worker" | "other";
}

export interface NavigationResult {
  tabId: string;
  url: string;
  title: string;
  status: "navigated" | "timeout" | "error";
  elapsed_ms: number;
}

export interface ScreenshotResult {
  tabId: string;
  data: string;       // base64-encoded PNG
  format: string;
  width: number;
  height: number;
}

export interface PageContent {
  tabId: string;
  url: string;
  title: string;
  text: string;        // extracted visible text
  html?: string;       // full HTML (optional, can be large)
  links: Array<{ text: string; href: string }>;
}

export interface JsEvalResult {
  tabId: string;
  result: unknown;
  error?: string;
}

export interface BrowserStats {
  totalBrowsers: number;
  connectedBrowsers: number;
  totalTabs: number;
  browserNames: string[];
  protocols: string[];
}

interface CdpResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message: string; code: number };
}

interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface CdpBrowserInfo {
  Browser: string;
  "User-Agent": string;
  "Protocol-Version": string;
  "V8-Version": string;
  "WebKit-Version": string;
  webSocketDebuggerUrl: string;
}

interface ConnectionWaiter {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  id: number;
  method: string;
}

// ─── Browser Paths ─────────────────────────────────────────────────────────

function getBrowserPaths(): Record<string, string[]> {
  const platform = os.platform();
  const paths: Record<string, string[]> = {
    chrome: [],
    brave: [],
  };

  if (platform === "linux") {
    paths.chrome = [
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/snap/bin/chromium",
    ];
    paths.brave = [
      "/usr/bin/brave-browser",
      "/usr/bin/brave",
      "/snap/bin/brave",
    ];
  } else if (platform === "darwin") {
    paths.chrome = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ];
    paths.brave = [
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ];
  } else if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\Default";
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    paths.chrome = [
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    paths.brave = [
      `${programFiles}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      `${programFilesX86}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      `${localAppData}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    ];
  }

  return paths;
}

// ─── Utility Functions ────────────────────────────────────────────────────

function generateId(): string {
  return `br_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Check if a TCP port is open */
function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/** Find which browsers are installed on the system */
function findInstalledBrowsers(): Array<{ name: string; path: string }> {
  const browserPaths = getBrowserPaths();
  const installed: Array<{ name: string; path: string }> = [];

  for (const [name, paths] of Object.entries(browserPaths)) {
    for (const p of paths) {
      if (fs.existsSync(p)) {
        installed.push({ name, path: p });
        break; // one per browser is enough
      }
    }
  }

  return installed;
}

/** Detect running Chrome/Brave processes and their debugging ports */
function detectRunningBrowsers(): Array<{ name: string; pid: number; port: number }> {
  const results: Array<{ name: string; pid: number; port: number }> = [];
  const platform = os.platform();

  try {
    let cmd: string;
    if (platform === "win32") {
      cmd = 'wmic process where "name=\'chrome.exe\' or name=\'brave.exe\'" get ProcessId,CommandLine /format:csv 2>nul';
    } else {
      cmd = "ps aux | grep -E '(chrome|chromium|brave)' | grep -v grep | grep -v 'BrowserControlManager'";
    }

    const output = execSync(cmd, { encoding: "utf-8", timeout: 5000 });
    const lines = output.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      // Look for --remote-debugging-port=XXXX
      const portMatch = line.match(/--remote-debugging-port=(\d+)/);
      if (portMatch) {
        const port = parseInt(portMatch[1], 10);
        const pidMatch = platform === "win32"
          ? line.match(/,(\d+),/)
          : line.match(/^\S+\s+(\d+)/);
        const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
        const name = line.toLowerCase().includes("brave") ? "brave" : "chrome";
        results.push({ name, pid, port });
      }
    }
  } catch {
    // Process listing failed — not critical
  }

  return results;
}

// ─── CDP WebSocket Client ─────────────────────────────────────────────────

class CdpClient {
  private ws: import("ws").WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, ConnectionWaiter>();
  private eventHandlers = new Map<string, Array<(params: unknown) => void>>();
  private connected = false;
  private wsModule: typeof import("ws") | null = null;

  async connect(wsUrl: string, timeoutMs = 5000): Promise<void> {
    // Lazy-load ws module
    if (!this.wsModule) {
      try {
        this.wsModule = require("ws");
      } catch {
        throw new Error("ws module not available. Install with: npm install ws");
      }
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`CDP WebSocket connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const WsCtor = (this.wsModule as any).WebSocket;
        const ws = new WsCtor(wsUrl);
        this.ws = ws;

        ws.on("open", () => {
          clearTimeout(timer);
          this.connected = true;
          resolve();
        });

        ws.on("message", (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString()) as CdpResponse;
            if (msg.id !== undefined && this.pending.has(msg.id)) {
              const waiter = this.pending.get(msg.id)!;
              clearTimeout(waiter.timeout);
              this.pending.delete(msg.id);
              if (msg.error) {
                waiter.reject(new Error(msg.error.message));
              } else {
                waiter.resolve(msg.result);
              }
            } else if (msg.id === undefined) {
              // Event message
              const method = (msg as unknown as { method: string }).method;
              const handlers = this.eventHandlers.get(method);
              if (handlers) {
                const params = (msg as unknown as { params: unknown }).params;
                for (const h of handlers) {
                  try { h(params); } catch { /* handler error */ }
                }
              }
            }
          } catch { /* parse error */ }
        });

        ws.on("error", (err: Error) => {
          clearTimeout(timer);
          this.connected = false;
          reject(new Error(`CDP WebSocket error: ${err.message}`));
        });

        ws.on("close", () => {
          this.connected = false;
          // Reject all pending
          for (const [, waiter] of this.pending) {
            clearTimeout(waiter.timeout);
            waiter.reject(new Error("WebSocket closed"));
          }
          this.pending.clear();
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async send(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<unknown> {
    if (!this.ws || !this.connected) {
      throw new Error("CDP client not connected");
    }

    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout, id, method });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event: string, handler: (params: unknown) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  disconnect(): void {
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.connected = false;
    this.pending.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// ─── BrowserControlManager ───────────────────────────────────────────────

export class BrowserControlManager {
  private browsers = new Map<string, BrowserInstance>();
  private tabClients = new Map<string, CdpClient>(); // tabId → CdpClient
  private defaultPorts = [9222, 9223, 9224, 9225];
  private installedBrowsers: Array<{ name: string; path: string }> = [];
  private config: BrowserControlConfig;
  private initialized = false;

  // Stats
  private totalTabsManaged = 0;
  private totalNavigations = 0;
  private totalScreenshots = 0;
  private totalSearchesInBrowser = 0;

  constructor(config?: Partial<BrowserControlConfig>) {
    this.config = {
      enabled: true,
      autoDiscover: true,
      defaultPorts: [9222, 9223, 9224, 9225],
      autoLaunchChrome: false,
      autoLaunchBrave: false,
      headless: false,
      screenshotDir: "./vault/browser-screenshots",
      navigationTimeoutMs: 15000,
      maxConcurrentTabs: 20,
      chromePath: undefined,
      bravePath: undefined,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Find installed browsers
    this.installedBrowsers = findInstalledBrowsers();
    console.log(`[BrowserControl] Found ${this.installedBrowsers.length} installed browsers: ${this.installedBrowsers.map(b => b.name).join(", ") || "none"}`);

    // Auto-discover running browser instances
    if (this.config.autoDiscover) {
      await this.discoverBrowsers();
    }

    // Auto-launch browsers if configured and none running
    if (this.config.autoLaunchChrome && !this.getBrowserByName("chrome")) {
      await this.launchBrowser("chrome");
    }
    if (this.config.autoLaunchBrave && !this.getBrowserByName("brave")) {
      await this.launchBrowser("brave");
    }

    // Ensure screenshot directory exists
    try {
      fs.mkdirSync(this.config.screenshotDir!, { recursive: true });
    } catch { /* ignore */ }

    this.initialized = true;
  }

  // ─── Discovery ─────────────────────────────────────────────────────────

  async discoverBrowsers(): Promise<BrowserInstance[]> {
    const discovered: BrowserInstance[] = [];

    // Method 1: Detect running browsers with --remote-debugging-port
    const running = detectRunningBrowsers();
    for (const rb of running) {
      const id = `${rb.name}_${rb.port}`;
      const url = `http://localhost:${rb.port}`;
      const instance: BrowserInstance = {
        id,
        name: rb.name,
        cdpUrl: url,
        pid: rb.pid,
        connected: false,
      };

      // Verify connectivity
      if (await isPortOpen("localhost", rb.port)) {
        instance.connected = true;
        instance.connectedAt = Date.now();
      }

      this.browsers.set(id, instance);
      discovered.push(instance);
    }

    // Method 2: Try default ports if no running browsers found
    if (running.length === 0) {
      for (const port of this.config.defaultPorts || this.defaultPorts) {
        if (await isPortOpen("localhost", port)) {
          try {
            const resp = await fetch(`http://localhost:${port}/json/version`, {
              signal: AbortSignal.timeout(3000),
            });
            if (resp.ok) {
              const info = (await resp.json()) as CdpBrowserInfo;
              const browserName = info.Browser.toLowerCase().includes("brave") ? "brave" : "chrome";
              const id = `${browserName}_${port}`;
              const instance: BrowserInstance = {
                id,
                name: browserName,
                cdpUrl: `http://localhost:${port}`,
                connected: true,
                connectedAt: Date.now(),
              };
              this.browsers.set(id, instance);
              discovered.push(instance);
            }
          } catch { /* port open but not a CDP endpoint */ }
        }
      }
    }

    console.log(`[BrowserControl] Discovered ${discovered.length} browser instances`);
    return discovered;
  }

  // ─── Launch ───────────────────────────────────────────────────────────

  async launchBrowser(name: "chrome" | "brave"): Promise<BrowserInstance | null> {
    const installed = this.installedBrowsers.find((b) => b.name === name);
    const configPath = name === "chrome" ? this.config.chromePath : this.config.bravePath;
    const exePath = configPath || installed?.path;

    if (!exePath) {
      console.warn(`[BrowserControl] ${name} not found on this system`);
      return null;
    }

    // Find an available port
    let port = 9222;
    for (const p of this.config.defaultPorts || this.defaultPorts) {
      if (!(await isPortOpen("localhost", p))) {
        port = p;
        break;
      }
    }

    const args = [
      `--remote-debugging-port=${port}`,
      "--no-first-run",
      "--no-default-browser-check",
    ];

    if (this.config.headless) {
      args.push("--headless=new");
    }

    // Create a user data dir for this instance
    const userDataDir = path.join(os.tmpdir(), `mai-${name}-${port}`);
    args.push(`--user-data-dir=${userDataDir}`);

    try {
      const child = spawn(exePath, args, {
        detached: !this.config.headless,
        stdio: "ignore",
      });
      if (!this.config.headless) {
        child.unref();
      }

      // Wait for the debugging port to become available
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isPortOpen("localhost", port)) {
          const instance: BrowserInstance = {
            id: `${name}_${port}`,
            name,
            cdpUrl: `http://localhost:${port}`,
            pid: child.pid,
            userDataDir,
            connected: true,
            connectedAt: Date.now(),
          };
          this.browsers.set(instance.id, instance);
          console.log(`[BrowserControl] Launched ${name} on port ${port} (PID: ${child.pid})`);
          return instance;
        }
      }

      console.warn(`[BrowserControl] ${name} launched but CDP port ${port} not ready`);
      return null;
    } catch (err) {
      console.error(`[BrowserControl] Failed to launch ${name}:`, err);
      return null;
    }
  }

  // ─── Tab Operations ──────────────────────────────────────────────────

  async listTabs(browserId?: string): Promise<BrowserTab[]> {
    const targets = await this.getTargets(browserId);
    const tabs: BrowserTab[] = [];

    for (const t of targets) {
      if (t.type === "page") {
        const brId = browserId || this.findBrowserForTarget(t.id);
        tabs.push({
          id: t.id,
          browserId: brId || "unknown",
          browserName: this.browsers.get(brId || "")?.name || "unknown",
          url: t.url,
          title: t.title,
          type: "page",
        });
      }
    }

    return tabs;
  }

  async getTabInfo(tabId: string): Promise<BrowserTab | null> {
    // Search across all browsers for this tab
    for (const [, browser] of this.browsers) {
      if (!browser.connected) continue;
      try {
        const resp = await fetch(`${browser.cdpUrl}/json/list`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) continue;
        const targets = (await resp.json()) as CdpTarget[];
        const target = targets.find((t) => t.id === tabId);
        if (target) {
          return {
            id: target.id,
            browserId: browser.id,
            browserName: browser.name,
            url: target.url,
            title: target.title,
            type: (target.type as "page" | "background") || "page",
          };
        }
      } catch { /* skip */ }
    }
    return null;
  }

  async searchTabs(query: string): Promise<BrowserTab[]> {
    const allTabs = await this.listTabs();
    const lowerQuery = query.toLowerCase();
    return allTabs.filter(
      (tab) =>
        tab.title.toLowerCase().includes(lowerQuery) ||
        tab.url.toLowerCase().includes(lowerQuery)
    );
  }

  async newTab(browserId?: string, url?: string): Promise<BrowserTab | null> {
    const browser = browserId
      ? this.browsers.get(browserId)
      : this.getFirstConnectedBrowser();

    if (!browser || !browser.connected) {
      return null;
    }

    try {
      const newTabUrl = url
        ? `${browser.cdpUrl}/json/new?${encodeURIComponent(url)}`
        : `${browser.cdpUrl}/json/new`;

      const resp = await fetch(newTabUrl, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) return null;

      const target = (await resp.json()) as CdpTarget;
      this.totalTabsManaged++;

      return {
        id: target.id,
        browserId: browser.id,
        browserName: browser.name,
        url: target.url || url || "about:blank",
        title: target.title || "New Tab",
        type: "page",
      };
    } catch {
      return null;
    }
  }

  async closeTab(tabId: string): Promise<boolean> {
    const browserId = this.findBrowserForTarget(tabId);
    const browser = browserId ? this.browsers.get(browserId) : null;
    if (!browser || !browser.connected) return false;

    try {
      const resp = await fetch(`${browser.cdpUrl}/json/close/${tabId}`, {
        signal: AbortSignal.timeout(5000),
      });
      // Disconnect the CDP client for this tab if any
      const client = this.tabClients.get(tabId);
      if (client) {
        client.disconnect();
        this.tabClients.delete(tabId);
      }
      return resp.ok;
    } catch {
      return false;
    }
  }

  async activateTab(tabId: string): Promise<boolean> {
    const client = await this.getTabClient(tabId);
    if (!client) return false;

    try {
      await client.send("Target.activateTarget", { targetId: tabId });
      return true;
    } catch {
      return false;
    }
  }

  // ─── Navigation ─────────────────────────────────────────────────────

  async navigate(tabId: string, url: string): Promise<NavigationResult> {
    const client = await this.getTabClient(tabId);
    if (!client) {
      return { tabId, url, title: "", status: "error", elapsed_ms: 0 };
    }

    const start = Date.now();
    try {
      const result = (await client.send(
        "Page.navigate",
        { url },
        this.config.navigationTimeoutMs
      )) as { frameId: string; loaderId: string; errorText?: string } | undefined;

      const elapsed = Date.now() - start;
      this.totalNavigations++;

      if (result?.errorText) {
        return { tabId, url, title: "", status: "error", elapsed_ms: elapsed };
      }

      // Wait for page load
      try {
        await client.send("Page.loadEventFired", {}, this.config.navigationTimeoutMs);
      } catch { /* timeout is ok */ }

      // Get the title
      let title = "";
      try {
        const titleResult = (await client.send("Runtime.evaluate", {
          expression: "document.title",
          returnByValue: true,
        })) as { result: { value: string } };
        title = titleResult?.result?.value || "";
      } catch { /* ignore */ }

      return { tabId, url, title, status: "navigated", elapsed_ms: Date.now() - start };
    } catch (err) {
      return {
        tabId,
        url,
        title: "",
        status: Date.now() - start >= this.config.navigationTimeoutMs! ? "timeout" : "error",
        elapsed_ms: Date.now() - start,
      };
    }
  }

  async googleSearch(tabId: string, query: string): Promise<NavigationResult> {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    this.totalSearchesInBrowser++;
    return this.navigate(tabId, searchUrl);
  }

  // ─── Content Extraction ─────────────────────────────────────────────

  async getPageContent(tabId: string, includeHtml = false): Promise<PageContent | null> {
    const client = await this.getTabClient(tabId);
    if (!client) return null;

    try {
      // Extract visible text
      const textResult = (await client.send("Runtime.evaluate", {
        expression: `(() => {
          const body = document.body;
          if (!body) return "";
          // Remove scripts and styles for text extraction
          const clone = body.cloneNode(true);
          clone.querySelectorAll('script, style, noscript, iframe, svg').forEach(el => el.remove());
          return clone.innerText || clone.textContent || "";
        })()`,
        returnByValue: true,
      })) as { result: { value: string } };

      // Extract links
      const linksResult = (await client.send("Runtime.evaluate", {
        expression: `(() => {
          return Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map(a => ({
            text: (a.textContent || '').trim().slice(0, 100),
            href: a.href
          })).filter(l => l.text && l.href);
        })()`,
        returnByValue: true,
      })) as { result: { value: Array<{ text: string; href: string }> } };

      // Get URL and title
      const urlResult = (await client.send("Runtime.evaluate", {
        expression: "window.location.href",
        returnByValue: true,
      })) as { result: { value: string } };
      const titleResult = (await client.send("Runtime.evaluate", {
        expression: "document.title",
        returnByValue: true,
      })) as { result: { value: string } };

      let html: string | undefined;
      if (includeHtml) {
        const htmlResult = (await client.send("Runtime.evaluate", {
          expression: "document.documentElement.outerHTML",
          returnByValue: true,
        })) as { result: { value: string } };
        html = htmlResult?.result?.value;
      }

      return {
        tabId,
        url: urlResult?.result?.value || "",
        title: titleResult?.result?.value || "",
        text: (textResult?.result?.value || "").slice(0, 50000),
        html,
        links: linksResult?.result?.value || [],
      };
    } catch {
      return null;
    }
  }

  async extractSearchResults(tabId: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const client = await this.getTabClient(tabId);
    if (!client) return [];

    try {
      const result = (await client.send("Runtime.evaluate", {
        expression: `(() => {
          const results = [];
          // Google search results
          document.querySelectorAll('div.g, div[data-sokoban-container]').forEach(el => {
            const titleEl = el.querySelector('h3');
            const linkEl = el.querySelector('a[href]');
            const snippetEl = el.querySelector('[data-sncf], [style*="-webkit-line-clamp"], div[style], span[style]');
            if (titleEl && linkEl) {
              results.push({
                title: titleEl.textContent || '',
                url: linkEl.href || '',
                snippet: (snippetEl?.textContent || '').trim().slice(0, 300)
              });
            }
          });
          // Also try simpler selectors
          if (results.length === 0) {
            document.querySelectorAll('a[href^="http"]').forEach(a => {
              const h3 = a.querySelector('h3');
              if (h3) {
                const parent = a.closest('div') || a.parentElement;
                results.push({
                  title: h3.textContent || '',
                  url: a.href,
                  snippet: (parent?.textContent || '').replace(h3.textContent || '', '').trim().slice(0, 300)
                });
              }
            });
          }
          return results.slice(0, 15);
        })()`,
        returnByValue: true,
      })) as { result: { value: Array<{ title: string; url: string; snippet: string }> } };

      return result?.result?.value || [];
    } catch {
      return [];
    }
  }

  // ─── Screenshots ────────────────────────────────────────────────────

  async takeScreenshot(tabId: string, fullPage = false): Promise<ScreenshotResult | null> {
    const client = await this.getTabClient(tabId);
    if (!client) return null;

    try {
      // First enable Page domain
      await client.send("Page.enable");

      const result = (await client.send("Page.captureScreenshot", {
        format: "png",
        quality: 80,
        captureBeyondViewport: fullPage,
      })) as { data: string };

      if (!result?.data) return null;

      // Get viewport dimensions
      const metrics = (await client.send("Runtime.evaluate", {
        expression: "JSON.stringify({width: window.innerWidth, height: window.innerHeight})",
        returnByValue: true,
      })) as { result: { value: string } };
      const dims = JSON.parse(metrics?.result?.value || '{"width":1280,"height":720}');

      this.totalScreenshots++;

      // Save to file
      const filename = `screenshot_${tabId}_${Date.now()}.png`;
      const filepath = path.join(this.config.screenshotDir!, filename);
      try {
        fs.writeFileSync(filepath, Buffer.from(result.data, "base64"));
      } catch { /* save failed, still return data */ }

      return {
        tabId,
        data: result.data,
        format: "png",
        width: dims.width || 1280,
        height: dims.height || 720,
      };
    } catch {
      return null;
    }
  }

  // ─── JavaScript Evaluation ──────────────────────────────────────────

  async evaluateJs(tabId: string, expression: string): Promise<JsEvalResult> {
    const client = await this.getTabClient(tabId);
    if (!client) {
      return { tabId, result: null, error: "No CDP connection to tab" };
    }

    try {
      const result = (await client.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
        timeout: 10000,
      })) as {
        result: { value: unknown; type: string };
        exceptionDetails?: { text: string; exception?: { description?: string } };
      };

      if (result?.exceptionDetails) {
        return {
          tabId,
          result: null,
          error: result.exceptionDetails.text || result.exceptionDetails.exception?.description || "JS error",
        };
      }

      return { tabId, result: result?.result?.value ?? null };
    } catch (err) {
      return {
        tabId,
        result: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ─── Browser-level Operations ──────────────────────────────────────

  async getBrowserInfo(browserId: string): Promise<CdpBrowserInfo | null> {
    const browser = this.browsers.get(browserId);
    if (!browser || !browser.connected) return null;

    try {
      const resp = await fetch(`${browser.cdpUrl}/json/version`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return null;
      return (await resp.json()) as CdpBrowserInfo;
    } catch {
      return null;
    }
  }

  listBrowsers(): BrowserInstance[] {
    return Array.from(this.browsers.values());
  }

  getStats(): BrowserStats {
    const browsers = Array.from(this.browsers.values());
    return {
      totalBrowsers: browsers.length,
      connectedBrowsers: browsers.filter((b) => b.connected).length,
      totalTabs: this.totalTabsManaged,
      browserNames: [...new Set(browsers.map((b) => b.name))],
      protocols: ["CDP"],
    };
  }

  shutdown(): void {
    // Disconnect all tab clients
    for (const [, client] of this.tabClients) {
      client.disconnect();
    }
    this.tabClients.clear();
    this.browsers.clear();
    this.initialized = false;
    console.log("[BrowserControl] Shut down.");
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  private async getTargets(browserId?: string): Promise<CdpTarget[]> {
    if (browserId) {
      const browser = this.browsers.get(browserId);
      if (!browser || !browser.connected) return [];
      try {
        const resp = await fetch(`${browser.cdpUrl}/json/list`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) return [];
        return (await resp.json()) as CdpTarget[];
      } catch {
        return [];
      }
    }

    // All browsers
    const allTargets: CdpTarget[] = [];
    for (const [, browser] of this.browsers) {
      if (!browser.connected) continue;
      try {
        const resp = await fetch(`${browser.cdpUrl}/json/list`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) continue;
        const targets = (await resp.json()) as CdpTarget[];
        allTargets.push(...targets);
      } catch { /* skip */ }
    }
    return allTargets;
  }

  private findBrowserForTarget(tabId: string): string | null {
    // This is a best-effort mapping — we'd need to check each browser
    // For efficiency, just return the first connected browser's ID
    const first = this.getFirstConnectedBrowser();
    return first?.id || null;
  }

  private getFirstConnectedBrowser(): BrowserInstance | null {
    for (const [, browser] of this.browsers) {
      if (browser.connected) return browser;
    }
    return null;
  }

  private getBrowserByName(name: string): BrowserInstance | null {
    for (const [, b] of this.browsers) {
      if (b.name === name && b.connected) return b;
    }
    return null;
  }

  private async getTabClient(tabId: string): Promise<CdpClient | null> {
    // Check cache
    const cached = this.tabClients.get(tabId);
    if (cached && cached.isConnected()) return cached;

    // Find the browser that has this tab
    for (const [, browser] of this.browsers) {
      if (!browser.connected) continue;
      try {
        const resp = await fetch(`${browser.cdpUrl}/json/list`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) continue;
        const targets = (await resp.json()) as CdpTarget[];
        const target = targets.find((t) => t.id === tabId);
        if (target?.webSocketDebuggerUrl) {
          const client = new CdpClient();
          await client.connect(target.webSocketDebuggerUrl);
          this.tabClients.set(tabId, client);
          return client;
        }
      } catch { /* skip */ }
    }

    return null;
  }
}

// ─── Config Type ──────────────────────────────────────────────────────────

export interface BrowserControlConfig {
  enabled?: boolean;
  autoDiscover?: boolean;
  defaultPorts?: number[];
  autoLaunchChrome?: boolean;
  autoLaunchBrave?: boolean;
  headless?: boolean;
  screenshotDir?: string;
  navigationTimeoutMs?: number;
  maxConcurrentTabs?: number;
  chromePath?: string;
  bravePath?: string;
}

// ─── Singleton ────────────────────────────────────────────────────────────

let _instance: BrowserControlManager | null = null;

export function getBrowserControlManager(
  config?: Partial<BrowserControlConfig>
): BrowserControlManager {
  if (!_instance) {
    _instance = new BrowserControlManager(config);
  }
  return _instance;
}
