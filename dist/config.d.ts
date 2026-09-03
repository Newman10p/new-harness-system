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
export interface StartupConfig {
    autoStart?: boolean;
    platform?: "win32" | "linux" | "darwin";
}
export interface GatewayConfig {
    enabled?: boolean;
    port?: number;
}
export interface ProjectConfig {
    name: string;
    path: string;
    type: "game" | "ai" | "docs" | "other";
}
export interface ToolsConfig {
    enabled?: boolean;
    safetyLevel?: "conservative" | "balanced" | "experimental";
    allowedDirectories?: string[];
    allowedCommands?: string[];
    sim3dEnabled?: boolean;
    deviceAccess?: boolean;
    networkAccess?: boolean;
}
export interface PolicyConfig {
    objectives?: string[];
    rules?: string[];
}
export interface SecurityConfig {
    monitorEnabled?: boolean;
    alertOnHighResourceUsage?: boolean;
    alertOnFrequentTerminal?: boolean;
    logActions?: boolean;
}
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
export declare function loadConfig(configPath?: string): HarnessConfig;
//# sourceMappingURL=config.d.ts.map