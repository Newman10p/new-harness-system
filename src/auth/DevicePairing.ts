// ─── M.A.I. Device Pairing ───────────────────────────────────────────────────
// QR-code based device pairing. Generates short codes that can be scanned
// by any QR reader app, then claimed by an authenticated user.

import crypto from "node:crypto";
import type {
  DevicePairing,
  PairingStatus,
  AuthLogEntry,
} from "./types.js";

// ─── Configuration ──────────────────────────────────────────────────────────

/** Characters used in pairing codes (unambiguous, easy to type). */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

/**
 * QR data payload shape.
 * This is the JSON that gets encoded into the QR code.
 */
export interface QrPayload {
  /** The M.A.I. server websocket/HTTP endpoint. */
  server: string;
  /** 6-digit pairing code to enter (or already embedded in the QR). */
  code: string;
  /** Unix timestamp when this payload was generated. */
  ts: number;
  /** Human-readable label for the pairing. */
  label: string;
  /** Version of the pairing protocol. */
  v: number;
}

export interface DevicePairingConfig {
  /** How long a pairing code remains valid (ms). Default: 5 min. */
  ttlMs: number;
  /** Max number of concurrent pending pairings. Default: 5. */
  maxPending: number;
  /** Base URL of the M.A.I. server for QR payloads. */
  serverUrl: string;
}

const DEFAULT_CONFIG: DevicePairingConfig = {
  ttlMs: 5 * 60 * 1000,
  maxPending: 5,
  serverUrl: "ws://localhost:3000",
};

// ─── Pairing Manager ─────────────────────────────────────────────────────────

export class DevicePairingManager {
  private config: DevicePairingConfig;
  private pairings: Map<string, DevicePairing> = new Map();
  private codeIndex: Map<string, string> = new Map(); // code → pairingId
  private log: (entry: AuthLogEntry) => void;

  constructor(
    config: Partial<DevicePairingConfig> = {},
    logFn?: (entry: AuthLogEntry) => void
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.log = logFn ?? (() => {});
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Initiate a new device pairing. Returns the pairing record.
   * The caller can display `pairing.pairingCode` to the user or
   * render a QR code from `pairing.qrData`.
   */
  initiatePairing(deviceName: string): DevicePairing {
    this.expirePending();

    const pendingCount = this.countPending();
    if (pendingCount >= this.config.maxPending) {
      throw new Error(
        `Too many pending pairings (${pendingCount}/${this.config.maxPending}). ` +
          `Wait for existing pairings to expire or revoke them.`
      );
    }

    const id = crypto.randomUUID();
    const pairingCode = this.generateCode();
    const now = Date.now();

    const qrPayload: QrPayload = {
      server: this.config.serverUrl,
      code: pairingCode,
      ts: now,
      label: `M.A.I. Device Pairing: ${deviceName}`,
      v: 1,
    };

    const pairing: DevicePairing = {
      id,
      pairingCode,
      qrData: JSON.stringify(qrPayload),
      userId: null,
      deviceName,
      status: "pending",
      createdAt: now,
      expiresAt: now + this.config.ttlMs,
    };

    this.pairings.set(id, pairing);
    this.codeIndex.set(pairingCode, id);

    this.log({
      type: "pairing.initiated",
      timestamp: now,
      detail: `Pairing initiated for device "${deviceName}" (code: ${pairingCode})`,
    });

    return pairing;
  }

  /**
   * Claim a pending pairing for a given user.
   * Returns the updated pairing record and a newly generated device ID.
   */
  claimPairing(
    pairingCode: string,
    userId: string
  ): { pairing: DevicePairing; deviceId: string } {
    const pairingId = this.codeIndex.get(pairingCode);
    if (!pairingId) {
      throw new Error(`Invalid pairing code: ${pairingCode}`);
    }

    const pairing = this.pairings.get(pairingId);
    if (!pairing) {
      this.codeIndex.delete(pairingCode);
      throw new Error(`Pairing not found for code: ${pairingCode}`);
    }

    if (pairing.status !== "pending") {
      throw new Error(
        `Pairing is no longer pending (current status: ${pairing.status})`
      );
    }

    if (Date.now() > pairing.expiresAt) {
      pairing.status = "expired";
      this.codeIndex.delete(pairingCode);
      throw new Error(`Pairing code has expired`);
    }

    const deviceId = crypto.randomUUID();
    pairing.userId = userId;
    pairing.status = "claimed";
    pairing.deviceId = deviceId;

    // Remove from code index after claiming — code is single-use
    this.codeIndex.delete(pairingCode);

    this.log({
      type: "pairing.claimed",
      timestamp: Date.now(),
      userId,
      deviceId,
      detail: `Device "${pairing.deviceName}" paired by user ${userId}`,
    });

    return { pairing, deviceId };
  }

  /**
   * Revoke a pairing (by ID). Works for any non-expired pairing.
   */
  revokePairing(pairingId: string): void {
    const pairing = this.pairings.get(pairingId);
    if (!pairing) {
      throw new Error(`Pairing not found: ${pairingId}`);
    }

    if (pairing.status === "expired" || pairing.status === "revoked") {
      throw new Error(`Cannot revoke pairing in status: ${pairing.status}`);
    }

    pairing.status = "revoked";
    this.codeIndex.delete(pairing.pairingCode);

    this.log({
      type: "pairing.revoked",
      timestamp: Date.now(),
      userId: pairing.userId ?? undefined,
      deviceId: pairing.deviceId,
      detail: `Pairing revoked for device "${pairing.deviceName}"`,
    });
  }

  /**
   * Look up a pairing by its 6-digit code.
   */
  getByCode(pairingCode: string): DevicePairing | undefined {
    const id = this.codeIndex.get(pairingCode);
    if (!id) return undefined;
    return this.pairings.get(id);
  }

  /**
   * Look up a pairing by its UUID.
   */
  getById(pairingId: string): DevicePairing | undefined {
    return this.pairings.get(pairingId);
  }

  /**
   * Get all pairings (including expired/revoked for audit purposes).
   */
  getAllPairings(): DevicePairing[] {
    return Array.from(this.pairings.values());
  }

  /**
   * Get pairings filtered by status.
   */
  getByStatus(status: PairingStatus): DevicePairing[] {
    return this.getAllPairings().filter((p) => p.status === status);
  }

  /**
   * Get all pairings for a specific user.
   */
  getByUser(userId: string): DevicePairing[] {
    return this.getAllPairings().filter((p) => p.userId === userId);
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  /**
   * Serialize all pairings for disk persistence.
   */
  serialize(): DevicePairing[] {
    return this.getAllPairings();
  }

  /**
   * Restore pairings from persisted data.
   */
  restore(pairings: DevicePairing[]): void {
    this.pairings.clear();
    this.codeIndex.clear();

    for (const p of pairings) {
      this.pairings.set(p.id, p);
      // Only re-index pending pairings (claimed/expired/revoked codes are single-use)
      if (p.status === "pending") {
        this.codeIndex.set(p.pairingCode, p.id);
      }
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  /**
   * Mark all expired pending pairings as expired.
   * Called automatically before each new pairing initiation.
   */
  expirePending(): number {
    const now = Date.now();
    let expired = 0;

    for (const pairing of this.pairings.values()) {
      if (pairing.status === "pending" && now > pairing.expiresAt) {
        pairing.status = "expired";
        this.codeIndex.delete(pairing.pairingCode);
        expired++;

        this.log({
          type: "pairing.expired",
          timestamp: now,
          detail: `Pairing for "${pairing.deviceName}" expired`,
        });
      }
    }

    return expired;
  }

  /**
   * Remove all pairings that are expired or revoked.
   * Keeps claimed and pending pairings.
   */
  prune(): number {
    let removed = 0;
    for (const [id, pairing] of this.pairings) {
      if (pairing.status === "expired" || pairing.status === "revoked") {
        this.pairings.delete(id);
        this.codeIndex.delete(pairing.pairingCode);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Get count of currently pending pairings.
   */
  countPending(): number {
    return this.getByStatus("pending").length;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Generate a unique 6-character alphanumeric code.
   * Avoids ambiguous characters (0/O, 1/I/L).
   */
  private generateCode(): string {
    const existingCodes = new Set(this.codeIndex.keys());
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      let code = "";
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      }

      if (!existingCodes.has(code)) {
        return code;
      }
      attempts++;
    }

    throw new Error(
      "Failed to generate unique pairing code after max attempts. " +
        "Try again later."
    );
  }
}
