import fs from "node:fs";
import path from "node:path";
import { HarnessConfig } from "../config";

export function readConfig(configPath = "harness.config.json"): Partial<HarnessConfig> {
  const resolved = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(resolved)) {
    return {};
  }

  const raw = fs.readFileSync(resolved, "utf8");
  try {
    return JSON.parse(raw) as Partial<HarnessConfig>;
  } catch (error) {
    throw new Error(`Failed to parse config at ${resolved}: ${error}`);
  }
}

export function writeConfig(config: Partial<HarnessConfig>, configPath = "harness.config.json"): void {
  const resolved = path.resolve(process.cwd(), configPath);
  const folder = path.dirname(resolved);
  fs.mkdirSync(folder, { recursive: true });

  // Strip sensitive fields before writing to config file.
  // Secrets must only live in .env — never in committed config.
  const sanitized = stripSecrets(config);

  fs.writeFileSync(resolved, JSON.stringify(sanitized, null, 2) + "\n", "utf8");
}

/**
 * Remove apiKey fields from config to prevent plaintext credential leaks.
 * The .env file is the single source of truth for secrets.
 */
function stripSecrets(config: any): any {
  if (!config || typeof config !== "object") return config;
  if (Array.isArray(config)) return config.map(stripSecrets);

  const result: any = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "apiKey" || key === "api_key" || key === "secret" || key === "password") {
      // Skip secret fields — they belong in .env only
      if (value && typeof value === "object" && !Array.isArray(value)) {
        // Recurse into nested objects but still skip the apiKey itself
        const nested: any = {};
        for (const [nk, nv] of Object.entries(value as Record<string, unknown>)) {
          if (nk === "apiKey" || nk === "api_key" || nk === "secret" || nk === "password") continue;
          nested[nk] = stripSecrets(nv);
        }
        result[key] = nested;
      }
      // If apiKey is a string, skip it entirely
      continue;
    }
    result[key] = stripSecrets(value);
  }
  return result;
}

export function updateConfig(updates: Partial<HarnessConfig>, configPath = "harness.config.json"): void {
  const existing = readConfig(configPath);
  const merged = deepMerge(existing, updates);
  writeConfig(merged, configPath);
}

function deepMerge(target: any, source: any): any {
  if (!source || typeof source !== "object") return source;
  if (!target) return source;

  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] ?? {}, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}
