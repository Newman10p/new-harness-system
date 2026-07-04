import fs from "node:fs";
import path from "node:path";

export function readEnv(filePath = ".env"): Record<string, string> {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    return {};
  }

  const raw = fs.readFileSync(resolved, "utf8");
  const env: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    env[key] = value;
  }

  return env;
}

export function writeEnv(env: Record<string, string>, filePath = ".env"): void {
  const resolved = path.resolve(process.cwd(), filePath);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(resolved, lines.join("\n") + "\n", "utf8");
}

export function updateEnv(updates: Record<string, string>, filePath = ".env"): void {
  const env = readEnv(filePath);
  Object.assign(env, updates);
  writeEnv(env, filePath);
}
