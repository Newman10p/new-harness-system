import type { Session, AuthToken, AuthLogEntry } from "./types.js";
export interface SessionManagerConfig {
    /** Default session TTL in ms. */
    sessionTtlMs: number;
    /** Default token TTL in ms. */
    tokenTtlMs: number;
    /** Max concurrent sessions per user (0 = unlimited). */
    maxSessionsPerUser: number;
}
export declare class SessionManager {
    private config;
    private sessions;
    private tokens;
    private sessionLog;
    private logFn;
    constructor(config?: Partial<SessionManagerConfig>, logFn?: (entry: AuthLogEntry) => void);
    /**
    * Create a new session for a user/device/channel combination.
    * If the user has hit the concurrent session limit, the oldest
    * session is automatically revoked.
    */
    createSession(userId: string, deviceId: string, channel: string, opts?: {
        ip?: string;
        userAgent?: string;
        deviceFingerprint?: string;
    }): Session;
    /**
    * Validate a session. Returns the session if valid, or null.
    * Automatically marks expired sessions as invalid.
    */
    validateSession(sessionId: string): Session | null;
    /**
    * Extend a session's expiration time (activity-based renewal).
    * Resets the expiry to now + TTL.
    */
    extendSession(sessionId: string): Session | null;
    /**
    * End a session immediately (explicit logout).
    */
    endSession(sessionId: string): boolean;
    /**
    * End all sessions for a given user.
    */
    endAllUserSessions(userId: string): number;
    /**
    * End all sessions for a specific device.
    */
    endAllDeviceSessions(deviceId: string): number;
    /**
    * Create an auth token for a session.
    * Tokens are shorter-lived than sessions and carry scope information.
    */
    createToken(userId: string, deviceId: string, scope: string[]): AuthToken;
    /**
    * Validate a token. Returns the token record if valid, null otherwise.
    */
    validateToken(tokenStr: string): AuthToken | null;
    /**
    * Revoke a specific token.
    */
    revokeToken(tokenStr: string): boolean;
    /**
    * Revoke all tokens for a user.
    */
    revokeAllUserTokens(userId: string): number;
    /** Get a session by ID. */
    getSession(sessionId: string): Session | undefined;
    /** Get all active sessions. */
    getActiveSessions(): Session[];
    /** Get active sessions for a specific user. */
    getUserSessions(userId: string): Session[];
    /** Get all active tokens. */
    getActiveTokens(): AuthToken[];
    /** Count active sessions for a user. */
    countUserSessions(userId: string): number;
    /** Count active tokens. */
    countActiveTokens(): number;
    /** Serialize sessions and tokens for disk storage. */
    serialize(): {
        sessions: Session[];
        tokens: AuthToken[];
        log: AuthLogEntry[];
    };
    /** Restore sessions and tokens from persisted data. */
    restore(data: {
        sessions?: Session[];
        tokens?: AuthToken[];
        log?: AuthLogEntry[];
    }): void;
    /**
    * Remove expired sessions and tokens. Returns counts of removed items.
    */
    cleanup(): {
        sessionsRemoved: number;
        tokensRemoved: number;
    };
    /**
    * Enforce the concurrent session limit for a user.
    * If limit is reached, revoke the oldest session first.
    */
    private enforceSessionLimit;
    /** Log an event and keep in-memory log bounded. */
    private logEvent;
}
//# sourceMappingURL=SessionManager.d.ts.map