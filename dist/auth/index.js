"use strict";
// ─── M.A.I. Auth Module ──────────────────────────────────────────────
// Barrel export for the authentication system.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsMiddleware = exports.createRateLimitMiddleware = exports.requirePermission = exports.requireRole = exports.requireAuth = exports.createAuthMiddleware = exports.DevicePairingManager = exports.SessionManager = exports.AuthManager = void 0;
__exportStar(require("./types.js"), exports);
__exportStar(require("./permissions.js"), exports);
var AuthManager_js_1 = require("./AuthManager.js");
Object.defineProperty(exports, "AuthManager", { enumerable: true, get: function () { return AuthManager_js_1.AuthManager; } });
var SessionManager_js_1 = require("./SessionManager.js");
Object.defineProperty(exports, "SessionManager", { enumerable: true, get: function () { return SessionManager_js_1.SessionManager; } });
var DevicePairing_js_1 = require("./DevicePairing.js");
Object.defineProperty(exports, "DevicePairingManager", { enumerable: true, get: function () { return DevicePairing_js_1.DevicePairingManager; } });
var middleware_js_1 = require("./middleware.js");
Object.defineProperty(exports, "createAuthMiddleware", { enumerable: true, get: function () { return middleware_js_1.createAuthMiddleware; } });
Object.defineProperty(exports, "requireAuth", { enumerable: true, get: function () { return middleware_js_1.requireAuth; } });
Object.defineProperty(exports, "requireRole", { enumerable: true, get: function () { return middleware_js_1.requireRole; } });
Object.defineProperty(exports, "requirePermission", { enumerable: true, get: function () { return middleware_js_1.requirePermission; } });
Object.defineProperty(exports, "createRateLimitMiddleware", { enumerable: true, get: function () { return middleware_js_1.createRateLimitMiddleware; } });
Object.defineProperty(exports, "corsMiddleware", { enumerable: true, get: function () { return middleware_js_1.corsMiddleware; } });
//# sourceMappingURL=index.js.map