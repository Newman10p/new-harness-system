/** Permission tiers for M.A.I. users. */
export type UserRole = "owner" | "admin" | "user" | "guest";
/** Supported authentication methods. */
export type AuthMethod = "qr-pair" | "password" | "token" | "biometric";
/** Session validity status. */
export type SessionStatus = "active" | "expired" | "revoked";
/** Device pairing lifecycle states. */
export type PairingStatus = "pending" | "claimed" | "expired" | "revoked";
export interface User {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
    authMethods: AuthMethod[];
    createdAt: number;
    lastSeen: number;
    /** Arbitrary user preferences (theme, language, etc.). */
    preferences: Record<string, unknown>;
    /** IDs of devices paired to this user. */
    deviceIds: string[];
    /** Hashed password (scrypt output, never store plaintext). */
    passwordHash?: string;
    /** Salt used for password hashing (hex-encoded). */
    passwordSalt?: string;
    /** Whether the user must change their password on next login. */
    mustChangePassword: boolean;
    /** Whether the user account is active. */
    active: boolean;
}
export interface Session {
    id: string;
    userId: string;
    deviceId: string;
    /** Communication channel: "local", "sms", "telegram", "web", etc. */
    channel: string;
    createdAt: number;
    lastActivity: number;
    expiresAt: number;
    ip?: string;
    userAgent?: string;
    valid: boolean;
    /** Optional device fingerprint for session binding. */
    deviceFingerprint?: string;
}
export interface AuthToken {
    token: string;
    userId: string;
    deviceId: string;
    createdAt: number;
    expiresAt: number;
    /** Permission scopes granted by this token (e.g. ["chat", "control", "admin"]). */
    scope: string[];
}
export interface DevicePairing {
    id: string;
    /** 6-digit alphanumeric pairing code. */
    pairingCode: string;
    /** QR code payload (JSON-encoded connection info). */
    qrData: string;
    /** User ID — null until a user claims this pairing. */
    userId: string | null;
    /** Human-readable device name provided by the device. */
    deviceName: string;
    status: PairingStatus;
    createdAt: number;
    expiresAt: number;
    /** Device ID assigned after successful pairing. */
    deviceId?: string;
}
export interface Permission {
    /** Resource identifier. "*" means all resources. */
    resource: string;
    /** Actions permitted on the resource. */
    actions: string[];
    /** Optional CEL-like condition expression. */
    condition?: string;
}
/** Maps each role to its set of permissions. */
export interface RolePermissions {
    owner: Permission[];
    admin: Permission[];
    user: Permission[];
    guest: Permission[];
}
export interface AuthState {
    users: Record<string, User>;
    sessions: Record<string, Session>;
    tokens: Record<string, AuthToken>;
    pairings: Record<string, DevicePairing>;
    /** HMAC secret key (hex-encoded) for token signing. */
    hmacSecret: string;
    /** Audit log of auth events. */
    authLog: AuthLogEntry[];
}
export type AuthEventType = "user.created" | "user.login" | "user.logout" | "user.deleted" | "user.role_changed" | "user.password_changed" | "session.created" | "session.extended" | "session.expired" | "session.revoked" | "token.created" | "token.validated" | "token.expired" | "token.revoked" | "pairing.initiated" | "pairing.claimed" | "pairing.expired" | "pairing.revoked" | "device.added" | "device.revoked" | "auth.failed" | "auth.rate_limited";
export interface AuthLogEntry {
    type: AuthEventType;
    timestamp: number;
    userId?: string;
    sessionId?: string;
    deviceId?: string;
    detail: string;
    ip?: string;
}
export interface AuthStats {
    totalUsers: number;
    activeSessions: number;
    activeTokens: number;
    pendingPairings: number;
    usersByRole: Record<UserRole, number>;
    totalAuthEvents: number;
    lastCleanupAt: number | null;
}
export interface AuthConfig {
    /** Path to the persisted auth state JSON file. */
    statePath: string;
    /** Default session duration in milliseconds (default: 24 hours). */
    sessionTtlMs: number;
    /** Default token duration in milliseconds (default: 1 hour). */
    tokenTtlMs: number;
    /** Pairing code duration in milliseconds (default: 5 minutes). */
    pairingTtlMs: number;
    /** Maximum concurrent sessions per user (0 = unlimited). */
    maxSessionsPerUser: number;
    /** Maximum pending (unclaimed) pairings at once. */
    maxPendingPairings: number;
    /** Auto-cleanup interval in milliseconds (0 = disabled). */
    cleanupIntervalMs: number;
}
export declare const DEFAULT_AUTH_CONFIG: AuthConfig;
export interface RateLimitEntry {
    count: number;
    windowStart: number;
}
export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}
export interface AuthContext {
    user: User;
    session: Session;
    token?: AuthToken;
}
export interface AuthenticatedRequest {
    auth?: AuthContext;
    [key: string]: unknown;
}
//# sourceMappingURL=types.d.ts.map