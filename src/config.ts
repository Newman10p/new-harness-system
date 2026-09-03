import fs from "node:fs";
import path from "node:path";

// ===== Model Provider Types =====
export type ModelProvider = "ollama" | "ollama-cloud" | "openai" | "anthropic" | "openrouter";

export interface OllamaConfig {
  endpoint?: string;
  model: string;
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

export interface OpenRouterConfig {
  enabled?: boolean;
  model?: string;
  apiKeyEnv?: string;
  apiKey?: string;
  fallback?: boolean;
  baseUrl?: string;
}

// ===== Provider Registry Config =====
export interface ProviderEntryConfig {
  type: "ollamaLocal" | "ollamaCloud" | "openaiStyle" | "anthropic" | "mock" | "openrouter";
  source?: "openai" | "nvidia_nim" | "lightning" | "nemo_proxy" | "openrouter";
  baseUrl?: string;
  model: string;
  apiKeyEnv?: string;
  apiKey?: string;
  enabled?: boolean;
}

export interface ModelSectionConfig {
  defaultProvider: string;
  providers: Record<string, ProviderEntryConfig>;
}

// ===== Audio Types =====
export type AudioMode = "builtIn" | "custom" | "disabled";

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

export interface AudioCustomConfig {
  sttEndpoint?: string;
  ttsEndpoint?: string;
}

export interface AudioConfig {
  mode?: AudioMode;
  stt?: AudioSttConfig;
  tts?: AudioTtsConfig;
  wakeWord?: AudioWakeWordConfig;
  custom?: AudioCustomConfig;
}

// ===== Permissions =====
export interface PermissionsConfig {
  allowSandboxedSkills?: boolean;
  allowedExternalCommands?: string[];
  requireConfirmation?: boolean;
  safetyLevel?: "conservative" | "balanced" | "experimental";
  allowAdvancedTools?: boolean;
  allowTerminalAccess?: boolean;
  allowDeviceAccess?: boolean;
  allowNetworkAccess?: boolean;
}

// ===== Startup =====
export interface StartupConfig {
  autoStart?: boolean;
  platform?: "win32" | "linux" | "darwin";
}

// ===== Gateway =====
export interface GatewayConfig {
  enabled?: boolean;
  port?: number;
}

// ===== Projects =====
export interface ProjectConfig {
  name: string;
  path: string;
  type: "game" | "ai" | "docs" | "other";
}

// ===== Agentic Tools Config =====
export interface ToolsConfig {
  enabled?: boolean;
  safetyLevel?: "conservative" | "balanced" | "experimental";
  allowedDirectories?: string[];
  allowedCommands?: string[];
  sim3dEnabled?: boolean;
  deviceAccess?: boolean;
  networkAccess?: boolean;
}

// ===== Policy Config =====
export interface PolicyConfig {
  objectives?: string[];
  rules?: string[];
}

// ===== Security Config =====
export interface SecurityConfig {
  monitorEnabled?: boolean;
  alertOnHighResourceUsage?: boolean;
  alertOnFrequentTerminal?: boolean;
  logActions?: boolean;
}

// ===== Main Config =====
export interface HarnessConfig {
  model: string;
  assistantName?: string;
  modelProvider?: ModelProvider;
  providerPriority?: ModelProvider[];
  modelSection?: ModelSectionConfig;
  ollama: OllamaConfig;
  cloud?: CloudConfig;
  openai?: OpenAiConfig;
  anthropic?: AnthropicConfig;
  openrouter?: OpenRouterConfig;
  audio?: AudioConfig;
  vaultPath?: string;
  skillsPath?: string;
  permissions?: PermissionsConfig;
  startup?: StartupConfig;
  gateway?: GatewayConfig;
  projects?: ProjectConfig[];
  tools?: ToolsConfig;
  policy?: PolicyConfig;
  security?: SecurityConfig;
  userProfile?: UserProfileConfig;
  ui?: UIConfig;
}

export interface UserProfileConfig {
  name?: string;
  publicName?: string;
  preferredAddress?: string;
  dateOfBirth?: string;
  learningEnabled?: boolean;
}

export interface UIConfig {
  themes?: string[];
  adjustableColors?: string[];
  defaultTheme?: string;
}

// ===== Defaults =====
const defaultConfig: HarnessConfig = {
  model: "llama3.2",
  assistantName: "M.A.I.",
  modelProvider: "ollama-cloud",
  providerPriority: ["ollama-cloud", "openrouter", "ollama", "anthropic"],
  modelSection: {
    defaultProvider: "ollama_cloud",
    providers: {
      ollama_local: {
        type: "ollamaLocal",
        baseUrl: "http://localhost:11434",
        model: "llama3.2",
        enabled: true
      },
      ollama_cloud: {
        type: "ollamaCloud",
        baseUrl: "https://ollama.example.com",
        model: "llama3.2",
        enabled: true
      },
      openrouter_glm: {
        type: "openaiStyle",
        source: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        model: "z-ai/glm-5.2:free",
        apiKeyEnv: "OPENROUTER_API_KEY",
        enabled: true
      },
      openai_compatible: {
        type: "openaiStyle",
        source: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKeyEnv: "OPENAI_API_KEY",
        enabled: false
      },
      nvidia_nim: {
        type: "openaiStyle",
        source: "nvidia_nim",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        model: "meta/llama3-70b-instruct",
        apiKeyEnv: "NVIDIA_NIM_API_KEY",
        enabled: false
      },
      anthropic: {
        type: "anthropic",
        model: "claude-3-haiku-20240307",
        apiKeyEnv: "ANTHROPIC_API_KEY",
        enabled: false
      }
    }
  },
  ollama: {
    endpoint: "http://127.0.0.1:11434",
    model: "llama3.2"
  },
  cloud: {
    provider: "ollama-cloud",
    endpoint: "https://ollama.example.com",
    model: "llama3.2",
    creditBudget: 10
  },
  openrouter: {
    enabled: true,
    model: "z-ai/glm-5.2:free",
    apiKeyEnv: "OPENROUTER_API_KEY",
    fallback: true,
    baseUrl: "https://openrouter.ai/api/v1"
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
    mode: "builtIn",
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
    allowedExternalCommands: [],
    requireConfirmation: false,
    safetyLevel: "balanced",
    allowAdvancedTools: true,
    allowTerminalAccess: true,
    allowDeviceAccess: true,
    allowNetworkAccess: true
  },
  tools: {
    enabled: true,
    safetyLevel: "experimental",
    allowedDirectories: ["./vault", "./skills", "./sandbox", "./workspace"],
    allowedCommands: [],
    sim3dEnabled: false,
    deviceAccess: true,
    networkAccess: true
  },
  policy: {
    objectives: [
      "Serve as a personal operator for code, engineering research, simulations, file management, administration and automation.",
      "Preserve system stability, privacy, and resource health.",
      "Adapt skills within sandboxed, reviewable workflows.",
      "Coordinate across devices only when configured and authorized.",
      "Learn from user patterns and preferences over time."
    ],
    rules: [
      "Execute commands in sandbox first, then request permission to apply changes.",
      "Respect resource limits and avoid heavy tasks when constrained.",
      "Log significant actions and tool calls for audit.",
      "Limit security tools to defensive and authorized analysis.",
      "Do not assist with unauthorized intrusion, exploitation, or attacks."
    ]
  },
  security: {
    monitorEnabled: true,
    alertOnHighResourceUsage: true,
    alertOnFrequentTerminal: true,
    logActions: true
  },
  gateway: {
    enabled: true,
    port: 3096
  },
  userProfile: {
    name: "Bulega Farid",
    publicName: "The Deadman",
    preferredAddress: "sir",
    dateOfBirth: "2007-11-25",
    learningEnabled: true
  },
  ui: {
    themes: ["black-red", "black-blue", "office-white"],
    adjustableColors: ["blue", "green", "red", "black"],
    defaultTheme: "black-blue"
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
      modelSection: {
        ...defaultConfig.modelSection!,
        ...(parsed.modelSection ?? {}),
        providers: {
          ...defaultConfig.modelSection!.providers,
          ...(parsed.modelSection?.providers ?? {})
        }
      },
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
      openrouter: {
        ...defaultConfig.openrouter,
        ...(parsed.openrouter ?? {})
      },
      audio: {
        ...defaultConfig.audio,
        ...(parsed.audio ?? {})
      },
      permissions: {
        ...defaultConfig.permissions,
        ...(parsed.permissions ?? {})
      },
      tools: {
        ...defaultConfig.tools,
        ...(parsed.tools ?? {})
      },
      policy: {
        ...defaultConfig.policy,
        ...(parsed.policy ?? {})
      },
      security: {
        ...defaultConfig.security,
        ...(parsed.security ?? {})
      },
      gateway: {
        ...defaultConfig.gateway,
        ...(parsed.gateway ?? {})
      },
      userProfile: {
        ...defaultConfig.userProfile,
        ...(parsed.userProfile ?? {})
      },
      ui: {
        ...defaultConfig.ui,
        ...(parsed.ui ?? {})
      }
    };
  } catch (error) {
    throw new Error(`Failed to parse harness config at ${resolvedPath}: ${error}`);
  }
}