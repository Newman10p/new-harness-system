import fs from "node:fs";
import path from "node:path";

export type ModelProvider = "ollama" | "ollama-cloud" | "openai" | "anthropic";

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

export interface CloudConfig {
  provider?: "ollama-cloud";
  endpoint?: string;
  model?: string;
  creditBudget?: number;
}

export interface OpenAiConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  creditBudget?: number;
}

export interface AnthropicConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  creditBudget?: number;
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
  modelProvider?: ModelProvider;
  providerPriority?: ModelProvider[];
  ollama: OllamaConfig;
  cloud?: CloudConfig;
  openai?: OpenAiConfig;
  anthropic?: AnthropicConfig;
  audio?: AudioConfig;
  vaultPath?: string;
  skillsPath?: string;
  permissions?: PermissionsConfig;
  startup?: StartupConfig;
  projects?: ProjectConfig[];
}

const defaultConfig: HarnessConfig = {
  model: "llama3.2",
  assistantName: "Jarvis",
  modelProvider: "ollama-cloud",
  providerPriority: ["ollama-cloud", "ollama", "openai", "anthropic"],
  ollama: {
    endpoint: "http://127.0.0.1:11434",
    model: "llama3.2"
  },
  cloud: {
    provider: "ollama-cloud",
    endpoint: "https://ollama.example.com",
    model: "llama3.2",
    creditBudget: 5
  },
  openai: {
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    creditBudget: 10
  },
  anthropic: {
    model: "claude-3-haiku-20240307",
    baseUrl: "https://api.anthropic.com/v1",
    creditBudget: 10
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
      cloud: {
        ...defaultConfig.cloud,
        ...(parsed.cloud ?? {})
      },
      openai: {
        ...defaultConfig.openai,
        ...(parsed.openai ?? {})
      },
      anthropic: {
        ...defaultConfig.anthropic,
        ...(parsed.anthropic ?? {})
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