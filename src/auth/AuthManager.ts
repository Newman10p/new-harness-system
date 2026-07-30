// ─── M.A.I. Authentication Manager ───────────────────────────────────────
// Central manager for all authentication operations: users, sessions,
// tokens, device pairing, and RBAC.  Persists state to disk as JSON.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  SessionManager,
} from "./SessionManager.js";
import {
  DevicePairingManager,
} from "./DevicePairing.js";
import {
  hasPermission,
  validateScopes,
} from "./permissions.js";
import type {
  User,
  Session,
  AuthToken,
  DevicePairing,
  AuthState,
  AuthConfig,
  AuthStats,
  AuthLogEntry,
  UserRole,
  AuthMethod,
} from "./types.js";
import { DEFAULT_AUTH_CONFIG } from "./types.js";

// ─── Constants ─────────────────────────────────────────────────────────────

/** Default admin credentials (user must change on first login). */
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "mai-admin-2025";

/** scrypt parameters — intentionally slow to resist brute-force. */
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;    // N
const SCRYPT_BLOCK_SIZE = 8;  // r
const SCRYPT_PARALLELISM = 1; // p

// ─── Auth Manager ───────────────────────────────────────────────────────────

export class AuthManager {
  private config: AuthConfig;
  private state: AuthState;
  private sessionManager: SessionManager;
  private pairingManager: DevicePairingManager;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(config?: Partial<AuthConfig>) {
    this.config = { ...DEFAULT_AUTH_CONFIG, ...config };
    this.state = this.emptyState();
    this.sessionManager = new SessionManager(
      {
        sessionTtlMs: this.config.sessionTtlMs,
        tokenTtlMs: this.config.tokenTtlMs,
        maxSessionsPerUser: this.config.maxSessionsPerUser,
      },
      (entry) => this.logEvent(entry)
    );
    this.pairingManager = new DevicePairingManager(
      {
        ttlMs: this.config.pairingTtlMs,
        maxPending: this.config.maxPendingPairings,
      },
      (entry) => this.logEvent(entry)
    );
  }

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Initialize the auth system. Loads persisted state or creates
   * a fresh state with the default admin user.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const statePath = this.config.statePath;
    const stateDir = path.dirname(statePath);

    // Ensure state directory exists
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    // Try to load existing state
    if (fs.existsSync(statePath)) {
      try {
        const raw = fs.readFileSync(statePath, "utf-8");
        const parsed = JSON.parse(raw) as AuthState;
        this.restoreState(parsed);
        this.logEvent({
          type: "user.login",
          timestamp: Date.now(),
          detail: `Auth state restored from disk (${Object.keys(parsed.users).length} users)`,
        });
      } catch (err) {
        // Corrupt state file — start fresh
        this.logEvent({
          type: "auth.failed",
          timestamp: Date.now(),
          detail: `Failed to parse auth state, starting fresh: ${String(err)}`,
        });
      }
    }

    // Create default admin user if no users exist
    if (Object.keys(this.state.users).length === 0) {
      await this.createDefaultAdmin();
    }

    // Start periodic cleanup
    if (this.config.cleanupIntervalMs > 0) {
      this.cleanupTimer = setInterval(
        () => this.cleanupExpired(),
        this.config.cleanupIntervalMs
      );
      // Don't prevent process exit
      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref();
      }
    }

    // Run initial cleanup
    this.cleanupExpired();

    this.initialized = true;
  }

  /**
   * Graceful shutdown — persist state and stop cleanup timer.
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.persistState();
  }

  // ── User Management ───────────────────────────────────────────────────────

  /**
   * Create a new user.  The `actorId` is the user performing the action
   * (must have admin+ permissions to create users).
   */
  async createUser(
    username: string,
    displayName: string,
    role: UserRole,
    password: string,
    actorId?: string
  ): Promise<User> {
    // Validate username
    if (!username || username.length < 2) {
      throw new Error("Username must be at least 2 characters");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new Error(
        "Username must contain only letters, numbers, underscores, and hyphens"
      );
    }

    // Check for duplicate username
    for (const existing of Object.values(this.state.users)) {
      if (existing.username.toLowerCase() === username.toLowerCase()) {
        throw new Error(`Username "${username}" already exists`);
      }
    }

    // Permission check: actor must be able to manage the target role
    if (actorId) {
      const actor = this.state.users[actorId];
      if (!actor || !hasPermission(actor.role, "users", "admin")) {
        throw new Error("Insufficient permissions to create users");
      }
    }

    const { hash, salt } = await this.hashPassword(password);
    const now = Date.now();
    const user: User = {
      id: crypto.randomUUID(),
      username,
      displayName,
      role,
      authMethods: ["password"],
      createdAt: now,
      lastSeen: now,
      preferences: {},
      deviceIds: [],
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: false,
      active: true,
    };

    this.state.users[user.id] = user;
    this.persistState();

    this.logEvent({
      type: "user.created",
      timestamp: now,
      userId: user.id,
      detail: `User "${username}" created with role ${role}${actorId ? ` by ${actorId}` : ""}`,
    });

    return user;
  }

  /**
   * Authenticate a user by username and password.
   * Returns the user and a new session.
   */
  async authenticate(
    username: string,
    password: string,
    deviceId: string,
    channel: string = "local",
    opts?: { ip?: string; userAgent?: string }
  ): Promise<{ user: User; session: Session; token: AuthToken }> {
    const user = this.findUserByUsername(username);
    if (!user) {
      this.logEvent({
        type: "auth.failed",
        timestamp: Date.now(),
        detail: `Authentication failed for unknown user "${username}"`,
        ip: opts?.ip,
      });
      throw new Error("Invalid username or password");
    }

    if (!user.active) {
      this.logEvent({
        type: "auth.failed",
        timestamp: Date.now(),
        userId: user.id,
        detail: `Authentication attempt on inactive user "${username}"`,
        ip: opts?.ip,
      });
      throw new Error("User account is inactive");
    }

    if (!user.passwordHash || !user.passwordSalt) {
      throw new Error("User has no password set. Use a different auth method.");
    }

    const valid = await this.verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!valid) {
      this.logEvent({
        type: "auth.failed",
        timestamp: Date.now(),
        userId: user.id,
        detail: `Authentication failed for user "${username}" (wrong password)`,
        ip: opts?.ip,
      });
      throw new Error("Invalid username or password");
    }

    // Update last seen
    user.lastSeen = Date.now();

    // Create session
    const session = this.sessionManager.createSession(user.id, deviceId, channel, {
      ip: opts?.ip,
      userAgent: opts?.userAgent,
    });

    // Determine token scope from role
    const scope = this.defaultScopeForRole(user.role);
    const token = this.sessionManager.createToken(user.id, deviceId, scope);

    this.logEvent({
      type: "user.login",
      timestamp: Date.now(),
      userId: user.id,
      sessionId: session.id,
      deviceId,
      detail: `User "${username}" authenticated via password on ${channel}`,
      ip: opts?.ip,
    });

    this.persistState();

    return { user, session, token };
  }

  /**
   * Authenticate via an existing token string.
   * Returns the token record and associated user.
   */
  authenticateToken(tokenStr: string): { token: AuthToken; user: User } | null {
    const token = this.sessionManager.validateToken(tokenStr);
    if (!token) return null;

    const user = this.state.users[token.userId];
    if (!user || !user.active) return null;

    return { token, user };
  }

  /**
   * Validate a session and return the associated user.
   */
  validateSession(sessionId: string): { session: Session; user: User } | null {
    const session = this.sessionManager.validateSession(sessionId);
    if (!session) return null;

    const user = this.state.users[session.userId];
    if (!user || !user.active) return null;

    // Touch session activity
    this.sessionManager.extendSession(sessionId);

    return { session, user };
  }

  /**
   * End a session (logout).
   */
  endSession(sessionId: string): boolean {
    const result = this.sessionManager.endSession(sessionId);
    if (result) this.persistState();
    return result;
  }

  // ── Password Management ───────────────────────────────────────────────────

  /**
   * Change a user's password. Requires the current password (or admin).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    actorId?: string
  ): Promise<void> {
    const user = this.state.users[userId];
    if (!user) throw new Error("User not found");

    // If an actor is changing another user's password, they need admin perms
    if (actorId && actorId !== userId) {
      const actor = this.state.users[actorId];
      if (!actor || !hasPermission(actor.role, "users", "admin")) {
        throw new Error("Insufficient permissions to change another user's password");
      }
      // Admin can set password without knowing current
    } else {
      // User changing own password — verify current
      if (!user.passwordHash || !user.passwordSalt) {
        throw new Error("No password set for this user");
      }
      const valid = await this.verifyPassword(
        currentPassword,
        user.passwordHash,
        user.passwordSalt
      );
      if (!valid) {
        throw new Error("Current password is incorrect");
      }
    }

    const { hash, salt } = await this.hashPassword(newPassword);
    user.passwordHash = hash;
    user.passwordSalt = salt;
    user.mustChangePassword = false;

    // Update auth methods
    if (!user.authMethods.includes("password")) {
      user.authMethods.push("password");
    }

    this.logEvent({
      type: "user.password_changed",
      timestamp: Date.now(),
      userId,
      detail: `Password changed for user "${user.username}"${actorId ? ` by ${actorId}` : ""}`,
    });

    this.persistState();
  }

  // ── Device Pairing ────────────────────────────────────────────────────────

  /**
   * Initiate a new device pairing (generates QR code data).
   */
  initiatePairing(deviceName: string): DevicePairing {
    const pairing = this.pairingManager.initiatePairing(deviceName);
    this.persistState();
    return pairing;
  }

  /**
   * Complete a pairing — an authenticated user claims a device.
   * Returns the pairing and the new device ID.
   */
  completePairing(
    pairingCode: string,
    userId: string
  ): { pairing: DevicePairing; deviceId: string } {
    const result = this.pairingManager.claimPairing(pairingCode, userId);

    // Register the device on the user
    const user = this.state.users[userId];
    if (user && result.deviceId) {
      if (!user.deviceIds.includes(result.deviceId)) {
        user.deviceIds.push(result.deviceId);
      }
      // Add qr-pair to auth methods
      if (!user.authMethods.includes("qr-pair")) {
        user.authMethods.push("qr-pair");
      }
    }

    this.logEvent({
      type: "device.added",
      timestamp: Date.now(),
      userId,
      deviceId: result.deviceId,
      detail: `Device "${result.pairing.deviceName}" paired successfully`,
    });

    this.persistState();
    return result;
  }

  /**
   * Revoke a device from all sessions and from its owner.
   */
  revokeDevice(deviceId: string, actorId: string): boolean {
    // End all sessions for this device
    this.sessionManager.endAllDeviceSessions(deviceId);

    // Revoke all tokens for this device
    const activeTokens = this.sessionManager.getActiveTokens();
    for (const token of activeTokens) {
      if (token.deviceId === deviceId) {
        this.sessionManager.revokeToken(token.token);
      }
    }

    // Remove device from user records
    for (const user of Object.values(this.state.users)) {
      const idx = user.deviceIds.indexOf(deviceId);
      if (idx !== -1) {
        user.deviceIds.splice(idx, 1);
      }
    }

    this.logEvent({
      type: "device.revoked",
      timestamp: Date.now(),
      userId: actorId,
      deviceId,
      detail: `Device ${deviceId} revoked by ${actorId}`,
    });

    this.persistState();
    return true;
  }

  // ── RBAC ──────────────────────────────────────────────────────────────────

  /**
   * Check if a user has a specific permission.
   */
  hasPermission(userId: string, resource: string, action: string): boolean {
    const user = this.state.users[userId];
    if (!user || !user.active) return false;
    return hasPermission(user.role, resource, action);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getUser(userId: string): User | undefined {
    return this.state.users[userId];
  }

  listUsers(): User[] {
    return Object.values(this.state.users);
  }

  listSessions(): Session[] {
    return this.sessionManager.getActiveSessions();
  }

  listPairings(): DevicePairing[] {
    return this.pairingManager.getAllPairings();
  }

  getStats(): AuthStats {
    const now = Date.now();
    const users = Object.values(this.state.users);
    const activeSessions = this.sessionManager.getActiveSessions();
    const activeTokens = this.sessionManager.getActiveTokens();
    const pendingPairings = this.pairingManager.getByStatus("pending");

    const usersByRole: Record<UserRole, number> = {
      owner: 0, admin: 0, user: 0, guest: 0,
    };
    for (const u of users) {
      usersByRole[u.role]++;
    }

    return {
      totalUsers: users.length,
      activeSessions: activeSessions.length,
      activeTokens: activeTokens.length,
      pendingPairings: pendingPairings.length,
      usersByRole,
      totalAuthEvents: this.state.authLog.length,
      lastCleanupAt: now,
    };
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /**
   * Remove expired sessions, tokens, and pairings.
   */
  cleanupExpired(): void {
    const sessionResult = this.sessionManager.cleanup();
    this.pairingManager.expirePending();
    this.pairingManager.prune();

    if (sessionResult.sessionsRemoved > 0 || sessionResult.tokensRemoved > 0) {
      this.persistState();
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  /** Persist current state to disk. */
  persistState(): void {
    const stateToSave: AuthState = {
      users: this.state.users,
      sessions: Object.fromEntries(
        this.sessionManager.serialize().sessions.map((s) => [s.id, s])
      ),
      tokens: Object.fromEntries(
        this.sessionManager.serialize().tokens.map((t) => [t.token, t])
      ),
      pairings: Object.fromEntries(
        this.pairingManager.serialize().map((p) => [p.id, p])
      ),
      hmacSecret: this.state.hmacSecret,
      authLog: this.state.authLog,
    };

    try {
      const dir = path.dirname(this.config.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.config.statePath,
        JSON.stringify(stateToSave, null, 2),
        "utf-8"
      );
    } catch (err) {
      // Log but don't throw — auth should still work in-memory
      process.stderr.write(
        `Failed to persist auth state: ${String(err)}\n`
      );
    }
  }

  /** Restore state from a parsed JSON object. */
  private restoreState(parsed: AuthState): void {
    this.state.users = parsed.users ?? {};
    this.state.hmacSecret = parsed.hmacSecret ?? crypto.randomBytes(32).toString("hex");
    this.state.authLog = parsed.authLog ?? [];

    // Restore session manager
    const sessions = Object.values(parsed.sessions ?? {});
    const tokens = Object.values(parsed.tokens ?? {});
    this.sessionManager.restore({
      sessions,
      tokens,
      log: this.state.authLog,
    });

    // Restore pairing manager
    const pairings = Object.values(parsed.pairings ?? {});
    this.pairingManager.restore(pairings);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private emptyState(): AuthState {
    return {
      users: {},
      sessions: {},
      tokens: {},
      pairings: {},
      hmacSecret: crypto.randomBytes(32).toString("hex"),
      authLog: [],
    };
  }

  /** Create the default admin user with forced password change. */
  private async createDefaultAdmin(): Promise<void> {
    const { hash, salt } = await this.hashPassword(DEFAULT_ADMIN_PASSWORD);
    const now = Date.now();

    const adminUser: User = {
      id: crypto.randomUUID(),
      username: DEFAULT_ADMIN_USERNAME,
      displayName: "M.A.I. Administrator",
      role: "owner",
      authMethods: ["password"],
      createdAt: now,
      lastSeen: now,
      preferences: {},
      deviceIds: [],
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: true,
      active: true,
    };

    this.state.users[adminUser.id] = adminUser;
    this.persistState();

    this.logEvent({
      type: "user.created",
      timestamp: now,
      userId: adminUser.id,
      detail: `Default admin user created (password change required on first login)`,
    });
  }

  /** Find a user by username (case-insensitive). */
  private findUserByUsername(username: string): User | undefined {
 const lower = username.toLowerCase();
    return Object.values(this.state.users).find(
      (u) => u.username.toLowerCase() === lower
    );
  }

  /**
   * Hash a password using scrypt.
   * Returns both the hash and the salt (both hex-encoded).
   */
  private async hashPassword(
    password: string
  ): Promise<{ hash: string; salt: string }> {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await new Promise<string>((resolve, reject) => {
      crypto.scrypt(
        password,
        salt,
        SCRYPT_KEYLEN,
        { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM },
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey.toString("hex"));
        }
      );
    });
    return { hash, salt };
  }

  /** Verify a password against a stored hash and salt. */
  private async verifyPassword(
    password: string,
    storedHash: string,
    storedSalt: string
  ): Promise<boolean> {
    const hash = await new Promise<string>((resolve, reject) => {
      crypto.scrypt(
        password,
        storedSalt,
        SCRYPT_KEYLEN,
        { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM },
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey.toString("hex"));
        }
      );
    });
    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
  }

  /**
   * Compute a simple HMAC-SHA256 signature for a payload.
   * Not full JWT — just a signature utility for tokens.
   */
  signHmac(payload: string): string {
    return crypto
      .createHmac("sha256", this.state.hmacSecret)
      .update(payload)
      .digest("hex");
  }

  /** Verify an HMAC-SHA256 signature. */
  verifyHmac(payload: string, signature: string): boolean {
    const expected = this.signHmac(payload);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature)
      );
    } catch {
      return false;
    }
  }

  /** Default scope for a given role. */
  private defaultScopeForRole(role: UserRole): string[] {
    switch (role) {
      case "owner":
        return ["*"];
      case "admin":
        return ["chat", "control", "admin", "files", "hud", "memory"];
      case "user":
        return ["chat", "files", "hud", "memory", "skills"];
      case "guest":
        return ["chat", "hud"];
    }
  }

  /** Append an auth event to the in-memory log (bounded). */
  private logEvent(entry: AuthLogEntry): void {
    this.state.authLog.push(entry);

    // Keep log bounded at 2000 entries to prevent unbounded growth
    const MAX_LOG = 2000;
    if (this.state.authLog.length > MAX_LOG) {
      this.state.authLog = this.state.authLog.slice(-MAX_LOG);
    }
  }
}
