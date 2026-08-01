// ─── resolvePath ──────────────────────────────────────────────────────────
// Expands ~ and ~user to the real home directory, then resolves to absolute.
// This prevents the LLM from creating literal "~" folders or using wrong paths.

import path from "node:path";
import os from "node:os";

const HOME = os.homedir();

/**
 * Expand `~` and `~username` prefixes to the real home directory,
 * then resolve relative paths against cwd.
 */
export function resolvePath(rawPath: string): string {
  if (!rawPath) return rawPath;

  // Expand ~ or ~user — Node.js path.resolve does NOT handle this
  if (rawPath === "~") return HOME;
  if (rawPath.startsWith("~/")) return path.join(HOME, rawPath.slice(2));
  if (rawPath.startsWith("~")) {
    // ~username — try to resolve (best effort)
    const username = rawPath.slice(1).split("/")[0];
    const rest = rawPath.slice(1 + username.length);
    return path.join(path.join("/home", username), rest);
  }

  // Resolve relative paths to absolute
  return path.resolve(rawPath);
}
