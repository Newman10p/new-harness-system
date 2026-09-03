import type { User, Session, AuthToken, DevicePairing, AuthConfig, AuthStats, UserRole } from "./types.js";
export declare class AuthManager {
    private config;
    private state;
    private sessionManager;
    private pairingManager;
    private cleanupTimer;
    private initialized;
    constructor(config?: Partial<AuthConfig>);
    /**
     * Initialize the auth system. Loads persisted state or creates
     * a fresh state with the default admin user.
     */
    initialize(): Promise<void>;
    /**
     * Graceful shutdown — persist state and stop cleanup timer.
     */
    shutdown(): Promise<void>;
    /**
     * Create a new user.  The `actorId` is the user performing the action
     * (must have admin+ permissions to create users).
     */
    createUser(username: string, displayName: string, role: UserRole, password: string, actorId?: string): Promise<User>;
    /**
     * Authenticate a user by username and password.
     * Returns the user and a new session.
     */
    authenticate(username: string, password: string, deviceId: string, channel?: string, opts?: {
        ip?: string;
        userAgent?: string;
    }): Promise<{
        user: User;
        session: Session;
        token: AuthToken;
    }>;
    /**
     * Authenticate via an existing token string.
     * Returns the token record and associated user.
     */
    authenticateToken(tokenStr: string): {
        token: AuthToken;
        user: User;
    } | null;
    /**
     * Validate a session and return the associated user.
     */
    validateSession(sessionId: string): {
        session: Session;
        user: User;
    } | null;
    /**
     * End a session (logout).
     */
    endSession(sessionId: string): boolean;
    /**
     * Change a user's password. Requires the current password (or admin).
     */
    changePassword(userId: string, currentPassword: string, newPassword: string, actorId?: string): Promise<void>;
    /**
     * Initiate a new device pairing (generates QR code data).
     */
    initiatePairing(deviceName: string): DevicePairing;
    /**
     * Complete a pairing — an authenticated user claims a device.
     * Returns the pairing and the new device ID.
     */
    completePairing(pairingCode: string, userId: string): {
        pairing: DevicePairing;
        deviceId: string;
    };
    /**
     * Revoke a device from all sessions and from its owner.
     */
    revokeDevice(deviceId: string, actorId: string): boolean;
    /**
     * Check if a user has a specific permission.
     */
    hasPermission(userId: string, resource: string, action: string): boolean;
    getUser(userId: string): User | undefined;
    listUsers(): User[];
    listSessions(): Session[];
    listPairings(): DevicePairing[];
    getStats(): AuthStats;
    /**
     * Remove expired sessions, tokens, and pairings.
     */
    cleanupExpired(): void;
    /** Persist current state to disk. */
    persistState(): void;
    /** Restore state from a parsed JSON object. */
    private restoreState;
    private emptyState;
    /** Create the default admin user with forced password change. */
    private createDefaultAdmin;
    /** Find a user by username (case-insensitive). */
    private findUserByUsername;
    /**
     * Hash a password using scrypt.
     * Returns both the hash and the salt (both hex-encoded).
     */
    private hashPassword;
    /** Verify a password against a stored hash and salt. */
    private verifyPassword;
    /**
     * Compute a simple HMAC-SHA256 signature for a payload.
     * Not full JWT — just a signature utility for tokens.
     */
    signHmac(payload: string): string;
    /** Verify an HMAC-SHA256 signature. */
    verifyHmac(payload: string, signature: string): boolean;
    /** Default scope for a given role. */
    private defaultScopeForRole;
    /** Append an auth event to the in-memory log (bounded). */
    private logEvent;
}
//# sourceMappingURL=AuthManager.d.ts.map