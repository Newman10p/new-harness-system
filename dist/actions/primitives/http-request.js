"use strict";
// ─── http-request ──────────────────────────────────────────────────────────
// Makes an HTTP request using native fetch (Node 18+).
// Supports GET, POST, PUT, DELETE with JSON body and headers.
// 30-second hard timeout.
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpRequest = httpRequest;
const constants_js_1 = require("../../core/constants.js");
async function httpRequest(action, _ctx) {
    const url = String(action.url ?? "");
    const method = String(action.method ?? "GET").toUpperCase();
    const headers = action.headers;
    const body = action.body;
    if (!url) {
        return { ok: false, error: "Missing required field: url" };
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), constants_js_1.HTTP_TIMEOUT_MS);
        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        clearTimeout(timeout);
        const contentType = response.headers.get("content-type") ?? "";
        const text = await response.text();
        let data;
        if (contentType.includes("application/json")) {
            try {
                data = JSON.parse(text);
            }
            catch {
                data = text;
            }
        }
        else {
            data = text;
        }
        return {
            ok: response.ok,
            data: {
                status: response.status,
                statusText: response.statusText,
                data,
            },
            error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `HTTP request failed: ${message}` };
    }
}
//# sourceMappingURL=http-request.js.map