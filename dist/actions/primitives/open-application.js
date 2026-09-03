"use strict";
// ─── open-application ───────────────────────────────────────────────────
// Launches an application by name using platform-specific commands.
// Includes safety checks to block destructive commands.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openApplication = openApplication;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_os_1 = __importDefault(require("node:os"));
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
// Blocklist of dangerous commands that should never be launched
const BLOCKED_PATTERNS = [
    /^rm\s/, /^rmdir/, /^del/, /^format/, /^mkfs/, /^dd\s/, /^shutdown/,
    /^reboot/, /^halt/, /^poweroff/, /^init\s+[06]/, /^:(){ :|:& };:/,
    /^chmod\s.*777/, /^chown\s.*root/, /^fdisk/, /^parted/,
    /^mv\s.*\//, /^cp\s.*\/dev/, /^cat\s.*>\s*\/dev/,
    />(?:\s*)\//, /\|\s*sh$/, /\|\s*bash$/,
    /curl.*\|.*sh/, /wget.*\|.*sh/,
];
function isDestructive(appName) {
    const lower = appName.toLowerCase().trim();
    return BLOCKED_PATTERNS.some((re) => re.test(lower));
}
async function openApplication(action, ctx) {
    const app = String(action.app ?? "").trim();
    const args = Array.isArray(action.args)
        ? action.args.map(String)
        : [];
    if (!app) {
        return { ok: false, error: "Missing required field: app" };
    }
    if (isDestructive(app)) {
        await ctx.audit({
            type: "action_blocked",
            action: "open-application",
            detail: `Blocked potentially destructive application: ${app}`,
            ok: false,
        });
        return {
            ok: false,
            error: 'Application name blocked for safety: "' + app + '" looks like a destructive command.',
        };
    }
    // Also check args for destructive patterns
    const argsStr = args.join(" ");
    if (isDestructive(argsStr)) {
        await ctx.audit({
            type: "action_blocked",
            action: "open-application",
            detail: 'Blocked destructive arguments for: ' + app,
            ok: false,
        });
        return {
            ok: false,
            error: "Arguments blocked for safety: contains potentially destructive commands.",
        };
    }
    const platform = node_os_1.default.platform();
    try {
        if (platform === "win32") {
            // Windows: use start command via cmd
            const quotedArgs = [app, ...args].map((a) => '"' + a + '"').join(" ");
            const cmd = 'start "" ' + quotedArgs;
            await execAsync(cmd, { timeout: 10_000, shell: "cmd.exe" });
        }
        else if (platform === "darwin") {
            // macOS: use open -a
            const argList = ["-a", app, ...args];
            const cmdStr = 'open ' + argList.map((a) => '"' + a + '"').join(" ");
            await execAsync(cmdStr, { timeout: 10_000 });
        }
        else {
            // Linux: try xdg-open first, then try direct command
            if (app.includes("/") || app.includes(".")) {
                (0, node_child_process_1.spawn)(app, args, { detached: true, stdio: "ignore" }).unref();
            }
            else {
                try {
                    await execAsync('xdg-open "' + app + '"', { timeout: 5_000 });
                }
                catch {
                    (0, node_child_process_1.spawn)(app, args, { detached: true, stdio: "ignore" }).unref();
                }
            }
        }
        await ctx.audit({
            type: "action_executed",
            action: "open-application",
            detail: 'Launched application: ' + app + (args.length ? ' with args: ' + args.join(" ") : ""),
            ok: true,
        });
        return {
            ok: true,
            data: {
                message: 'Application launched: ' + app,
                app,
                args,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            error: 'Failed to launch application "' + app + '": ' + message,
        };
    }
}
//# sourceMappingURL=open-application.js.map