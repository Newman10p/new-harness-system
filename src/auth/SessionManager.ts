// ─── M.A.I. Session Manager ───────────────────────────────────────────────
// Manages the full lifecycle of user sessions: creation, validation,
// extension, revocation, and persistence.  Supports configurable
// concurrent session limits and activity-based renewal.

import crypto from "node:crypto";
import type {
  Session,
  AuthToken,
  AuthLogEntry,
  AuthConfig,
} from "./types.js";
import { DEFAULT_AUTH_CONFIG } from "./types.js";

// ─── Configuration ──────────────────────────────────────────────────────────

export interface SessionManagerConfig {
 /** Default session TTL in ms. */
 sessionTtlMs: number;
 /** Default token TTL in ms. */
 tokenTtlMs: number;
 /** Max concurrent sessions per user (0 = unlimited). */
 maxSessionsPerUser: number;
}

// ─── Session Manager ────────────────────────────────────────────────────────

export class SessionManager {
 private config: SessionManagerConfig;
 private sessions: Map<string, Session> = new Map();
 private tokens: Map<string, AuthToken> = new Map();
 private sessionLog: AuthLogEntry[] = [];
 private logFn: (entry: AuthLogEntry) => void;

 constructor(
 config?: Partial<SessionManagerConfig>,
 logFn?: (entry: AuthLogEntry) => void
 ) {
 const defaults: SessionManagerConfig = {
 sessionTtlMs: DEFAULT_AUTH_CONFIG.sessionTtlMs,
 tokenTtlMs: DEFAULT_AUTH_CONFIG.tokenTtlMs,
 maxSessionsPerUser: DEFAULT_AUTH_CONFIG.maxSessionsPerUser,
 };
 this.config = { ...defaults, ...config };
 this.logFn = logFn ?? (() => {});
 }

 // ── Session Lifecycle ──────────────────────────────────────────────────────

 /**
 * Create a new session for a user/device/channel combination.
 * If the user has hit the concurrent session limit, the oldest
 * session is automatically revoked.
 */
 createSession(
 userId: string,
 deviceId: string,
 channel: string,
 opts?: { ip?: string; userAgent?: string; deviceFingerprint?: string }
 ): Session {
 this.enforceSessionLimit(userId);

 const now = Date.now();
 const session: Session = {
 id: crypto.randomUUID(),
 userId,
 deviceId,
 channel,
 createdAt: now,
 lastActivity: now,
 expiresAt: now + this.config.sessionTtlMs,
 ip: opts?.ip,
 userAgent: opts?.userAgent,
 deviceFingerprint: opts?.deviceFingerprint,
 valid: true,
 };

 this.sessions.set(session.id, session);

 this.logEvent({
 type: "session.created",
 timestamp: now,
 userId,
 sessionId: session.id,
 deviceId,
 detail: `Session created via ${channel}`,
 ip: opts?.ip,
 });

 return session;
 }

 /**
 * Validate a session. Returns the session if valid, or null.
 * Automatically marks expired sessions as invalid.
 */
 validateSession(sessionId: string): Session | null {
 const session = this.sessions.get(sessionId);
 if (!session) return null;

 if (!session.valid || Date.now() > session.expiresAt) {
 if (session.valid) {
 session.valid = false;
 this.logEvent({
 type: "session.expired",
 timestamp: Date.now(),
 userId: session.userId,
 sessionId: session.id,
 deviceId: session.deviceId,
 detail: `Session expired`,
 });
 }
 return null;
 }

 return session;
 }

 /**
 * Extend a session's expiration time (activity-based renewal).
 * Resets the expiry to now + TTL.
 */
 extendSession(sessionId: string): Session | null {
 const session = this.validateSession(sessionId);
 if (!session) return null;

 session.lastActivity = Date.now();
 session.expiresAt = Date.now() + this.config.sessionTtlMs;

 this.logEvent({
 type: "session.extended",
 timestamp: Date.now(),
 userId: session.userId,
 sessionId: session.id,
 deviceId: session.deviceId,
 detail: `Session extended to ${new Date(session.expiresAt).toISOString()}`,
 });

 return session;
 }

 /**
 * End a session immediately (explicit logout).
 */
 endSession(sessionId: string): boolean {
 const session = this.sessions.get(sessionId);
 if (!session) return false;

 session.valid = false;

 this.logEvent({
 type: "session.revoked",
 timestamp: Date.now(),
 userId: session.userId,
 sessionId: session.id,
 deviceId: session.deviceId,
 detail: `Session revoked`,
 });

 return true;
 }

 /**
 * End all sessions for a given user.
 */
 endAllUserSessions(userId: string): number {
 let count = 0;
 for (const session of this.sessions.values()) {
 if (session.userId === userId && session.valid) {
 session.valid = false;
 count++;
 this.logEvent({
 type: "session.revoked",
 timestamp: Date.now(),
 userId,
 sessionId: session.id,
 deviceId: session.deviceId,
 detail: `User session revoked (bulk)`,
 });
 }
 }
 return count;
 }

 /**
 * End all sessions for a specific device.
 */
 endAllDeviceSessions(deviceId: string): number {
 let count = 0;
 for (const session of this.sessions.values()) {
 if (session.deviceId === deviceId && session.valid) {
 session.valid = false;
 count++;
 this.logEvent({
 type: "session.revoked",
 timestamp: Date.now(),
 userId: session.userId,
 sessionId: session.id,
 deviceId,
 detail: `Device session revoked`,
 });
 }
 }
 return count;
 }

 // ── Token Lifecycle ───────────────────────────────────────────────────────

 /**
 * Create an auth token for a session.
 * Tokens are shorter-lived than sessions and carry scope information.
 */
 createToken(
 userId: string,
 deviceId: string,
 scope: string[]
 ): AuthToken {
 const now = Date.now();
 const token: AuthToken = {
 token: crypto.randomUUID(),
 userId,
 deviceId,
 createdAt: now,
 expiresAt: now + this.config.tokenTtlMs,
 scope,
 };

 this.tokens.set(token.token, token);

 this.logEvent({
 type: "token.created",
 timestamp: now,
 userId,
 deviceId,
 detail: `Token created with scope: [${scope.join(", ")}]`,
 });

 return token;
 }

 /**
 * Validate a token. Returns the token record if valid, null otherwise.
 */
 validateToken(tokenStr: string): AuthToken | null {
 const token = this.tokens.get(tokenStr);
 if (!token) return null;

 if (Date.now() > token.expiresAt) {
 this.tokens.delete(tokenStr);
 this.logEvent({
 type: "token.expired",
 timestamp: Date.now(),
 userId: token.userId,
 deviceId: token.deviceId,
 detail: `Token expired`,
 });
 return null;
 }

 this.logEvent({
 type: "token.validated",
 timestamp: Date.now(),
 userId: token.userId,
 deviceId: token.deviceId,
 detail: `Token validated`,
 });

 return token;
 }

 /**
 * Revoke a specific token.
 */
 revokeToken(tokenStr: string): boolean {
 const token = this.tokens.get(tokenStr);
 if (!token) return false;

 this.tokens.delete(tokenStr);

 this.logEvent({
 type: "token.revoked",
 timestamp: Date.now(),
 userId: token.userId,
 deviceId: token.deviceId,
 detail: `Token revoked`,
 });

 return true;
 }

 /**
 * Revoke all tokens for a user.
 */
 revokeAllUserTokens(userId: string): number {
 let count = 0;
 for (const [key, token] of this.tokens) {
 if (token.userId === userId) {
 this.tokens.delete(key);
 count++;
 }
 }
 return count;
 }

 // ── Queries ───────────────────────────────────────────────────────────────

 /** Get a session by ID. */
 getSession(sessionId: string): Session | undefined {
 return this.sessions.get(sessionId);
 }

 /** Get all active sessions. */
 getActiveSessions(): Session[] {
 const now = Date.now();
 return Array.from(this.sessions.values()).filter(
 (s) => s.valid && s.expiresAt > now
 );
 }

 /** Get active sessions for a specific user. */
 getUserSessions(userId: string): Session[] {
 const now = Date.now();
 return Array.from(this.sessions.values()).filter(
 (s) => s.userId === userId && s.valid && s.expiresAt > now
 );
 }

 /** Get all active tokens. */
 getActiveTokens(): AuthToken[] {
 const now = Date.now();
 return Array.from(this.tokens.values()).filter((t) => t.expiresAt > now);
 }

 /** Count active sessions for a user. */
 countUserSessions(userId: string): number {
 const now = Date.now();
 return Array.from(this.sessions.values()).filter(
 (s) => s.userId === userId && s.valid && s.expiresAt > now
 ).length;
 }

 /** Count active tokens. */
 countActiveTokens(): number {
 const now = Date.now();
 return Array.from(this.tokens.values()).filter((t) => t.expiresAt > now)
 .length;
 }

 // ── Persistence ───────────────────────────────────────────────────────────

 /** Serialize sessions and tokens for disk storage. */
 serialize(): { sessions: Session[]; tokens: AuthToken[]; log: AuthLogEntry[] } {
 return {
 sessions: Array.from(this.sessions.values()),
 tokens: Array.from(this.tokens.values()),
 log: [...this.sessionLog],
 };
 }

 /** Restore sessions and tokens from persisted data. */
 restore(data: {
 sessions?: Session[];
 tokens?: AuthToken[];
 log?: AuthLogEntry[];
 }): void {
 this.sessions.clear();
 this.tokens.clear();
 this.sessionLog = [];

 if (data.sessions) {
 for (const s of data.sessions) {
 this.sessions.set(s.id, s);
 }
 }
 if (data.tokens) {
 for (const t of data.tokens) {
 this.tokens.set(t.token, t);
 }
 }
 if (data.log) {
 this.sessionLog = data.log;
 }
 }

 // ── Cleanup ────────────────────────────────────────────────────────────────

 /**
 * Remove expired sessions and tokens. Returns counts of removed items.
 */
 cleanup(): { sessionsRemoved: number; tokensRemoved: number } {
 const now = Date.now();
 let sessionsRemoved = 0;
 let tokensRemoved = 0;

 for (const [id, session] of this.sessions) {
 if (!session.valid || now > session.expiresAt) {
 this.sessions.delete(id);
 sessionsRemoved++;
 }
 }

 for (const [key, token] of this.tokens) {
 if (now > token.expiresAt) {
 this.tokens.delete(key);
 tokensRemoved++;
 }
 }

 return { sessionsRemoved, tokensRemoved };
 }

 // ── Internal Helpers ───────────────────────────────────────────────────────

 /**
 * Enforce the concurrent session limit for a user.
 * If limit is reached, revoke the oldest session first.
 */
 private enforceSessionLimit(userId: string): void {
 if (this.config.maxSessionsPerUser <= 0) return; // unlimited

 const userSessions = this.getUserSessions(userId);
 if (userSessions.length < this.config.maxSessionsPerUser) return;

 // Sort by creation time, oldest first
 userSessions.sort((a, b) => a.createdAt - b.createdAt);
 const toRevoke = userSessions[0];

 this.endSession(toRevoke.id);
 }

 /** Log an event and keep in-memory log bounded. */
 private logEvent(entry: AuthLogEntry): void {
 this.logFn(entry);
 this.sessionLog.push(entry);

 // Keep in-memory log bounded at 500 entries
 const MAX_LOG = 500;
 if (this.sessionLog.length > MAX_LOG) {
 this.sessionLog = this.sessionLog.slice(-MAX_LOG);
 }
 }
}