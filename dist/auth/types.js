"use strict";
// ─── M.A.I. Authentication Type Definitions ──────────────────────────────────
// Core types for the multi-user authentication, session management,
// device pairing, and role-based access control system.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AUTH_CONFIG = void 0;
exports.DEFAULT_AUTH_CONFIG = {
    statePath: "state/auth.json",
    sessionTtlMs: 24 * 60 * 60 * 1000, // 24 hours
    tokenTtlMs: 60 * 60 * 1000, // 1 hour
    pairingTtlMs: 5 * 60 * 1000, // 5 minutes
    maxSessionsPerUser: 0, // unlimited
    maxPendingPairings: 5,
    cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
};
//# sourceMappingURL=types.js.map