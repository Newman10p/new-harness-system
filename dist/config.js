"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
// ===== Defaults =====
const defaultConfig = {
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
function loadConfig(configPath = "harness.config.json") {
    const resolvedPath = node_path_1.default.resolve(process.cwd(), configPath);
    if (!node_fs_1.default.existsSync(resolvedPath)) {
        return defaultConfig;
    }
    const raw = node_fs_1.default.readFileSync(resolvedPath, "utf8");
    try {
        const parsed = JSON.parse(raw);
        return {
            ...defaultConfig,
            ...parsed,
            modelSection: {
                ...defaultConfig.modelSection,
                ...(parsed.modelSection ?? {}),
                providers: {
                    ...defaultConfig.modelSection.providers,
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
    }
    catch (error) {
        throw new Error(`Failed to parse harness config at ${resolvedPath}: ${error}`);
    }
}
//# sourceMappingURL=config.js.map