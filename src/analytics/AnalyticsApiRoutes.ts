// ─── M.A.I. Analytics API Routes ──────────────────────────────────
// HTTP API route handlers for the analytics engine.
// These handlers are designed to be wired into server.ts.
//
// Endpoints:
//   GET /api/analytics/report     - get report for time period
//   GET /api/analytics/realtime    - real-time session stats
//   GET /api/analytics/top-commands - most used commands
//   GET /api/analytics/usage       - usage pattern data
//   GET /api/analytics/export      - export data (json or csv)

import type { ServerResponse, IncomingMessage } from "node:http";
import { getAnalyticsEngine } from "./AnalyticsEngine.js";
import type { ExportFormat } from "./types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseQuery(req: IncomingMessage): Record<string, string> {
  const url = new URL(req.url ?? "/", `http://localhost`);
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => { params[key] = value; });
  return params;
}

function sendJson(res: ServerResponse, data: unknown, status: number = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status: number = 400): void {
  sendJson(res, { ok: false, error: message }, status);
}

// ─── Route Handlers ────────────────────────────────────────────────────────

/**
 * GET /api/analytics/report
 * Query params: from (epoch ms, required), to (epoch ms, optional), period (hourly|daily|weekly|monthly)
 */
export function handleReport(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", 405);
  }

  const params = parseQuery(req);
  const from = parseInt(params.from, 10);
  const to = params.to ? parseInt(params.to, 10) : undefined;

  if (isNaN(from)) {
    return sendError(res, "Missing or invalid 'from' parameter (epoch ms)");
  }

  // Resolve time ranges from period shortcuts
  let resolvedFrom = from;
  let resolvedTo = to;

  if (params.period) {
    const now = Date.now();
    const periodMs: Record<string, number> = {
      hourly: 3_600_000,
      daily: 86_400_000,
      weekly: 604_800_000,
      monthly: 2_592_000_000,
    };
    const ms = periodMs[params.period];
    if (ms) {
      resolvedFrom = now - ms;
      resolvedTo = now;
    }
  }

  try {
    const engine = getAnalyticsEngine();
    const report = engine.generateReport(resolvedFrom, resolvedTo);
    sendJson(res, { ok: true, report });
  } catch (err) {
    sendError(res, `Failed to generate report: ${err instanceof Error ? err.message : err}`, 500);
  }
}

/**
 * GET /api/analytics/realtime
 * Returns current session statistics.
 */
export function handleRealtime(_req: IncomingMessage, res: ServerResponse): void {
  if (_req.method !== "GET") {
    return sendError(res, "Method not allowed", 405);
  }

  try {
    const engine = getAnalyticsEngine();
    const stats = engine.getRealtimeStats();
    sendJson(res, { ok: true, stats });
  } catch (err) {
    sendError(res, `Failed to get realtime stats: ${err instanceof Error ? err.message : err}`, 500);
  }
}

/**
 * GET /api/analytics/top-commands
 * Query params: limit (number, default 10), from (epoch ms), to (epoch ms)
 */
export function handleTopCommands(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", 405);
  }

  const params = parseQuery(req);
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 10, 1), 100);
  const from = params.from ? parseInt(params.from, 10) : undefined;
  const to = params.to ? parseInt(params.to, 10) : undefined;

  try {
    const engine = getAnalyticsEngine();
    const commands = engine.getTopCommands(limit, from, to);
    sendJson(res, { ok: true, commands });
  } catch (err) {
    sendError(res, `Failed to get top commands: ${err instanceof Error ? err.message : err}`, 500);
  }
}

/**
 * GET /api/analytics/usage
 * Query params: from (epoch ms), to (epoch ms), period (hourly|daily|weekly|monthly)
 */
export function handleUsage(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", 405);
  }

  const params = parseQuery(req);
  const from = params.from ? parseInt(params.from, 10) : undefined;
  const to = params.to ? parseInt(params.to, 10) : undefined;

  // Resolve time ranges from period shortcuts
  let resolvedFrom = from;
  let resolvedTo = to;

  if (params.period) {
    const now = Date.now();
    const periodMs: Record<string, number> = {
      hourly: 3_600_000,
      daily: 86_400_000,
      weekly: 604_800_000,
      monthly: 2_592_000_000,
    };
    const ms = periodMs[params.period];
    if (ms) {
      resolvedFrom = now - ms;
      resolvedTo = now;
    }
  }

  try {
    const engine = getAnalyticsEngine();
    const pattern = engine.getUsagePattern(resolvedFrom, resolvedTo);
    sendJson(res, { ok: true, pattern });
  } catch (err) {
    sendError(res, `Failed to get usage pattern: ${err instanceof Error ? err.message : err}`, 500);
  }
}

/**
 * GET /api/analytics/export
 * Query params: format (json|csv, default json), from (epoch ms), to (epoch ms)
 */
export function handleExport(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", 405);
  }

  const params = parseQuery(req);
  const format = (params.format === "csv" ? "csv" : "json") as ExportFormat;

  try {
    const engine = getAnalyticsEngine();
    const data = engine.exportData(format);

    const contentType = format === "csv"
      ? "text/csv; charset=utf-8"
      : "application/json; charset=utf-8";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="mai-analytics-${Date.now()}.${format}"`,
    });
    res.end(data);
  } catch (err) {
    sendError(res, `Export failed: ${err instanceof Error ? err.message : err}`, 500);
  }
}

// ─── Router ────────────────────────────────────────────────────────────────

/**
 * Route a request to the appropriate analytics handler.
 * Returns true if the request was handled, false otherwise.
 *
 * Usage in server.ts:
 *   if (analyticsRouter(req, res)) return;
 */
export function analyticsRouter(req: IncomingMessage, res: ServerResponse): boolean {
  const url = req.url ?? "/";

  if (url.startsWith("/api/analytics/report")) {
    handleReport(req, res);
    return true;
  }

  if (url.startsWith("/api/analytics/realtime")) {
    handleRealtime(req, res);
    return true;
  }

  if (url.startsWith("/api/analytics/top-commands")) {
    handleTopCommands(req, res);
    return true;
  }

  if (url.startsWith("/api/analytics/usage")) {
    handleUsage(req, res);
    return true;
  }

  if (url.startsWith("/api/analytics/export")) {
    handleExport(req, res);
    return true;
  }

  return false;
}
