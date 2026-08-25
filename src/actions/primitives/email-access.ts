// ─── M.A.I. Email Access Primitive ───────────────────────────────────
// Operations: list-accounts, list-folders, list-messages, get-message,
//   search, unread, send, delete, mark-read, stats

import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";
import { getEmailManager } from "../../sandbox2/EmailManager.js";
import type { EmailManager } from "../../sandbox2/EmailManager.js";

let _manager: EmailManager | null = null;
function getManager(): EmailManager {
  if (!_manager) { _manager = getEmailManager(); }
  return _manager;
}

export async function emailAccess(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const manager = getManager();
  const operation = String(action.operation ?? "unread").toLowerCase();

  try {
    switch (operation) {
      case "list-accounts":
        return listAccounts(manager);

      case "list-folders":
        return await listFolders(action, ctx, manager);

      case "list-messages":
        return await listMessages(action, ctx, manager);

      case "get-message":
        return await getMessage(action, ctx, manager);

      case "search":
        return await searchMessages(action, ctx, manager);

      case "unread":
        return await getUnread(action, ctx, manager);

      case "send":
        return await sendEmail(action, ctx, manager);

      case "delete":
        return await deleteMessage(action, ctx, manager);

      case "mark-read":
        return await markRead(action, ctx, manager);

      case "stats":
        return { ok: true, data: manager.getStats() };

      default:
        return { ok: false, error: `Unknown email-access operation: "${operation}". Valid: list-accounts, list-folders, list-messages, get-message, search, unread, send, delete, mark-read, stats` };
    }
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─── Operation Handlers ──────────────────────────────────────────────────

function listAccounts(manager: EmailManager): ActionResult {
  const accounts = manager.listAccounts();
  if (accounts.length === 0) {
    return {
      ok: false,
      error: "No email accounts configured. Add accounts to harness.config.json under 'email.accounts'.",
    };
  }
  return {
    ok: true,
    data: { accounts },
  };
}

async function listFolders(
  action: Action,
  ctx: ActionContext,
  manager: EmailManager
): Promise<ActionResult> {
  const accountId = action.account_id as string | undefined;
  const folders = await manager.listFolders(accountId);

  ctx.emitHud("activity_log" as HudChannel, {
    message: `Listed ${folders.length} email folder(s)`,
    level: "info",
  } as never);

  return {
    ok: true,
    data: {
      folders: folders.map(f => ({
        accountId: f.accountId,
        ...f.folder,
      })),
    },
  };
}

async function listMessages(
  action: Action,
  ctx: ActionContext,
  manager: EmailManager
): Promise<ActionResult> {
  const folder = String(action.folder ?? "INBOX");
  const accountId = action.account_id as string | undefined;
  const limit = Math.min(Math.max(Number(action.limit) || 20, 1), 50);
  const offset = Math.max(Number(action.offset) || 0, 0);

  const messages = await manager.listMessages(folder, accountId, limit, offset);

  ctx.emitHud("activity_log" as HudChannel, {
    message: `Listed ${messages.length} message(s) from ${folder}`,
    level: "info",
  } as never);

  return {
    ok: true,
    data: {
      folder,
      total: messages.length,
      messages: messages.map(m => ({
        uid: m.uid,
        account: m.account,
        from: m.from,
        subject: m.subject,
        date: m.date,
        flags: m.flags,
        size: m.size,
        hasBody: !!m.bodyText,
      })),
    },
  };
}

async function getMessage(
  action: Action,
  ctx: ActionContext,
  manager: EmailManager
): Promise<ActionResult> {
  const uid = String(action.uid ?? "");
  const accountId = action.account_id as string | undefined;

  if (!uid) {
    return { ok: false, error: "get-message requires 'uid' parameter" };
  }

  const message = await manager.getMessage(uid, accountId);

  if (!message) {
    return { ok: false, error: `Message '${uid}' not found or could not be fetched` };
  }

  await ctx.audit({
    type: "action_executed",
    action: "email-access",
    detail: `Fetched message uid=${uid}: ${message.subject.slice(0, 60)}`,
    ok: true,
  });

  return {
    ok: true,
    data: message,
  };
}

async function searchMessages(
  action: Action,
  ctx: ActionContext,
  manager: EmailManager
): Promise<ActionResult> {
  const query = String(action.query ?? "");
  const folder = String(action.folder ?? "INBOX");
  const accountId = action.account_id as string | undefined;

  if (!query) {
    return { ok: false, error: "search requires 'query' parameter" };
  }

  const messages = await manager.searchMessages(query, folder, accountId);

  ctx.emitHud("activity_log" as HudChannel, {
    message: `Email search for "${query}": ${messages.length} result(s)`,
    level: "info",
  } as never);

  return {
    ok: true,
    data: {
      query,
      folder,
      total: messages.length,
      messages: messages.map(m => ({
        uid: m.uid,
        account: m.account,
        from: m.from,
        subject: m.subject,
        date: m.date,
        flags: m.flags,
        size: m.size,
      })),
    },
  };
}

async function getUnread(
  action: Action,
  ctx: ActionContext,
  manager: EmailManager
): Promise<ActionResult> {
  const folder = String(action.folder ?? "INBOX");
  const accountId = action.account_id as string | undefined;
  const limit = Math.min(Math.max(Number(action.limit) || 10, 1), 30);

  const messages = await manager.getUnreadMessages(folder, accountId, limit);

  ctx.emitHud("activity_log" as HudChannel, {
    message: `${messages.length} unread message(s) in ${folder}`,
    level: "info",
  } as never);

  return {
    ok: true,
    data: {
      folder,
      unreadCount: messages.length,
      messages: messages.map(m => ({
        uid: m.uid,
        account: m.account,
        from: m.from,
        subject: m.subject,
        date: m.date,
        size: m.size,
      })),
    },
  };
}

async function sendEmail(
  action: Action,
  ctx: ActionContext,
  manager: EmailManager
): Promise<ActionResult> {
  const to = action.to as string | string[] | undefined;
  const subject = String(action.subject ?? "");
  const body = String(action.body ?? "");

  if (!to || !subject || !body) {
    return { ok: false, error: "send requires 'to', 'subject', and 'body' parameters" };
  }

  const success = await manager.sendEmail({
    to,
    subject,
    body,
    html: action.html as string | undefined,
    cc: action.cc as string | string[] | undefined,
    bcc: action.bcc as string | string[] | undefined,
    replyTo: action.reply_to as string | undefined,
    accountId: action.account_id as string | undefined,
  });

  if (success) {
    ctx.emitHud("activity_log" as HudChannel, {
      message: `Email sent to ${Array.isArray(to) ? to.join(", ") : to}: ${subject.slice(0, 50)}`,
      level: "info",
    } as never);

    await ctx.audit({
      type: "action_executed",
      action: "email-access",
      detail: `Sent email to ${Array.isArray(to) ? to.join(", ") : to}: ${subject.slice(0, 60)}`,
      ok: true,
    });
  }

  return {
    ok: success,
    data: { sent: success, to, subject },
  };
}

async function deleteMessage(
  action: Action,
  ctx: ActionContext,
  manager: EmailManager
): Promise<ActionResult> {
  const uid = String(action.uid ?? "");
  const accountId = action.account_id as string | undefined;
  if (!uid) {
    return { ok: false, error: "delete requires 'uid' parameter" };
  }

  const success = await manager.deleteMessage(uid, accountId);

  if (success) {
    ctx.emitHud("activity_log" as HudChannel, {
      message: `Email message ${uid} deleted`,
      level: "info",
    } as never);

    await ctx.audit({
      type: "action_executed",
      action: "email-access",
      detail: `Deleted email uid=${uid}`,
      ok: true,
    });
  }

  return { ok: success, data: { uid, deleted: success } };
}

async function markRead(
  action: Action,
  ctx: ActionContext,
  manager: EmailManager
): Promise<ActionResult> {
  const uid = String(action.uid ?? "");
  const accountId = action.account_id as string | undefined;
  if (!uid) {
    return { ok: false, error: "mark-read requires 'uid' parameter" };
  }

  const success = await manager.markAsRead(uid, accountId);

  if (success) {
    ctx.emitHud("activity_log" as HudChannel, {
      message: `Email message ${uid} marked as read`,
      level: "info",
    } as never);
  }

  return { ok: success, data: { uid, markedRead: success } };
}
