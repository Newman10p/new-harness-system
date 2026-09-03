"use strict";
// ─── M.A.I. Device Pairing ───────────────────────────────────────────────────
// QR-code based device pairing. Generates short codes that can be scanned
// by any QR reader app, then claimed by an authenticated user.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevicePairingManager = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
// ─── Configuration ──────────────────────────────────────────────────────────
/** Characters used in pairing codes (unambiguous, easy to type). */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const DEFAULT_CONFIG = {
    ttlMs: 5 * 60 * 1000,
    maxPending: 5,
    serverUrl: "ws://localhost:3000",
};
// ─── Pairing Manager ─────────────────────────────────────────────────────────
class DevicePairingManager {
    config;
    pairings = new Map();
    codeIndex = new Map(); // code → pairingId
    log;
    constructor(config = {}, logFn) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.log = logFn ?? (() => { });
    }
    // ── Public API ─────────────────────────────────────────────────────────────
    /**
     * Initiate a new device pairing. Returns the pairing record.
     * The caller can display `pairing.pairingCode` to the user or
     * render a QR code from `pairing.qrData`.
     */
    initiatePairing(deviceName) {
        this.expirePending();
        const pendingCount = this.countPending();
        if (pendingCount >= this.config.maxPending) {
            throw new Error(`Too many pending pairings (${pendingCount}/${this.config.maxPending}). ` +
                `Wait for existing pairings to expire or revoke them.`);
        }
        const id = node_crypto_1.default.randomUUID();
        const pairingCode = this.generateCode();
        const now = Date.now();
        const qrPayload = {
            server: this.config.serverUrl,
            code: pairingCode,
            ts: now,
            label: `M.A.I. Device Pairing: ${deviceName}`,
            v: 1,
        };
        const pairing = {
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
    claimPairing(pairingCode, userId) {
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
            throw new Error(`Pairing is no longer pending (current status: ${pairing.status})`);
        }
        if (Date.now() > pairing.expiresAt) {
            pairing.status = "expired";
            this.codeIndex.delete(pairingCode);
            throw new Error(`Pairing code has expired`);
        }
        const deviceId = node_crypto_1.default.randomUUID();
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
    revokePairing(pairingId) {
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
    getByCode(pairingCode) {
        const id = this.codeIndex.get(pairingCode);
        if (!id)
            return undefined;
        return this.pairings.get(id);
    }
    /**
     * Look up a pairing by its UUID.
     */
    getById(pairingId) {
        return this.pairings.get(pairingId);
    }
    /**
     * Get all pairings (including expired/revoked for audit purposes).
     */
    getAllPairings() {
        return Array.from(this.pairings.values());
    }
    /**
     * Get pairings filtered by status.
     */
    getByStatus(status) {
        return this.getAllPairings().filter((p) => p.status === status);
    }
    /**
     * Get all pairings for a specific user.
     */
    getByUser(userId) {
        return this.getAllPairings().filter((p) => p.userId === userId);
    }
    // ── Persistence ───────────────────────────────────────────────────────────
    /**
     * Serialize all pairings for disk persistence.
     */
    serialize() {
        return this.getAllPairings();
    }
    /**
     * Restore pairings from persisted data.
     */
    restore(pairings) {
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
    expirePending() {
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
    prune() {
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
    countPending() {
        return this.getByStatus("pending").length;
    }
    // ── Helpers ────────────────────────────────────────────────────────────────
    /**
     * Generate a unique 6-character alphanumeric code.
     * Avoids ambiguous characters (0/O, 1/I/L).
     */
    generateCode() {
        const existingCodes = new Set(this.codeIndex.keys());
        let attempts = 0;
        const maxAttempts = 100;
        while (attempts < maxAttempts) {
            let code = "";
            for (let i = 0; i < CODE_LENGTH; i++) {
                code += CODE_CHARS[node_crypto_1.default.randomInt(CODE_CHARS.length)];
            }
            if (!existingCodes.has(code)) {
                return code;
            }
            attempts++;
        }
        throw new Error("Failed to generate unique pairing code after max attempts. " +
            "Try again later.");
    }
}
exports.DevicePairingManager = DevicePairingManager;
//# sourceMappingURL=DevicePairing.js.map