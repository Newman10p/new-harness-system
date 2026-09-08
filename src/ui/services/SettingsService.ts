/**
 * M.A.I. Settings Service
 * Centralized settings management backed by ConfigManager
 */

import { ConfigManager } from '../../config/ConfigManager';
import type { AuraTheme, ColorMode } from './ThemeService';

export interface IdentitySettings {
  name: string;
  role: string;
  persona: string;
  communicationStyle: {
    verbosity: 'terse' | 'normal' | 'detailed';
    formality: 'casual' | 'professional' | 'formal';
    tone: 'friendly' | 'neutral' | 'authoritative';
  };
  proactiveLevel: number; // 0-100
  addressing: 'first-name' | 'full-name' | 'title' | 'none';
  interruptionBehavior: 'immediate' | 'polite' | 'defer';
  backgroundUpdates: boolean;
}

export interface PolicySettings {
  safetyLevel: 'low' | 'medium' | 'high' | 'maximum';
  requireApproval: string[];
  autoApprove: string[];
  deniedActions: string[];
  riskThreshold: number; // 0-100
}

export interface ModelSettings {
  defaultProvider: string;
  defaultModel: string;
  fallbackProviders: string[];
  contextBudget: number; // tokens
  maxTokens: number;
  temperature: number;
}

export interface VoiceSettings {
  enabled: boolean;
  personality: 'friday' | 'jarvis' | 'alexa' | 'custom';
  ttsEngine: 'browser' | 'piper' | 'kokoro';
  speechRate: number;
  pitch: number;
  volume: number;
}

export interface MemorySettings {
  enabled: boolean;
  autoCapture: boolean;
  retentionDays: number;
  compactionThreshold: number; // items
  importanceThreshold: number; // 0-100
}

export interface McpServerConfig {
  serverId: string;
  name: string;
  transport: 'stdio' | 'streamable-http' | 'sse';
  endpoint?: string;
  command?: string;
  args?: string[];
  enabled: boolean;
  trustLevel: 'trusted' | 'semi-trusted' | 'untrusted';
  allowedTools: string[];
  allowedResources: string[];
  allowedPrompts: string[];
}

export interface McpSettings {
  servers: McpServerConfig[];
  defaultTrustLevel: 'trusted' | 'semi-trusted' | 'untrusted';
  requireApprovalForTools: boolean;
}

export interface AppearanceSettings {
  mode: ColorMode;
  aura: AuraTheme;
  fontSize: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
}

export interface RuntimeSettings {
  actionTimeout: number; // ms
  maxLoopIterations: number;
  retryAttempts: number;
  circuitBreakerThreshold: number;
  backgroundConcurrency: number;
  taskQueueLimit: number;
  logRetentionDays: number;
}

export class SettingsService {
  private config: ConfigManager;

  constructor(configManager: ConfigManager) {
    this.config = configManager;
  }

  // Identity
  getIdentity(): IdentitySettings {
    return this.config.get('identity');
  }

  async updateIdentity(settings: Partial<IdentitySettings>): Promise<void> {
    const current = this.getIdentity();
    const updated = { ...current, ...settings };
    this.config.set('identity', updated);
  }

  // Policy
  getPolicy(): PolicySettings {
    return this.config.get('policy');
  }

  async updatePolicy(settings: Partial<PolicySettings>): Promise<void> {
    const current = this.getPolicy();
    const updated = { ...current, ...settings };
    this.config.set('policy', updated);
  }

  // Models
  getModels(): ModelSettings {
    return this.config.get('models');
  }

  async updateModels(settings: Partial<ModelSettings>): Promise<void> {
    const current = this.getModels();
    const updated = { ...current, ...settings };
    this.config.set('models', updated);
  }

  // Voice
  getVoice(): VoiceSettings {
    return this.config.get('voice');
  }

  async updateVoice(settings: Partial<VoiceSettings>): Promise<void> {
    const current = this.getVoice();
    const updated = { ...current, ...settings };
    this.config.set('voice', updated);
  }

  // Memory
  getMemory(): MemorySettings {
    return this.config.get('memory');
  }

  async updateMemory(settings: Partial<MemorySettings>): Promise<void> {
    const current = this.getMemory();
    const updated = { ...current, ...settings };
    this.config.set('memory', updated);
  }

  // MCP
  getMcp(): McpSettings {
    return this.config.get('mcp');
  }

  async addMcpServer(server: McpServerConfig): Promise<void> {
    const current = this.getMcp();
    if (!current.servers.find(s => s.serverId === server.serverId)) {
      current.servers.push(server);
      this.config.set('mcp', current);
    }
  }

  async updateMcpServer(serverId: string, updates: Partial<McpServerConfig>): Promise<void> {
    const current = this.getMcp();
    const idx = current.servers.findIndex(s => s.serverId === serverId);
    if (idx !== -1) {
      current.servers[idx] = { ...current.servers[idx], ...updates };
      this.config.set('mcp', current);
    }
  }

  async removeMcpServer(serverId: string): Promise<void> {
    const current = this.getMcp();
    current.servers = current.servers.filter(s => s.serverId !== serverId);
    this.config.set('mcp', current);
  }

  // Appearance
  getAppearance(): AppearanceSettings {
    return this.config.get('appearance');
  }

  async updateAppearance(settings: Partial<AppearanceSettings>): Promise<void> {
    const current = this.getAppearance();
    const updated = { ...current, ...settings };
    this.config.set('appearance', updated);
  }

  // Runtime
  getRuntime(): RuntimeSettings {
    return this.config.get('runtime');
  }

  async updateRuntime(settings: Partial<RuntimeSettings>): Promise<void> {
    const current = this.getRuntime();
    const updated = { ...current, ...settings };
    this.config.set('runtime', updated);
  }

  // Preview changes
  previewChanges(section: string, changes: Record<string, any>): Record<string, any> {
    const current = this.config.get(section) as Record<string, any> || {};
    return { ...current, ...changes };
  }

  // Get all settings
  getAllSettings(): Record<string, any> {
    return {
      identity: this.getIdentity() as any,
      policy: this.getPolicy() as any,
      models: this.getModels() as any,
      voice: this.getVoice() as any,
      memory: this.getMemory() as any,
      mcp: this.getMcp() as any,
      appearance: this.getAppearance() as any,
      runtime: this.getRuntime() as any,
    };
  }
}
