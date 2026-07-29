// ─── open-url ───────────────────────────────────────────────────────────────
// Opens a URL in the user's default browser using the `open` package.
// Validates that the input looks like a URL before opening.

import open from "open";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const URL_REGEX = /^https?:\/\/.+/i;

export async function openUrl(
  action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
  const url = String(action.url ?? "");

  if (!url) {
    return { ok: false, error: "Missing required field: url" };
  }

  if (!URL_REGEX.test(url)) {
    return { ok: false, error: `Invalid URL format: ${url}` };
  }

  try {
    await open(url);
    return {
      ok: true,
      data: { message: `Opened: ${url}` },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to open URL: ${message}` };
  }
}
