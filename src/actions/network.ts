import { HarnessAction, ActionMeta } from "./types";
import { globalActionRegistry } from "../registry/actionsRegistry";

export interface NetFetchInput {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

export interface NetFetchOutput {
  status: number;
  statusText: string;
  data: unknown;
  headers: Record<string, string>;
}

class NetFetchAction implements HarnessAction {
  name = "net.fetch";
  description = "Simple HTTP GET/POST with domain allowlist";

  async run(input: unknown): Promise<NetFetchOutput> {
    const { url, method = "GET", headers = {}, body } = input as NetFetchInput;
    if (!url) throw new Error("net.fetch requires 'url'");

    // Domain allowlist check
    const allowedDomains: string[] = (global as any).__allowedNetworkDomains ?? [];
    try {
      const parsed = new URL(url);
      if (allowedDomains.length > 0) {
        const isAllowed = allowedDomains.some((d) => parsed.hostname === d || parsed.hostname.endsWith("." + d));
        if (!isAllowed) {
          throw new Error(`Domain not in network allowlist: ${parsed.hostname}`);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Domain not in")) throw error;
      throw new Error(`Invalid URL: ${url}`);
    }

    const response = await fetch(url, {
      method,
      headers: { "User-Agent": "Jarvis-Harness/1.0", ...headers },
      body: method === "POST" ? body : undefined
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

    let data: unknown;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      statusText: response.statusText,
      data,
      headers: responseHeaders
    };
  }
}

export const netFetchAction = new NetFetchAction();

export function registerNetworkActions(): void {
  globalActionRegistry.register(netFetchAction, {
    name: "net.fetch", description: "Simple HTTP GET/POST with domain allowlist", requiresConfirmation: true, category: "network"
  });
}