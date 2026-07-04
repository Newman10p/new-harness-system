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
  fs.writeFileSync(resolved, JSON.stringify(config, null, 2) + "\n", "utf8");
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
