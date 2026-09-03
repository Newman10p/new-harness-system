"use strict";
// ─── open-url ───────────────────────────────────────────────────────────────
// Opens a URL in the user's default browser using the `open` package.
// Validates that the input looks like a URL before opening.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openUrl = openUrl;
const open_1 = __importDefault(require("open"));
const URL_REGEX = /^https?:\/\/.+/i;
async function openUrl(action, _ctx) {
    const url = String(action.url ?? "");
    if (!url) {
        return { ok: false, error: "Missing required field: url" };
    }
    if (!URL_REGEX.test(url)) {
        return { ok: false, error: `Invalid URL format: ${url}` };
    }
    try {
        await (0, open_1.default)(url);
        return {
            ok: true,
            data: { message: `Opened: ${url}` },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Failed to open URL: ${message}` };
    }
}
//# sourceMappingURL=open-url.js.map