"use strict";
// ─── M.A.I. Auth Middleware ──────────────────────────────────────────────
// Express/HTTP middleware for authentication, authorization,
// rate limiting, and CORS.  Designed to work with the AuthManager.
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthMiddleware = createAuthMiddleware;
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
exports.requirePermission = requirePermission;
exports.createRateLimitMiddleware = createRateLimitMiddleware;
exports.corsMiddleware = corsMiddleware;
const permissions_js_1 = require("./permissions.js");
// ─── Auth Middleware ───────────────────────────────────────────────────────
/**
 * Creates an authentication middleware bound to an AuthManager.
 *
 * Checks for auth in this order:
 * 1. `Authorization: Bearer <token>` header
 * 2. `X-Session-Id` header
 * 3. `mai-session` cookie
 */
function createAuthMiddleware(authManager) {
    return (req, res, next) => {
        // Try Bearer token first
        const authHeader = req.headers["authorization"];
        if (authHeader?.startsWith("Bearer ")) {
            const tokenStr = authHeader.slice(7);
            const result = authManager.authenticateToken(tokenStr);
            if (result) {
                const session = authManager.validateSession(result.token.deviceId);
                req.auth = {
                    user: result.user,
                    session: session?.session ?? {
                        id: "",
                        userId: result.user.id,
                        deviceId: result.token.deviceId,
                        channel: "api",
                        createdAt: result.token.createdAt,
                        lastActivity: result.token.createdAt,
                        expiresAt: result.token.expiresAt,
                        valid: true,
                    },
                    token: result.token,
                };
                return next();
            }
        }
        // Try session ID header
        const sessionId = req.headers["x-session-id"];
        if (sessionId) {
            const result = authManager.validateSession(sessionId);
            if (result) {
                req.auth = {
                    user: result.user,
                    session: result.session,
                };
                return next();
            }
        }
        // Try cookie
        const cookieHeader = req.headers["cookie"];
        if (cookieHeader) {
            const cookies = parseCookies(cookieHeader);
            const sessionCookie = cookies["mai-session"];
            if (sessionCookie) {
                const result = authManager.validateSession(sessionCookie);
                if (result) {
                    req.auth = {
                        user: result.user,
                        session: result.session,
                    };
                    return next();
                }
            }
        }
        // No valid auth found — request remains unauthenticated
        // The caller can use requireAuth() to enforce authentication
        next();
    };
}
// ─── Require Auth ─────────────────────────────────────────────────────────
/**
 * Middleware that rejects unauthenticated requests with 401.
 * Must be used AFTER authMiddleware.
 */
function requireAuth() {
    return (req, res, next) => {
        const authed = req;
        if (!authed.auth) {
            sendError(res, 401, "Authentication required");
            return;
        }
        next();
    };
}
// ─── Role Guard ───────────────────────────────────────────────────────────
/**
 * Middleware that only allows users with specific roles.
 * Must be used AFTER authMiddleware.
 */
function requireRole(...roles) {
    return (req, res, next) => {
        const authed = req;
        if (!authed.auth) {
            sendError(res, 401, "Authentication required");
            return;
        }
        if (!roles.includes(authed.auth.user.role)) {
            sendError(res, 403, `Required role: ${roles.join(" or ")}. Your role: ${authed.auth.user.role}`);
            return;
        }
        next();
    };
}
// ─── Permission Guard ─────────────────────────────────────────────────────
/**
 * Middleware that checks a specific resource/action permission.
 * Must be used AFTER authMiddleware.
 */
function requirePermission(resource, action) {
    return (req, res, next) => {
        const authed = req;
        if (!authed.auth) {
            sendError(res, 401, "Authentication required");
            return;
        }
        if (!(0, permissions_js_1.hasPermission)(authed.auth.user.role, resource, action)) {
            sendError(res, 403, `Permission denied: ${authed.auth.user.role} cannot ${action} on ${resource}`);
            return;
        }
        next();
    };
}
// ─── Rate Limiting ────────────────────────────────────────────────────────
/**
 * Simple in-memory per-IP rate limiter.
 * Not suitable for distributed setups — use Redis for that.
 */
function createRateLimitMiddleware(config) {
    const store = new Map();
    return (req, res, next) => {
        const ip = req.ip ?? "unknown";
        const now = Date.now();
        let entry = store.get(ip);
        // Reset window if expired
        if (!entry || now - entry.windowStart > config.windowMs) {
            entry = { count: 0, windowStart: now };
            store.set(ip, entry);
        }
        entry.count++;
        // Set rate limit headers
        setHeader(res, "X-RateLimit-Limit", String(config.maxRequests));
        setHeader(res, "X-RateLimit-Remaining", String(Math.max(0, config.maxRequests - entry.count)));
        const resetTime = entry.windowStart + config.windowMs;
        setHeader(res, "X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)));
        if (entry.count > config.maxRequests) {
            setHeader(res, "Retry-After", String(Math.ceil(config.windowMs / 1000)));
            sendError(res, 429, "Too many requests. Please try again later.");
            return;
        }
        next();
    };
}
/**
 * CORS middleware for cross-device access.
 * Defaults to permissive settings suitable for local network use.
 */
function corsMiddleware(options = {}) {
    const { origin = "*", methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], allowedHeaders = ["Content-Type", "Authorization", "X-Session-Id"], exposedHeaders = ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"], credentials = true, maxAge = 86400, } = options;
    const origins = Array.isArray(origin) ? origin : [origin];
    return (req, res, next) => {
        const reqOrigin = req.headers["origin"];
        if (origins.includes("*") || (reqOrigin && origins.includes(reqOrigin))) {
            setHeader(res, "Access-Control-Allow-Origin", reqOrigin ?? "*");
        }
        else if (origins[0] !== "*") {
            setHeader(res, "Access-Control-Allow-Origin", origins[0]);
        }
        else {
            setHeader(res, "Access-Control-Allow-Origin", "*");
        }
        setHeader(res, "Access-Control-Allow-Methods", methods.join(", "));
        setHeader(res, "Access-Control-Allow-Headers", allowedHeaders.join(", "));
        setHeader(res, "Access-Control-Expose-Headers", exposedHeaders.join(", "));
        setHeader(res, "Access-Control-Allow-Credentials", String(credentials));
        setHeader(res, "Access-Control-Max-Age", String(maxAge));
        // Handle preflight
        if (req.method === "OPTIONS") {
            if (res.writeHead) {
                res.writeHead(204);
            }
            else {
                res.statusCode = 204;
            }
            if (res.end)
                res.end();
            return;
        }
        next();
    };
}
// ─── Helpers ───────────────────────────────────────────────────────────────
function parseCookies(cookieHeader) {
    const cookies = {};
    for (const part of cookieHeader.split(";")) {
        const trimmed = part.trim();
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1)
            continue;
        const name = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        cookies[name] = value;
    }
    return cookies;
}
function setHeader(res, name, value) {
    if (res.setHeader) {
        res.setHeader(name, value);
    }
}
function sendError(res, status, message) {
    if (res.writeHead) {
        res.writeHead(status, { "Content-Type": "application/json" });
        if (res.end) {
            res.end(JSON.stringify({ error: message, status }));
        }
    }
    else {
        res.statusCode = status;
        res.statusMessage = message;
        if (res.end)
            res.end(message);
    }
}
//# sourceMappingURL=middleware.js.map