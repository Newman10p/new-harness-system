import type { AuditLogger } from "../types/index.js";
/**
 * Initialize the audit log. Reads existing file to count lines.
 */
export declare function initAuditLog(): Promise<AuditLogger>;
/**
 * Read the last N entries from the audit log.
 */
export declare function readAuditLog(n?: number): Promise<string>;
//# sourceMappingURL=AuditLogger.d.ts.map