/**
 * M.A.I. ENGINEERING - ConfigManager
 * Central Configuration System for Phase 1
 * 
 * ONE ConfigManager used by HUD, CLI, Telegram, runtime, automation, MCP, etc.
 * All settings are typed, validated, and defaulted.
 */

import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { HarnessConfig, defaultConfig } from "../config";
import { readEnv } from "./env";

// ===== Types =====

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidationReport {
  overallValid: boolean;
  results: Record<string, ValidationResult>;
  timestamp: string;
}

export interface ChangeSet {
  id: string;
  changes: Array<{
    path: string;
    oldValue: any;
    newValue: any;
  }>;
  source: string;
  actor: string;
  reason?: string;
  aiInitiated?: boolean;
  createdAt: string;
}

export interface PreviewResult {
  changeSetId: string;
  wouldApply: boolean;
  validationErrors: string[];
  affectedPaths: string[];
  requiresApproval: boolean;
}

export interface ApplyResult {
  success: boolean;
  changeSetId: string;
  version: string;
  appliedAt: string;
  errors?: string[];
}

export interface RollbackResult {
  success: boolean;
  rolledBackToVersion: string;
  previousVersion: string;
  rolledBackAt: string;
}

export interface ChangeHistoryEntry {
  version: string;
  changeSet: ChangeSet;
  appliedAt: string;
  source: string;
  actor: string;
}

export type WatcherHandle = () => void;

export interface ConfigManager {
  get<T>(path: string): T;
  set(path: string, value: any, context?: MutationContext): Promise<void>;
  validate(path: string, value: any): ValidationResult;
  validateAll(): Promise<ValidationReport>;
  preview(changeSet: ChangeSetInput): Promise<PreviewResult>;
  apply(changeSet: ChangeSetInput): Promise<ApplyResult>;
  rollback(version: string): Promise<RollbackResult>;
  history(): ChangeHistoryEntry[];
  watch(path: string, callback: (newVal: any) => void): WatcherHandle;
  getCurrentVersion(): string;
  getConfig(): HarnessConfig;
}

export interface ChangeSetInput {
  id?: string;
  changes: Array<{
    path: string;
    oldValue: any;
    newValue: any;
  }>;
  source: string;
  actor: string;
  reason?: string;
  aiInitiated?: boolean;
}

export interface MutationContext {
  source: string;
  actor: string;
  reason?: string;
  aiInitiated?: boolean;
  approvalId?: string;
}

// ===== Schema Validation Rules =====

interface SchemaRule {
  path: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  validate?: (value: any) => ValidationResult;
}

const schemaRules: SchemaRule[] = [
  // Model configuration
  { path: 'model', type: 'string', required: true },
  { path: 'assistantName', type: 'string' },
  { path: 'modelProvider', type: 'string', enum: ['ollama', 'ollama-cloud', 'openai', 'anthropic'] },
  
  // Audio configuration
  { path: 'audio.mode', type: 'string', enum: ['builtIn', 'custom', 'disabled'] },
  { path: 'audio.stt.enabled', type: 'boolean' },
  { path: 'audio.tts.enabled', type: 'boolean' },
  
  // Permissions
  { path: 'permissions.requireConfirmation', type: 'boolean' },
  { path: 'permissions.safetyLevel', type: 'string', enum: ['conservative', 'balanced', 'experimental'] },
  { path: 'permissions.allowTerminalAccess', type: 'boolean' },
  { path: 'permissions.allowDeviceAccess', type: 'boolean' },
  { path: 'permissions.allowNetworkAccess', type: 'boolean' },
  
  // Tools
  { path: 'tools.enabled', type: 'boolean' },
  { path: 'tools.safetyLevel', type: 'string', enum: ['conservative', 'balanced', 'experimental'] },
  
  // Security
  { path: 'security.monitorEnabled', type: 'boolean' },
  { path: 'security.logActions', type: 'boolean' },
  
  // Gateway
  { path: 'gateway.enabled', type: 'boolean' },
  { path: 'gateway.port', type: 'number', min: 1, max: 65535 },
  
  // Sandbox
  { path: 'sandbox.enabled', type: 'boolean' },
  { path: 'sandbox.defaultTimeoutMs', type: 'number', min: 1000 },
  
  // Device Control
  { path: 'deviceControl.enabled', type: 'boolean' },
  
  // Browser Control
  { path: 'browserControl.enabled', type: 'boolean' },
  
  // Email
  { path: 'email.enabled', type: 'boolean' },
];

// ===== ConfigManager Implementation =====

export class ConfigManagerImpl implements ConfigManager {
  private config: HarnessConfig;
  private configPath: string;
  private envPath: string;
  private historyStore: ChangeHistoryEntry[] = [];
  private versions: Map<string, HarnessConfig> = new Map();
  private watchers: Map<string, Set<(newVal: any) => void>> = new Map();
  private emitter: EventEmitter = new EventEmitter();
  private currentVersion: string = 'v0';
  private readonly MAX_HISTORY = 100;

  constructor(
    configPath: string = 'harness.config.json',
    envPath: string = '.env'
  ) {
    this.configPath = path.resolve(process.cwd(), configPath);
    this.envPath = path.resolve(process.cwd(), envPath);
    const loadedConfig = this.loadConfig();
    this.config = loadedConfig;
    this.initializeHistory();
  }

  private loadConfig(): HarnessConfig {
    // Load base config from file or defaults
    let baseConfig: Partial<HarnessConfig> = {};
    
    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        // Resolve __ENV:VAR__ placeholders
        const resolved = raw.replace(/"__ENV:([A-Z_]+)__"/g, (_, varName) => {
          const val = process.env[varName];
          if (!val) {
            console.warn(`[ConfigManager] __ENV:${varName}__ referenced but ${varName} is not set`);
            return '""';
          }
          return JSON.stringify(val);
        });
        baseConfig = JSON.parse(resolved);
      } catch (error) {
        console.error('[ConfigManager] Failed to parse config file:', error);
      }
    }

    // Merge with defaults
    let config = this.deepMerge(defaultConfig, baseConfig);

    // Override with environment variables (MAI_ prefix)
    config = this.applyEnvOverrides(config);

    // Merge secrets from .env (but don't store them in config object)
    // Secrets are resolved at runtime via SecretBroker
    
    return config;
  }

  private applyEnvOverrides(config: HarnessConfig): HarnessConfig {
    const env = readEnv();
    const prefixedEnv: Record<string, string> = {};
    
    // Extract MAI_ prefixed variables
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith('MAI_')) {
        prefixedEnv[key.substring(4)] = value;
      }
    }

    // Apply overrides based on known paths
    let updatedConfig = { ...config };
    if (prefixedEnv['MODEL']) updatedConfig.model = prefixedEnv['MODEL'];
    if (prefixedEnv['ASSISTANT_NAME']) updatedConfig.assistantName = prefixedEnv['ASSISTANT_NAME'];
    if (prefixedEnv['MODEL_PROVIDER']) {
      const provider = prefixedEnv['MODEL_PROVIDER'] as HarnessConfig['modelProvider'];
      if (provider) updatedConfig.modelProvider = provider;
    }
    if (prefixedEnv['GATEWAY_PORT']) {
      const port = parseInt(prefixedEnv['GATEWAY_PORT'], 10);
      if (!isNaN(port)) updatedConfig.gateway = { ...updatedConfig.gateway, port };
    }
    if (prefixedEnv['VAULT_PATH']) updatedConfig.vaultPath = prefixedEnv['VAULT_PATH'];
    if (prefixedEnv['SKILLS_PATH']) updatedConfig.skillsPath = prefixedEnv['SKILLS_PATH'];

    return updatedConfig;
  }

  private deepMerge(target: any, source: any): any {
    if (!source || typeof source !== 'object') return source;
    if (!target) return source;

    const result = Array.isArray(target) ? [...target] : { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.deepMerge(result[key] ?? {}, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private initializeHistory(): void {
    // Create initial version snapshot
    this.currentVersion = `v${Date.now()}`;
    this.versions.set(this.currentVersion, JSON.parse(JSON.stringify(this.config)));
  }

  private getVersion(): string {
    return `v${Date.now()}`;
  }

  private getAtPath<T>(obj: any, path: string): T {
    return path.split('.').reduce((acc, part) => acc?.[part], obj) as T;
  }

  private setAtPath(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    const lastPart = parts.pop()!;
    const target = parts.reduce((acc, part) => {
      if (!(part in acc)) acc[part] = {};
      return acc[part];
    }, obj);
    target[lastPart] = value;
  }

  /**
   * Get a configuration value by dot-notation path
   */
  get<T>(path: string): T {
    return this.getAtPath<T>(this.config, path);
  }

  /**
   * Set a configuration value with full audit trail
   */
  async set(path: string, value: any, context?: MutationContext): Promise<void> {
    const oldValue = this.get<any>(path);
    
    // Validate before setting
    const validation = this.validate(path, value);
    if (!validation.valid) {
      throw new Error(`Invalid config value for ${path}: ${validation.errors.join(', ')}`);
    }

    // Create change set
    const changeSet: Omit<ChangeSet, 'id' | 'createdAt'> = {
      changes: [{ path, oldValue, newValue: value }],
      source: context?.source || 'runtime',
      actor: context?.actor || 'system',
      reason: context?.reason,
      aiInitiated: context?.aiInitiated || false,
    };

    // Apply the change
    const result = await this.apply(changeSet);
    
    if (!result.success) {
      throw new Error(`Failed to apply config change: ${result.errors?.join(', ')}`);
    }

    // Persist to file
    this.persistConfig();

    // Notify watchers
    this.notifyWatchers(path, value);
  }

  /**
   * Validate a value at a specific path
   */
  validate(path: string, value: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Find matching schema rule
    const rule = schemaRules.find(r => r.path === path);
    
    if (rule) {
      // Type check
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (rule.type && actualType !== rule.type) {
        errors.push(`Expected type ${rule.type}, got ${actualType}`);
      }

      // Enum check
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`Value must be one of: ${rule.enum.join(', ')}`);
      }

      // Min/max for numbers
      if (typeof value === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          errors.push(`Value must be >= ${rule.min}`);
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push(`Value must be <= ${rule.max}`);
        }
      }

      // Pattern for strings
      if (typeof value === 'string' && rule.pattern && !rule.pattern.test(value)) {
        errors.push(`Value does not match required pattern`);
      }

      // Custom validator
      if (rule.validate) {
        const customResult = rule.validate(value);
        errors.push(...customResult.errors);
        warnings.push(...customResult.warnings);
      }
    }

    // Additional semantic validations
    if (path === 'gateway.port' && typeof value === 'number') {
      if (value < 1 || value > 65535) {
        errors.push('Gateway port must be between 1 and 65535');
      }
    }

    if (path === 'sandbox.defaultTimeoutMs' && typeof value === 'number') {
      if (value < 1000) {
        warnings.push('Sandbox timeout less than 1000ms may cause issues');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate entire configuration
   */
  async validateAll(): Promise<ValidationReport> {
    const results: Record<string, ValidationResult> = {};
    let overallValid = true;

    for (const rule of schemaRules) {
      const value = this.getAtPath(this.config, rule.path);
      
      // Skip validation for undefined optional fields
      if (value === undefined && !rule.required) {
        continue;
      }

      // Validate required fields
      if (rule.required && value === undefined) {
        results[rule.path] = {
          valid: false,
          errors: [`Required field ${rule.path} is missing`],
          warnings: []
        };
        overallValid = false;
        continue;
      }

      if (value !== undefined) {
        const result = this.validate(rule.path, value);
        results[rule.path] = result;
        if (!result.valid) {
          overallValid = false;
        }
      }
    }

    return {
      overallValid,
      results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Preview changes without applying them
   */
  async preview(changeSet: ChangeSetInput): Promise<PreviewResult> {
    const validationErrors: string[] = [];
    const affectedPaths: string[] = [];
    let requiresApproval = false;
    const changeSetId = changeSet.id || `preview_${Date.now()}`;

    // Validate each change
    for (const change of changeSet.changes) {
      const result = this.validate(change.path, change.newValue);
      if (!result.valid) {
        validationErrors.push(...result.errors.map(e => `${change.path}: ${e}`));
      }
      affectedPaths.push(change.path);

      // Check if change requires approval (sensitive settings)
      const sensitivePaths = [
        'permissions.requireConfirmation',
        'permissions.safetyLevel',
        'tools.enabled',
        'tools.safetyLevel',
        'security.monitorEnabled',
        'sandbox.enabled'
      ];
      if (sensitivePaths.some(p => change.path.startsWith(p))) {
        requiresApproval = true;
      }
    }

    return {
      changeSetId,
      wouldApply: validationErrors.length === 0,
      validationErrors,
      affectedPaths,
      requiresApproval
    };
  }

  /**
   * Apply a change set with full audit trail
   */
  async apply(changeSet: ChangeSetInput): Promise<ApplyResult> {
    const errors: string[] = [];
    const appliedChanges: Array<{ path: string; oldValue: any; newValue: any }> = [];
    const changeSetId = changeSet.id || `changeset_${Date.now()}`;

    // Validate all changes first
    for (const change of changeSet.changes) {
      const result = this.validate(change.path, change.newValue);
      if (!result.valid) {
        errors.push(...result.errors.map(e => `${change.path}: ${e}`));
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        changeSetId,
        version: this.currentVersion,
        appliedAt: new Date().toISOString(),
        errors
      };
    }

    // Save old config for potential rollback
    const oldConfig = JSON.parse(JSON.stringify(this.config));
    const oldVersion = this.currentVersion;

    // Apply changes
    for (const change of changeSet.changes) {
      const oldValue = this.getAtPath(this.config, change.path);
      this.setAtPath(this.config, change.path, change.newValue);
      appliedChanges.push({ path: change.path, oldValue, newValue: change.newValue });
    }

    // Create new version
    const newVersion = this.getVersion();
    this.currentVersion = newVersion;
    this.versions.set(newVersion, JSON.parse(JSON.stringify(this.config)));

    // Record in history
    const historyEntry: ChangeHistoryEntry = {
      version: newVersion,
      changeSet: {
        id: changeSetId,
        changes: appliedChanges,
        source: changeSet.source,
        actor: changeSet.actor,
        reason: changeSet.reason,
        aiInitiated: changeSet.aiInitiated,
        createdAt: new Date().toISOString()
      },
      appliedAt: new Date().toISOString(),
      source: changeSet.source,
      actor: changeSet.actor
    };

    this.historyStore.unshift(historyEntry);
    
    // Trim history
    if (this.historyStore.length > this.MAX_HISTORY) {
      this.historyStore.pop();
    }

    // Clean up old versions (keep last 10)
    const versionKeys = Array.from(this.versions.keys());
    if (versionKeys.length > 10) {
      versionKeys.slice(0, versionKeys.length - 10).forEach(k => this.versions.delete(k));
    }

    // Emit event
    this.emitter.emit('config_changed', {
      version: newVersion,
      changes: appliedChanges,
      source: changeSet.source,
      actor: changeSet.actor
    });

    return {
      success: true,
      changeSetId,
      version: newVersion,
      appliedAt: historyEntry.appliedAt
    };
  }

  /**
   * Rollback to a previous version
   */
  async rollback(version: string): Promise<RollbackResult> {
    const previousVersion = this.currentVersion;
    const targetConfig = this.versions.get(version);

    if (!targetConfig) {
      return {
        success: false,
        rolledBackToVersion: this.currentVersion,
        previousVersion,
        rolledBackAt: new Date().toISOString()
      };
    }

    this.config = JSON.parse(JSON.stringify(targetConfig));
    this.currentVersion = version;

    // Persist rolled back config
    this.persistConfig();

    // Emit event
    this.emitter.emit('config_rolled_back', {
      fromVersion: previousVersion,
      toVersion: version
    });

    return {
      success: true,
      rolledBackToVersion: version,
      previousVersion,
      rolledBackAt: new Date().toISOString()
    };
  }

  /**
   * Get change history
   */
  history(): ChangeHistoryEntry[] {
    return [...this.historyStore];
  }

  /**
   * Watch for changes at a path
   */
  watch(path: string, callback: (newVal: any) => void): WatcherHandle {
    if (!this.watchers.has(path)) {
      this.watchers.set(path, new Set());
    }
    this.watchers.get(path)!.add(callback);

    // Return unsubscribe function
    return () => {
      const watchers = this.watchers.get(path);
      if (watchers) {
        watchers.delete(callback);
      }
    };
  }

  private notifyWatchers(path: string, value: any): void {
    const watchers = this.watchers.get(path);
    if (watchers) {
      watchers.forEach(cb => cb(value));
    }

    // Also notify parent path watchers
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join('.');
      const parentWatchers = this.watchers.get(parentPath);
      if (parentWatchers) {
        parentWatchers.forEach(cb => cb(this.getAtPath(this.config, parentPath)));
      }
    }
  }

  /**
   * Get current version identifier
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Get full config object (use sparingly, prefer get())
   */
  getConfig(): HarnessConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Persist config to file (without secrets)
   */
  private persistConfig(): void {
    const sanitized = this.sanitizeConfig(this.config);
    const folder = path.dirname(this.configPath);
    
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }

    fs.writeFileSync(this.configPath, JSON.stringify(sanitized, null, 2) + '\n', 'utf8');
  }

  /**
   * Remove sensitive data before persisting
   */
  private sanitizeConfig(config: any): any {
    if (!config || typeof config !== 'object') return config;
    if (Array.isArray(config)) return config.map(item => this.sanitizeConfig(item));

    const result: any = {};
    for (const [key, value] of Object.entries(config)) {
      if (key === 'apiKey' || key === 'api_key' || key === 'secret' || key === 'password') {
        // Skip secrets - they belong in .env only
        continue;
      }
      result[key] = this.sanitizeConfig(value);
    }
    return result;
  }
}

// ===== Singleton Instance =====

let configManagerInstance: ConfigManagerImpl | null = null;

export function getConfigManager(): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManagerImpl();
  }
  return configManagerInstance;
}

export function resetConfigManager(): void {
  configManagerInstance = null;
}
