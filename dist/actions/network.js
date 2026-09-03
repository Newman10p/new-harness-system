"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.netFetchAction = void 0;
exports.registerNetworkActions = registerNetworkActions;
const actionsRegistry_1 = require("../registry/actionsRegistry");
class NetFetchAction {
    name = "net.fetch";
    description = "Simple HTTP GET/POST with domain allowlist";
    async run(input) {
        const { url, method = "GET", headers = {}, body } = input;
        if (!url)
            throw new Error("net.fetch requires 'url'");
        // Domain allowlist check
        const allowedDomains = global.__allowedNetworkDomains ?? [];
        try {
            const parsed = new URL(url);
            if (allowedDomains.length > 0) {
                const isAllowed = allowedDomains.some((d) => parsed.hostname === d || parsed.hostname.endsWith("." + d));
                if (!isAllowed) {
                    throw new Error(`Domain not in network allowlist: ${parsed.hostname}`);
                }
            }
        }
        catch (error) {
            if (error instanceof Error && error.message.startsWith("Domain not in"))
                throw error;
            throw new Error(`Invalid URL: ${url}`);
        }
        const response = await fetch(url, {
            method,
            headers: { "User-Agent": "Jarvis-Harness/1.0", ...headers },
            body: method === "POST" ? body : undefined
        });
        const responseHeaders = {};
        response.headers.forEach((value, key) => { responseHeaders[key] = value; });
        let data;
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
            data = await response.json();
        }
        else {
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
exports.netFetchAction = new NetFetchAction();
function registerNetworkActions() {
    actionsRegistry_1.globalActionRegistry.register(exports.netFetchAction, {
        name: "net.fetch", description: "Simple HTTP GET/POST with domain allowlist", requiresConfirmation: true, category: "network"
    });
}
//# sourceMappingURL=network.js.map