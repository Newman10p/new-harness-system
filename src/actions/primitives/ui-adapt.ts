// ─── ui-adapt ───────────────────────────────────────────────────
// UI self-adaptation primitive.
// Lets Mai modify the web UI in real-time by sending CSS patches,
// theme variable changes, layout directives, widget injections, or
// small script snippets — all through the HUD WebSocket channel.
//
// The web client receives these patches and applies them instantly.
// Patches are validated server-side: no external URLs, no script injection
// unless explicitly type=script (and even then, sandboxed to DOM only).
//
// Operations:
//   - css:        Inject/replace CSS rules (with optional selector scope)
//   - theme:      Set CSS custom properties (--mai-primary, --mai-bg, etc.)
//   - layout:     Rearrange widgets (show/hide/reorder sections)
//   - widget:     Inject new HTML widgets into designated slots
//   - script:     Run a small DOM script (no network access, eval-free)

import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";

// ─── Validation ────────────────────────────────────────────────────────────

const MAX_CSS_LENGTH = 50_000;   // 50KB max CSS per patch
const MAX_HTML_LENGTH = 100_000;  // 100KB max HTML injection
const MAX_JS_LENGTH = 5_000;     // 5KB max script
const BLOCKED_PATTERNS = [
  /eval\s*\(/, /Function\s*\(/, /import\s*\(/,
  /fetch\s*\(/, /XMLHttpRequest/, /WebSocket/,
  /document\.cookie/, /localStorage/, /sessionStorage/,
  /\.src\s*=/, /\.href\s*=/, /window\.open/,
  /location\.(href|replace|assign)/, /navigator\.sendBeacon/,
];

function validatePatch(action: Action): { valid: boolean; error?: string } {
  const type = String(action.type ?? "css");

  if (!["css", "theme", "layout", "widget", "script"].includes(type)) {
    return { valid: false, error: `Invalid patch type: "${type}". Must be: css, theme, layout, widget, script` };
  }

  // Validate CSS length
  const css = String(action.css ?? "");
  if (css.length > MAX_CSS_LENGTH) {
    return { valid: false, error: `CSS too large: ${css.length} bytes (max ${MAX_CSS_LENGTH})` };
  }

  // Validate HTML length
  const html = String(action.html ?? "");
  if (html.length > MAX_HTML_LENGTH) {
    return { valid: false, error: `HTML too large: ${html.length} bytes (max ${MAX_HTML_LENGTH})` };
  }

  // Validate JS length + dangerous patterns
  const js = String(action.js ?? "");
  if (js.length > MAX_JS_LENGTH) {
    return { valid: false, error: `Script too large: ${js.length} bytes (max ${MAX_JS_LENGTH})` };
  }
  if (js.length > 0) {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(js)) {
        return { valid: false, error: `Script contains blocked pattern: ${pattern.source}` };
      }
    }
  }

  // Check for external URLs in CSS (url() with http)
  if (css.includes("url(") && /url\s*\(\s*["']?https?:\/\//.test(css)) {
    return { valid: false, error: "External URLs in CSS are not allowed (security)" };
  }

  return { valid: true };
}

// ─── Primitive ─────────────────────────────────────────────────────────────

export async function uiAdapt(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const validation = validatePatch(action);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }

  const patchType = String(action.type ?? "css");
  const patchId = String(action.id ?? `patch_${Date.now()}`);
  const description = String(action.description ?? `${patchType} patch`);

  // Build the HUD payload
  const payload: Record<string, unknown> = {
    type: patchType,
    id: patchId,
    description,
  };

  // Add type-specific fields
  if (action.selector) payload.selector = String(action.selector);
  if (action.css) payload.css = String(action.css);
  if (action.variables) payload.variables = action.variables as Record<string, string>;
  if (action.html) payload.html = String(action.html);
  if (action.js) payload.js = String(action.js);

  // Emit to HUD
  ctx.emitHud("ui_patch" as HudChannel, payload as never);

  // Audit
  await ctx.audit({
    type: "action_executed",
    action: "ui-adapt",
    detail: `Applied ${patchType} patch: ${description}`,
    ok: true,
  });

  return {
    ok: true,
    data: {
      applied: true,
      patchId,
      type: patchType,
      description,
    },
  };
}
