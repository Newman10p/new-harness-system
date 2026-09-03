"use strict";
// ─── notification-send ───────────────────────────────────────────
// Send system notifications on the host device. Supports urgency levels,
// optional sounds, timeout, and action buttons (where platform allows).
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationSend = notificationSend;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
function getPlatform() {
    return process.platform;
}
const VALID_URGENCY = ["low", "normal", "critical"];
async function notificationSend(action, ctx) {
    const title = action.title ? String(action.title) : "M.A.I.";
    const body = action.body ? String(action.body) : "";
    const sound = action.sound ? String(action.sound) : undefined;
    const urgency = action.urgency ? String(action.urgency).toLowerCase() : "normal";
    const timeout = action.timeout != null ? Number(action.timeout) : 5000;
    const actions = Array.isArray(action.actions) ? action.actions : undefined;
    if (!body) {
        return { ok: false, error: 'Missing required field: "body".' };
    }
    if (!VALID_URGENCY.includes(urgency)) {
        return {
            ok: false,
            error: `Invalid urgency: "${urgency}". Must be one of: ${VALID_URGENCY.join(", ")}`,
        };
    }
    const platform = getPlatform();
    const startMs = Date.now();
    // Sanitize inputs to prevent shell injection
    const safeTitle = title.replace(/'/g, "'\\''").replace(/`/g, "").replace(/\$/g, "");
    const safeBody = body.replace(/'/g, "'\\''").replace(/`/g, "").replace(/\$/g, "");
    try {
        if (platform === "darwin") {
            await sendMacOSNotification(safeTitle, safeBody, sound);
        }
        else if (platform === "linux") {
            await sendLinuxNotification(safeTitle, safeBody, urgency, timeout, sound, actions);
        }
        else {
            await sendWindowsNotification(safeTitle, safeBody, urgency, timeout);
        }
        const durationMs = Date.now() - startMs;
        ctx.emitHud("activity_log", {
            message: `Notification sent: "${safeTitle.substring(0, 40)}" — urgency: ${urgency}`,
            level: "info",
        });
        await ctx.audit({
            type: "action_executed",
            action: "notification-send",
            detail: `title="${safeTitle.substring(0, 50)}" urgency=${urgency} timeout=${timeout}`,
            durationMs,
            ok: true,
        });
        return {
            ok: true,
            data: {
                title,
                body,
                urgency,
                timeout,
                platform,
                delivered: true,
            },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startMs;
        await ctx.audit({
            type: "action_blocked",
            action: "notification-send",
            detail: `error=${message}`,
            durationMs,
            ok: false,
        });
        return { ok: false, error: `Notification failed: ${message}` };
    }
}
// ─── macOS: osascript display notification ─────────────────────────────
async function sendMacOSNotification(title, body, sound) {
    const soundPart = sound ? ` sound name "${sound}"` : "";
    await execAsync(`osascript -e 'display notification "${body}" with title "${title}"${soundPart}'`, { timeout: 10_000 });
}
// ─── Linux: notify-send ────────────────────────────────────────────────
async function sendLinuxNotification(title, body, urgency, timeout, sound, actions) {
    let cmd = `notify-send "${title}" "${body}"`;
    cmd += ` -u ${urgency}`;
    cmd += ` -t ${timeout}`;
    // Add action buttons if provided
    if (actions && actions.length > 0) {
        for (const act of actions) {
            const safeAct = act.replace(/"/g, '\\"');
            cmd += ` -A "${safeAct}"`;
        }
    }
    await execAsync(cmd, { timeout: 10_000 });
    // Play sound separately if requested (notify-send has no built-in sound)
    if (sound) {
        try {
            await execAsync(`paplay /usr/share/sounds/freedesktop/stereo/${sound}.ogg 2>/dev/null || true`, {
                timeout: 5_000,
            });
        }
        catch {
            // Sound not critical — ignore failure
        }
    }
}
// ─── Windows: PowerShell toast notification ─────────────────────────────
async function sendWindowsNotification(title, body, urgency, _timeout) {
    // Escape for PowerShell single-quoted strings
    const psTitle = title.replace(/'/g, "''");
    const psBody = body.replace(/'/g, "''");
    // Try BurntToast module first, fall back to native COM
    try {
        await execAsync(`powershell -command "New-BurntToastNotification -Text '${psTitle}','${psBody}'"`, { timeout: 10_000 });
        return;
    }
    catch {
        // BurntToast not available — use native Windows toast via PowerShell
    }
    // Native approach using Windows.UI.Notifications
    const urgencyMap = {
        low: "Default",
        normal: "Default",
        critical: "High",
    };
    const urg = urgencyMap[urgency] ?? "Default";
    await execAsync(`powershell -command "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null; $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $textNodes = $template.GetElementsByTagName('text'); $textNodes.Item(0).AppendChild($template.CreateTextNode('${psTitle}')) | Out-Null; $textNodes.Item(1).AppendChild($template.CreateTextNode('${psBody}')) | Out-Null; $toast = [Windows.UI.Notifications.ToastNotification]::new($template); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('M.A.I.').Show($toast)"`, { timeout: 15_000 });
}
//# sourceMappingURL=notification-send.js.map