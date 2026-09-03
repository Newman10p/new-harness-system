"use strict";
// ─── search-files ──────────────────────────────────────────────────────
// Searches files by content using ripgrep (rg) or falls back to grep -r.
// Returns matching files with line numbers and content previews.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchFiles = searchFiles;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
async function searchFiles(action, _ctx) {
    const query = String(action.query ?? "").trim();
    const directory = node_path_1.default.resolve(String(action.directory ?? "."));
    const filePattern = action.file_pattern ? String(action.file_pattern) : "";
    const maxResults = Math.min(Math.max(Number(action.max_results ?? 20), 1), 200);
    if (!query) {
        return { ok: false, error: "Missing required field: query" };
    }
    // Sanitize the query to prevent command injection
    if (/[;&|`$]/.test(query) && /[^\w\s.*+?\[\](){}/"'-]/.test(query)) {
        return { ok: false, error: "Query contains potentially unsafe characters" };
    }
    const platform = node_os_1.default.platform();
    let cmd;
    let engine;
    // Build glob pattern argument
    const globArg = filePattern ? ` --glob "${filePattern}"` : "";
    try {
        // Try ripgrep first (available on most dev machines)
        try {
            cmd = `rg --no-heading --line-number --max-count ${maxResults}${globArg} -- ${JSON.stringify(query)} ${JSON.stringify(directory)}`;
            const { stdout } = await execAsync(cmd, { timeout: 30_000 });
            engine = "ripgrep";
            const matches = parseRgOutput(stdout, maxResults);
            const result = buildResult(query, directory, matches, engine);
            return { ok: true, data: result };
        }
        catch {
            // ripgrep not available or no matches — try grep
        }
        // Fall back to grep
        if (platform === "win32") {
            cmd = `findstr /S /N /C:"${query}" "${directory}\\*"`;
        }
        else {
            const grepFile = filePattern ? ` --include="${filePattern}"` : "";
            cmd = `grep -rn${grepFile} -- ${JSON.stringify(query)} ${JSON.stringify(directory)}`;
        }
        const { stdout } = await execAsync(cmd, { timeout: 30_000 });
        engine = platform === "win32" ? "findstr" : "grep";
        const matches = parseGrepOutput(stdout, maxResults);
        const result = buildResult(query, directory, matches, engine);
        return { ok: true, data: result };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Search failed: ${message}` };
    }
}
function parseRgOutput(stdout, maxResults) {
    const lines = stdout.trim().split("\n");
    const matches = [];
    for (const line of lines) {
        if (matches.length >= maxResults)
            break;
        // rg output format: file:line:content
        const colonIdx = line.indexOf(":");
        if (colonIdx === -1)
            continue;
        const file = line.substring(0, colonIdx);
        const rest = line.substring(colonIdx + 1);
        const secondColon = rest.indexOf(":");
        if (secondColon === -1)
            continue;
        const lineNum = parseInt(rest.substring(0, secondColon), 10);
        const content = rest.substring(secondColon + 1).trim();
        if (isNaN(lineNum))
            continue;
        matches.push({ file, line: lineNum, content });
    }
    return matches;
}
function parseGrepOutput(stdout, maxResults) {
    const lines = stdout.trim().split("\n");
    const matches = [];
    for (const line of lines) {
        if (matches.length >= maxResults)
            break;
        // grep output format: file:line:content (with possible : in content)
        const firstColon = line.indexOf(":");
        if (firstColon === -1)
            continue;
        const file = line.substring(0, firstColon);
        const rest = line.substring(firstColon + 1);
        const secondColon = rest.indexOf(":");
        if (secondColon === -1)
            continue;
        const lineNum = parseInt(rest.substring(0, secondColon), 10);
        const content = rest.substring(secondColon + 1).trim();
        if (isNaN(lineNum))
            continue;
        matches.push({ file, line: lineNum, content });
    }
    return matches;
}
function buildResult(query, directory, matches, engine) {
    const uniqueFiles = new Set(matches.map((m) => m.file));
    return {
        query,
        directory,
        totalMatches: matches.length,
        filesMatched: uniqueFiles.size,
        matches,
        engine,
    };
}
//# sourceMappingURL=search-files.js.map