// ─── M.A.I. Auth Module ──────────────────────────────────────────────
// Barrel export for the authentication system.

export * from "./types.js";
export * from "./permissions.js";
export { AuthManager } from "./AuthManager.js";
export { SessionManager } from "./SessionManager.js";
export { DevicePairingManager } from "./DevicePairing.js";
export {
  createAuthMiddleware,
  requireAuth,
  requireRole,
  requirePermission,
  createRateLimitMiddleware,
  corsMiddleware,
} from "./middleware.js";
export type {
  MiddlewareRequest,
  MiddlewareResponse,
  NextFunction,
  Middleware,
  CorsOptions,
} from "./middleware.js";
