import fs from "node:fs";
import path from "node:path";

export interface OllamaConfig {
  endpoint?: string;
  model: string;
}

export interface AudioSttConfig {
  backend?: string;
  enabled?: boolean;
  modelPath?: string;
}

export interface AudioWakeWordConfig {
  enabled?: boolean;
  accessKey?: string;
  modelPath?: string;
  keyword?: string;
}

export interface AudioTtsConfig {
  backend?: string;
  enabled?: boolean;
  endpoint?: string;
  apiKey?: string;
}

export interface AudioConfig {
  stt?: AudioSttConfig;
  tts?: AudioTtsConfig;
  wakeWord?: AudioWakeWordConfig;
}

export interface PermissionsConfig {
  allowSandboxedSkills?: boolean;
  allowedExternalCommands?: string[];
  requireConfirmation?: boolean;
}

export interface StartupConfig {
  autoStart?: boolean;
  platform?: "win32" | "linux" | "darwin";
}

export interface ProjectConfig {
  name: string;
  path: string;
  type: "game" | "ai" | "docs" | "other";
}

export interface HarnessConfig {
  model: string;
  assistantName?: string;
  ollama: OllamaConfig;
  audio?: AudioConfig;
  vaultPath?: string;
  skillsPath?: string;
  permissions?: PermissionsConfig;
  startup?: StartupConfig;
  projects?: ProjectConfig[];
}

const defaultConfig: HarnessConfig = {
  model: "llama2",
  assistantName: "Jarvis",
  ollama: {
    endpoint: "http://127.0.0.1:11434",
    model: "llama2"
  },
  audio: {
    stt: {
      backend: "whisper",
      enabled: true,
      modelPath: "base"
    },
    tts: {
      backend: "http",
      enabled: false,
      endpoint: "http://localhost:5002/api/tts"
    }
  },
  vaultPath: "./vault",
  skillsPath: "./skills",
  permissions: {
    allowSandboxedSkills: true,
    allowedExternalCommands: []
  }
};

export function loadConfig(configPath = "harness.config.json"): HarnessConfig {
  const resolvedPath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(resolvedPath)) {
    return defaultConfig;
  }

  const raw = fs.readFileSync(resolvedPath, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<HarnessConfig>;
    return {
      ...defaultConfig,
      ...parsed,
      ollama: {
        ...defaultConfig.ollama,
        ...(parsed.ollama ?? {})
      },
      audio: {
        ...defaultConfig.audio,
        ...(parsed.audio ?? {})
      },
      permissions: {
        ...defaultConfig.permissions,
        ...(parsed.permissions ?? {})
      }
    };
  } catch (error) {
    throw new Error(`Failed to parse harness config at ${resolvedPath}: ${error}`);
  }
}
