import type { DevicePairing, PairingStatus, AuthLogEntry } from "./types.js";
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
export declare class DevicePairingManager {
    private config;
    private pairings;
    private codeIndex;
    private log;
    constructor(config?: Partial<DevicePairingConfig>, logFn?: (entry: AuthLogEntry) => void);
    /**
     * Initiate a new device pairing. Returns the pairing record.
     * The caller can display `pairing.pairingCode` to the user or
     * render a QR code from `pairing.qrData`.
     */
    initiatePairing(deviceName: string): DevicePairing;
    /**
     * Claim a pending pairing for a given user.
     * Returns the updated pairing record and a newly generated device ID.
     */
    claimPairing(pairingCode: string, userId: string): {
        pairing: DevicePairing;
        deviceId: string;
    };
    /**
     * Revoke a pairing (by ID). Works for any non-expired pairing.
     */
    revokePairing(pairingId: string): void;
    /**
     * Look up a pairing by its 6-digit code.
     */
    getByCode(pairingCode: string): DevicePairing | undefined;
    /**
     * Look up a pairing by its UUID.
     */
    getById(pairingId: string): DevicePairing | undefined;
    /**
     * Get all pairings (including expired/revoked for audit purposes).
     */
    getAllPairings(): DevicePairing[];
    /**
     * Get pairings filtered by status.
     */
    getByStatus(status: PairingStatus): DevicePairing[];
    /**
     * Get all pairings for a specific user.
     */
    getByUser(userId: string): DevicePairing[];
    /**
     * Serialize all pairings for disk persistence.
     */
    serialize(): DevicePairing[];
    /**
     * Restore pairings from persisted data.
     */
    restore(pairings: DevicePairing[]): void;
    /**
     * Mark all expired pending pairings as expired.
     * Called automatically before each new pairing initiation.
     */
    expirePending(): number;
    /**
     * Remove all pairings that are expired or revoked.
     * Keeps claimed and pending pairings.
     */
    prune(): number;
    /**
     * Get count of currently pending pairings.
     */
    countPending(): number;
    /**
     * Generate a unique 6-character alphanumeric code.
     * Avoids ambiguous characters (0/O, 1/I/L).
     */
    private generateCode;
}
//# sourceMappingURL=DevicePairing.d.ts.map