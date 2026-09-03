"use strict";
// ─── adaptive-config ────────────────────────────────────────────────────
// Modifies M.A.I.'s runtime configuration based on learned reliability.
// Persists changes to state/runtime-config.json. Certain changes (provider_priority,
// loop_limit) are flagged as requiring approval.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adaptiveConfig = adaptiveConfig;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const ROOT = process.cwd();
const CONFIG_PATH = node_path_1.default.join(ROOT, "state", "runtime-config.json");
const VALID_CHANGES = [
    "provider_priority",
    "metrics_interval",
    "max_tokens",
    "timeout",
    "loop_limit",
    "default_model",
];
// Changes that require human approval
const REQUIRES_APPROVAL = new Set(["provider_priority", "loop_limit"]);
async function readConfig() {
    try {
        const raw = await promises_1.default.readFile(CONFIG_PATH, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
async function writeConfig(config) {
    await promises_1.default.mkdir(node_path_1.default.dirname(CONFIG_PATH), { recursive: true });
    await promises_1.default.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
function validateValue(change, value) {
    switch (change) {
        case "provider_priority": {
            if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
                return "provider_priority must be an array of strings";
            }
            return null;
        }
        case "metrics_interval": {
            const n = Number(value);
            if (isNaN(n) || n < 1000)
                return "metrics_interval must be a number >= 1000 (ms)";
            return null;
        }
        case "max_tokens": {
            const n = Number(value);
            if (isNaN(n) || n < 1 || n > 128000)
                return "max_tokens must be 1-128000";
            return null;
        }
        case "timeout": {
            const n = Number(value);
            if (isNaN(n) || n < 1000 || n > 600000)
                return "timeout must be 1000-600000ms";
            return null;
        }
        case "loop_limit": {
            const n = Number(value);
            if (isNaN(n) || n < 1 || n > 100)
                return "loop_limit must be 1-100";
            return null;
        }
        case "default_model": {
            if (typeof value !== "string" || !value.trim())
                return "default_model must be a non-empty string";
            return null;
        }
        default:
            return `Unknown change type: ${change}`;
    }
}
async function adaptiveConfig(action, ctx) {
    const change = String(action.change ?? "");
    const value = action.value;
    const reason = String(action.reason ?? "(no reason provided)");
    if (!change) {
        return { ok: false, error: "Missing required field: change" };
    }
    if (value === undefined) {
        return { ok: false, error: "Missing required field: value" };
    }
    if (!VALID_CHANGES.includes(change)) {
        return { ok: false, error: `Invalid change: ${change}. Valid: ${VALID_CHANGES.join(", ")}` };
    }
    // Validate the value
    const validationError = validateValue(change, value);
    if (validationError) {
        return { ok: false, error: validationError };
    }
    // Check if this change requires approval
    const needsApproval = REQUIRES_APPROVAL.has(change);
    try {
        const config = await readConfig();
        const previousValue = config[change];
        config[change] = value;
        await writeConfig(config);
        const detail = [
            `Adaptive config: ${change} changed`,
            `Previous: ${JSON.stringify(previousValue)}`,
            `New: ${JSON.stringify(value)}`,
            `Reason: ${reason}`,
            needsApproval ? "** REQUIRES APPROVAL **" : "",
        ].filter(Boolean).join(" | ");
        await ctx.audit({
            type: "action_executed",
            action: "adaptive-config",
            detail,
            ok: true,
        });
        ctx.emitHud("activity_log", {
            message: `Config adapted: ${change} → ${JSON.stringify(value)}${needsApproval ? " (approval required)" : ""}`,
            level: needsApproval ? "warn" : "info",
        });
        return {
            ok: true,
            data: {
                change,
                previous_value: previousValue,
                new_value: value,
                reason,
                requires_approval: needsApproval,
                persisted_to: CONFIG_PATH,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Adaptive-config failed: ${message}` };
    }
}
//# sourceMappingURL=adaptive-config.js.map