import type { AuthContext, UserRole, RateLimitConfig } from "./types.js";
import type { AuthManager } from "./AuthManager.js";
export interface MiddlewareRequest {
    headers: Record<string, string | undefined>;
    method: string;
    url: string;
    ip?: string;
    auth?: AuthContext;
    [key: string]: unknown;
}
export interface MiddlewareResponse {
    statusCode?: number;
    statusMessage?: string;
    setHeader?(name: string, value: string): void;
    end?(data?: string): void;
    json?(data: unknown): void;
    writeHead?(statusCode: number, headers?: Record<string, string>): void;
}
export type NextFunction = () => void | Promise<void>;
export type Middleware = (req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction) => void;
/**
 * Creates an authentication middleware bound to an AuthManager.
 *
 * Checks for auth in this order:
 * 1. `Authorization: Bearer <token>` header
 * 2. `X-Session-Id` header
 * 3. `mai-session` cookie
 */
export declare function createAuthMiddleware(authManager: AuthManager): Middleware;
/**
 * Middleware that rejects unauthenticated requests with 401.
 * Must be used AFTER authMiddleware.
 */
export declare function requireAuth(): Middleware;
/**
 * Middleware that only allows users with specific roles.
 * Must be used AFTER authMiddleware.
 */
export declare function requireRole(...roles: UserRole[]): Middleware;
/**
 * Middleware that checks a specific resource/action permission.
 * Must be used AFTER authMiddleware.
 */
export declare function requirePermission(resource: string, action: string): Middleware;
/**
 * Simple in-memory per-IP rate limiter.
 * Not suitable for distributed setups — use Redis for that.
 */
export declare function createRateLimitMiddleware(config: RateLimitConfig): Middleware;
export interface CorsOptions {
    origin?: string | string[];
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
/**
 * CORS middleware for cross-device access.
 * Defaults to permissive settings suitable for local network use.
 */
export declare function corsMiddleware(options?: CorsOptions): Middleware;
//# sourceMappingURL=middleware.d.ts.map