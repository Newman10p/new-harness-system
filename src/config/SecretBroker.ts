/**
 * M.A.I. ENGINEERING - SecretBroker
 * Critical rule: Never expose raw secrets to models, logs, UI, or artifacts.
 * 
 * Prefer OS-backed secret stores; fallback to encrypted file persistence.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { readEnv, writeEnv } from "./env";

// ===== Types =====

export interface SecretMetadata {
  description?: string;
  category?: 'provider' | 'service' | 'database' | 'api' | 'other';
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  rotationPolicy?: 'manual' | 'automatic';
  lastRotatedAt?: string;
}

export interface SecretContext {
  purpose: string;
  requestedBy: string;
  sessionId?: string;
  taskId?: string;
}

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

export interface AccessAudit {
  key: string;
  accesses: Array<{
    timestamp: string;
    purpose: string;
    requestedBy: string;
    sessionId?: string;
    taskId?: string;
    success: boolean;
  }>;
}

export interface SecretStatus {
  configured: boolean;
  lastUsed?: string;
  expiresAt?: string;
  needsRotation: boolean;
}

export interface SecretBroker {
  storeSecret(key: string, value: string, metadata?: SecretMetadata): Promise<void>;
  resolveSecret(key: string, context?: SecretContext): Promise<string>;
  rotateSecret(key: string, oldValue?: string): Promise<string>;
  revokeSecret(key: string): Promise<void>;
  testSecret(key: string): Promise<TestResult>;
  redactSecret(text: string): string;
  auditSecretAccess(key: string): Promise<AccessAudit>;
  listSecrets(): Promise<string[]>;
  isConfigured(key: string): boolean;
  getStatus(key: string): SecretStatus;
}

// ===== Constants =====

const SECRET_PREFIX = 'MAI_';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// ===== SecretBroker Implementation =====

export class SecretBrokerImpl implements SecretBroker {
  private envPath: string;
  private encryptionKey: Buffer | null = null;
  private accessLog: Map<string, AccessAudit['accesses']> = new Map();
  private metadataStore: Map<string, SecretMetadata> = new Map();
  private emitter: EventEmitter = new EventEmitter();
  private readonly REDACTED = '[REDACTED]';

  constructor(envPath: string = '.env') {
    this.envPath = path.resolve(process.cwd(), envPath);
    this.initializeEncryptionKey();
    this.loadMetadata();
  }

  /**
   * Initialize encryption key from environment or generate one
   * In production, this should come from a secure key management service
   */
  private initializeEncryptionKey(): void {
    const keyHex = process.env.MAI_SECRET_KEY;
    
    if (keyHex) {
      try {
        this.encryptionKey = Buffer.from(keyHex, 'hex');
        if (this.encryptionKey.length !== 32) {
          console.warn('[SecretBroker] MAI_SECRET_KEY must be 32 bytes (64 hex chars)');
          this.encryptionKey = null;
        }
      } catch {
        console.warn('[SecretBroker] Invalid MAI_SECRET_KEY format');
        this.encryptionKey = null;
      }
    } else {
      // Generate a key for this session only (not persisted)
      this.encryptionKey = crypto.randomBytes(32);
      console.log('[SecretBroker] Using session-only encryption key (not persisted)');
    }
  }

  /**
   * Load metadata from hidden file
   */
  private loadMetadata(): void {
    const metadataPath = path.join(path.dirname(this.envPath), '.mai-secrets-meta.json');
    try {
      if (fs.existsSync(metadataPath)) {
        const raw = fs.readFileSync(metadataPath, 'utf8');
        const data = JSON.parse(raw);
        this.metadataStore = new Map(Object.entries(data));
      }
    } catch (error) {
      console.warn('[SecretBroker] Failed to load metadata:', error);
    }
  }

  /**
   * Save metadata to hidden file
   */
  private saveMetadata(): void {
    const metadataPath = path.join(path.dirname(this.envPath), '.mai-secrets-meta.json');
    try {
      const data = Object.fromEntries(this.metadataStore);
      fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2), 'utf8');
      // Set restrictive permissions on Unix systems
      try {
        fs.chmodSync(metadataPath, 0o600);
      } catch {
        // Ignore on Windows
      }
    } catch (error) {
      console.error('[SecretBroker] Failed to save metadata:', error);
    }
  }

  /**
   * Encrypt a value
   */
  private encrypt(value: string): string {
    if (!this.encryptionKey) {
      // Fallback: return as-is (should not happen in production)
      console.warn('[SecretBroker] No encryption key available');
      return value;
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypt a value
   */
  private decrypt(encryptedValue: string): string {
    if (!this.encryptionKey) {
      console.warn('[SecretBroker] No encryption key available');
      return encryptedValue;
    }

    const parts = encryptedValue.split(':');
    if (parts.length !== 3) {
      // Not encrypted, return as-is
      return encryptedValue;
    }

    const [ivHex, authTagHex, encryptedData] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Store a secret securely
   */
  async storeSecret(key: string, value: string, metadata?: SecretMetadata): Promise<void> {
    // Normalize key
    const normalizedKey = key.startsWith(SECRET_PREFIX) ? key : `${SECRET_PREFIX}${key}`;
    
    // Validate key format
    if (!/^[A-Z_]+$/.test(normalizedKey.substring(SECRET_PREFIX.length))) {
      throw new Error(`Invalid secret key format: ${key}. Use uppercase letters and underscores only.`);
    }

    // Encrypt the value
    const encryptedValue = this.encrypt(value);
    
    // Read existing env file
    const env = readEnv();
    
    // Store encrypted value
    env[normalizedKey] = encryptedValue;
    
    // Write back to .env
    writeEnv(env, this.envPath);

    // Update metadata
    const now = new Date().toISOString();
    const existingMeta = this.metadataStore.get(normalizedKey) || {};
    this.metadataStore.set(normalizedKey, {
      ...existingMeta,
      ...metadata,
      createdAt: existingMeta.createdAt || now,
      updatedAt: now
    });
    this.saveMetadata();

    // Emit event
    this.emitter.emit('secret_stored', { key: normalizedKey });

    console.log(`[SecretBroker] Stored secret: ${normalizedKey}`);
  }

  /**
   * Resolve a secret by key
   */
  async resolveSecret(key: string, context?: SecretContext): Promise<string> {
    // Normalize key
    const normalizedKey = key.startsWith(SECRET_PREFIX) ? key : `${SECRET_PREFIX}${key}`;
    
    // Read from env
    const env = readEnv();
    const encryptedValue = env[normalizedKey];

    if (!encryptedValue) {
      throw new Error(`Secret not found: ${normalizedKey}`);
    }

    // Decrypt
    const value = this.decrypt(encryptedValue);

    // Log access for audit
    this.logAccess(normalizedKey, context);

    // Emit event
    this.emitter.emit('secret_resolved', { key: normalizedKey, context });

    return value;
  }

  /**
   * Log secret access for auditing
   */
  private logAccess(key: string, context?: SecretContext): void {
    if (!this.accessLog.has(key)) {
      this.accessLog.set(key, []);
    }

    const log = this.accessLog.get(key)!;
    log.push({
      timestamp: new Date().toISOString(),
      purpose: context?.purpose || 'unknown',
      requestedBy: context?.requestedBy || 'system',
      sessionId: context?.sessionId,
      taskId: context?.taskId,
      success: true
    });

    // Keep last 100 accesses per key
    if (log.length > 100) {
      log.shift();
    }
  }

  /**
   * Rotate a secret
   */
  async rotateSecret(key: string, oldValue?: string): Promise<string> {
    const normalizedKey = key.startsWith(SECRET_PREFIX) ? key : `${SECRET_PREFIX}${key}`;
    
    // Verify old value if provided (for security)
    if (oldValue) {
      const currentValue = await this.resolveSecret(key);
      if (currentValue !== oldValue) {
        throw new Error('Old value does not match current secret. Rotation aborted.');
      }
    }

    // Generate new random value (for API keys, tokens, etc.)
    // In practice, you'd get the new value from the provider
    const newValue = crypto.randomBytes(24).toString('base64');
    
    // Store new value
    const meta = this.metadataStore.get(normalizedKey);
    await this.storeSecret(key, newValue, {
      ...meta,
      lastRotatedAt: new Date().toISOString(),
      rotationPolicy: meta?.rotationPolicy || 'manual'
    });

    console.log(`[SecretBroker] Rotated secret: ${normalizedKey}`);
    return newValue;
  }

  /**
   * Revoke/delete a secret
   */
  async revokeSecret(key: string): Promise<void> {
    const normalizedKey = key.startsWith(SECRET_PREFIX) ? key : `${SECRET_PREFIX}${key}`;
    
    // Read env file
    const env = readEnv();
    
    // Remove the secret
    delete env[normalizedKey];
    this.metadataStore.delete(normalizedKey);
    this.accessLog.delete(normalizedKey);
    
    // Write back
    writeEnv(env, this.envPath);
    this.saveMetadata();

    // Emit event
    this.emitter.emit('secret_revoked', { key: normalizedKey });

    console.log(`[SecretBroker] Revoked secret: ${normalizedKey}`);
  }

  /**
   * Test if a secret is valid (provider-specific)
   */
  async testSecret(key: string): Promise<TestResult> {
    const normalizedKey = key.startsWith(SECRET_PREFIX) ? key : `${SECRET_PREFIX}${key}`;
    
    try {
      const value = await this.resolveSecret(normalizedKey, {
        purpose: 'testing',
        requestedBy: 'system'
      });

      // Basic validation: check if value exists and is non-empty
      if (!value || value.trim() === '') {
        return {
          success: false,
          message: 'Secret is empty or invalid'
        };
      }

      // Provider-specific tests
      if (normalizedKey.includes('OPENAI')) {
        return await this.testOpenAiKey(value);
      } else if (normalizedKey.includes('ANTHROPIC')) {
        return await this.testAnthropicKey(value);
      } else if (normalizedKey.includes('NVIDIA')) {
        return await this.testNvidiaKey(value);
      }

      // Generic test: just check format
      return {
        success: true,
        message: 'Secret appears valid (format check only)'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to test secret: ${error.message}`
      };
    }
  }

  private async testOpenAiKey(apiKey: string): Promise<TestResult> {
    // Basic format check for OpenAI keys (sk-...)
    if (!apiKey.startsWith('sk-')) {
      return {
        success: false,
        message: 'OpenAI API key should start with "sk-"'
      };
    }
    return {
      success: true,
      message: 'OpenAI API key format is valid'
    };
  }

  private async testAnthropicKey(apiKey: string): Promise<TestResult> {
    // Basic format check for Anthropic keys (sk-ant-...)
    if (!apiKey.startsWith('sk-ant-')) {
      return {
        success: false,
        message: 'Anthropic API key should start with "sk-ant-"'
      };
    }
    return {
      success: true,
      message: 'Anthropic API key format is valid'
    };
  }

  private async testNvidiaKey(apiKey: string): Promise<TestResult> {
    // Nvidia keys are typically nvapi-...
    if (!apiKey.startsWith('nvapi-')) {
      return {
        success: false,
        message: 'NVIDIA API key should start with "nvapi-"'
      };
    }
    return {
      success: true,
      message: 'NVIDIA API key format is valid'
    };
  }

  /**
   * Redact secrets from text (for logging)
   */
  redactSecret(text: string): string {
    let redacted = text;

    // Redact common secret patterns
    const patterns = [
      /sk-[a-zA-Z0-9-_]+/g,           // OpenAI/Anthropic style
      /nvapi-[a-zA-Z0-9-_]+/g,        // NVIDIA style
      /Bearer\s+[a-zA-Z0-9-_\.]+/g,   // Bearer tokens
      /api[_-]?key["']?\s*[:=]\s*["']?[a-zA-Z0-9-_]+/gi,  // api_key = "..."
      /password["']?\s*[:=]\s*["']?[^"'\s]+/gi,  // password = "..."
      /secret["']?\s*[:=]\s*["']?[^"'\s]+/gi,    // secret = "..."
    ];

    for (const pattern of patterns) {
      redacted = redacted.replace(pattern, this.REDACTED);
    }

    // Also redact MAI_ environment variable values in logs
    const envVars = readEnv();
    for (const [key, value] of Object.entries(envVars)) {
      if (key.startsWith(SECRET_PREFIX) && value) {
        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const varPattern = new RegExp(escapedValue, 'g');
        redacted = redacted.replace(varPattern, this.REDACTED);
      }
    }

    return redacted;
  }

  /**
   * Get audit log for a secret
   */
  async auditSecretAccess(key: string): Promise<AccessAudit> {
    const normalizedKey = key.startsWith(SECRET_PREFIX) ? key : `${SECRET_PREFIX}${key}`;
    const accesses = this.accessLog.get(normalizedKey) || [];

    return {
      key: normalizedKey,
      accesses: [...accesses]
    };
  }

  /**
   * List all secret keys (not values!)
   */
  async listSecrets(): Promise<string[]> {
    const env = readEnv();
    const keys: string[] = [];

    for (const key of Object.keys(env)) {
      if (key.startsWith(SECRET_PREFIX)) {
        keys.push(key);
      }
    }

    return keys.sort();
  }

  /**
   * Check if a secret is configured
   */
  isConfigured(key: string): boolean {
    const normalizedKey = key.startsWith(SECRET_PREFIX) ? key : `${SECRET_PREFIX}${key}`;
    const env = readEnv();
    return normalizedKey in env && !!env[normalizedKey];
  }

  /**
   * Get status of a secret
   */
  getStatus(key: string): SecretStatus {
    const normalizedKey = key.startsWith(SECRET_PREFIX) ? key : `${SECRET_PREFIX}${key}`;
    const env = readEnv();
    const meta = this.metadataStore.get(normalizedKey);
    const accesses = this.accessLog.get(normalizedKey) || [];

    const configured = normalizedKey in env && !!env[normalizedKey];
    const lastUsed = accesses.length > 0 ? accesses[accesses.length - 1].timestamp : undefined;
    
    // Check if rotation is needed (e.g., expired or older than 90 days)
    let needsRotation = false;
    if (meta?.expiresAt) {
      needsRotation = new Date(meta.expiresAt) < new Date();
    } else if (meta?.lastRotatedAt) {
      const lastRotated = new Date(meta.lastRotatedAt);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      needsRotation = lastRotated < ninetyDaysAgo;
    }

    return {
      configured,
      lastUsed,
      expiresAt: meta?.expiresAt,
      needsRotation
    };
  }
}

// ===== Singleton Instance =====

let secretBrokerInstance: SecretBrokerImpl | null = null;

export function getSecretBroker(): SecretBroker {
  if (!secretBrokerInstance) {
    secretBrokerInstance = new SecretBrokerImpl();
  }
  return secretBrokerInstance;
}

export function resetSecretBroker(): void {
  secretBrokerInstance = null;
}
