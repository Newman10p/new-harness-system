"use strict";
// ─── self-repair ────────────────────────────────────────────────────────
// Attempts to fix common issues detected by self-diagnose. Supported repairs:
// corrupted_memory, llm_unreachable, disk_full, large_log, missing_dirs.
// Always creates backups before repairing and logs all actions.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.selfRepair = selfRepair;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
const ROOT = process.cwd();
const BACKUP_DIR = node_path_1.default.join(ROOT, "state", "backups");
async function createBackup(filePath) {
    try {
        await promises_1.default.mkdir(BACKUP_DIR, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const relativePath = node_path_1.default.relative(ROOT, filePath);
        const backupName = `${timestamp}--${relativePath.replace(/\//g, "_")}`;
        const backupPath = node_path_1.default.join(BACKUP_DIR, backupName);
        await promises_1.default.copyFile(filePath, backupPath);
        return backupPath;
    }
    catch {
        return null;
    }
}
async function repairCorruptedMemory() {
    const memoryFiles = ["memory/context.md", "state/inbox.md", "agent/identity.md"];
    const results = [];
    for (const rel of memoryFiles) {
        const fullPath = node_path_1.default.join(ROOT, rel);
        try {
            const content = await promises_1.default.readFile(fullPath, "utf-8");
            // Check if content looks like corrupted binary
            const nullBytes = (content.match(/\x00/g) || []).length;
            if (nullBytes > 5) {
                // Backup then restore
                const backup = await createBackup(fullPath);
                await promises_1.default.writeFile(fullPath, `# ${node_path_1.default.basename(rel)}\n\n> Restored from backup after corruption detected.\n\nPrevious backup: ${backup}\n`, "utf-8");
                results.push(`${rel}: restored (had ${nullBytes} null bytes)`);
            }
        }
        catch {
            // File doesn't exist — create fresh
            await promises_1.default.mkdir(node_path_1.default.dirname(fullPath), { recursive: true });
            await promises_1.default.writeFile(fullPath, `# ${node_path_1.default.basename(rel)}\n\n> Freshly created by self-repair.\n\n`, "utf-8");
            results.push(`${rel}: created fresh (was missing)`);
        }
    }
    return {
        target: "corrupted_memory",
        status: results.length > 0 ? "success" : "skipped",
        detail: results.length > 0 ? results.join("; ") : "No corruption detected",
    };
}
async function repairDiskFull() {
    const results = [];
    const dirs = [
        { dir: node_path_1.default.join(ROOT, "state", "backups"), maxAge: 7 * 24 * 60 * 60 * 1000, label: "old backups" },
        { dir: node_path_1.default.join(ROOT, "state", "screenshots"), maxAge: 3 * 24 * 60 * 60 * 1000, label: "old screenshots" },
        { dir: node_path_1.default.join(ROOT, "memory", "evaluations"), maxAge: 14 * 24 * 60 * 60 * 1000, label: "old evaluations" },
    ];
    for (const { dir, maxAge, label } of dirs) {
        try {
            const entries = await promises_1.default.readdir(dir);
            let removed = 0;
            for (const entry of entries) {
                const fullPath = node_path_1.default.join(dir, entry);
                const stat = await promises_1.default.stat(fullPath);
                if (Date.now() - stat.mtimeMs > maxAge) {
                    await promises_1.default.unlink(fullPath);
                    removed++;
                }
            }
            results.push(`${label}: removed ${removed} files`);
        }
        catch {
            results.push(`${label}: directory not found (skipped)`);
        }
    }
    // Trim audit log if very large
    const auditPath = node_path_1.default.join(ROOT, "state", "audit.log.md");
    try {
        const stat = await promises_1.default.stat(auditPath);
        if (stat.size > 5 * 1024 * 1024) { // > 5MB
            const content = await promises_1.default.readFile(auditPath, "utf-8");
            const lines = content.split("\n");
            // Keep last 5000 lines
            const trimmed = lines.slice(-5000).join("\n");
            await createBackup(auditPath);
            await promises_1.default.writeFile(auditPath, trimmed, "utf-8");
            results.push(`audit.log.md: trimmed from ${lines.length} to 5000 lines`);
        }
    }
    catch {
        // No audit log to trim
    }
    return {
        target: "disk_full",
        status: "success",
        detail: results.join("; "),
    };
}
async function repairLargeLog() {
    const auditPath = node_path_1.default.join(ROOT, "state", "audit.log.md");
    try {
        const stat = await promises_1.default.stat(auditPath);
        const content = await promises_1.default.readFile(auditPath, "utf-8");
        const lines = content.split("\n");
        const targetLines = 2000;
        if (lines.length <= targetLines) {
            return { target: "large_log", status: "skipped", detail: `Audit log has ${lines.length} lines (under ${targetLines} threshold)` };
        }
        await createBackup(auditPath);
        const trimmed = lines.slice(-targetLines).join("\n");
        await promises_1.default.writeFile(auditPath, trimmed, "utf-8");
        return {
            target: "large_log",
            status: "success",
            detail: `Trimmed audit log from ${lines.length} to ${targetLines} lines (was ${(stat.size / 1024).toFixed(1)}KB)`,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { target: "large_log", status: "failed", detail: message };
    }
}
async function repairMissingDirs() {
    const dirs = ["state", "state/backups", "memory", "memory/evaluations", "skills"];
    const created = [];
    for (const dir of dirs) {
        const fullPath = node_path_1.default.join(ROOT, dir);
        try {
            await promises_1.default.access(fullPath);
        }
        catch {
            await promises_1.default.mkdir(fullPath, { recursive: true });
            created.push(dir);
        }
    }
    return {
        target: "missing_dirs",
        status: created.length > 0 ? "success" : "skipped",
        detail: created.length > 0 ? `Created: ${created.join(", ")}` : "All directories exist",
    };
}
async function repairLLMUnreachable() {
    // Check if we can find a fallback provider in config
    try {
        const configPath = node_path_1.default.join(ROOT, "harness.config.json");
        const raw = await promises_1.default.readFile(configPath, "utf-8");
        const config = JSON.parse(raw);
        const providers = config?.providers || config?.llm;
        if (providers) {
            // Try to verify connectivity to at least one provider
            let reachable = false;
            let tried = "";
            if (Array.isArray(providers)) {
                for (const p of providers) {
                    const url = p.baseURL || p.url;
                    if (url) {
                        try {
                            await execAsync(`curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 ${url.replace(/\/$/, "")}/models 2>/dev/null`, { timeout: 5_000 });
                            reachable = true;
                            tried = url;
                            break;
                        }
                        catch {
                            tried += `${url} (fail), `;
                        }
                    }
                }
            }
            if (reachable) {
                return { target: "llm_unreachable", status: "success", detail: `Fallback provider reachable: ${tried}` };
            }
            return { target: "llm_unreachable", status: "failed", detail: `No providers reachable. Tried: ${tried}` };
        }
        return { target: "llm_unreachable", status: "skipped", detail: "No provider configuration found" };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { target: "llm_unreachable", status: "failed", detail: message };
    }
}
const REPAIR_HANDLERS = {
    corrupted_memory: repairCorruptedMemory,
    llm_unreachable: repairLLMUnreachable,
    disk_full: repairDiskFull,
    large_log: repairLargeLog,
    missing_dirs: repairMissingDirs,
};
async function selfRepair(action, ctx) {
    const issue = String(action.issue ?? "all");
    const auto = Boolean(action.auto ?? false);
    const validIssues = [...Object.keys(REPAIR_HANDLERS), "all"];
    if (!validIssues.includes(issue)) {
        return { ok: false, error: `Invalid issue: ${issue}. Valid: ${validIssues.join(", ")}` };
    }
    const issuesToRepair = issue === "all" ? Object.keys(REPAIR_HANDLERS) : [issue];
    const repairs = [];
    try {
        for (const iss of issuesToRepair) {
            const handler = REPAIR_HANDLERS[iss];
            if (!handler)
                continue;
            try {
                const result = await handler();
                repairs.push(result);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                repairs.push({ target: iss, status: "failed", detail: message });
            }
        }
        const successCount = repairs.filter((r) => r.status === "success").length;
        const failedCount = repairs.filter((r) => r.status === "failed").length;
        const result = { issue, auto, repairs };
        await ctx.audit({
            type: "action_executed",
            action: "self-repair",
            detail: `Repaired ${successCount} issues, ${failedCount} failed, ${repairs.length - successCount - failedCount} skipped (auto=${auto})`,
            ok: failedCount === 0,
        });
        ctx.emitHud("activity_log", {
            message: `Self-repair: ${successCount} fixed, ${failedCount} failed`,
            level: failedCount > 0 ? "warn" : "info",
        });
        return { ok: true, data: result };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Self-repair failed: ${message}` };
    }
}
//# sourceMappingURL=self-repair.js.map