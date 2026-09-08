/**
 * Tests for SecretBroker
 */

import { SecretBrokerImpl, getSecretBroker, resetSecretBroker } from '../src/config/SecretBroker';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('SecretBroker', () => {
  const testEnvPath = path.join(__dirname, '../../test-secret.env');
  const testMetaPath = path.join(__dirname, '../../.mai-secrets-meta.json');
  
  let secretBroker: SecretBrokerImpl;

  beforeEach(() => {
    // Clean up any existing test files
    if (fs.existsSync(testEnvPath)) {
      fs.unlinkSync(testEnvPath);
    }
    if (fs.existsSync(testMetaPath)) {
      fs.unlinkSync(testMetaPath);
    }
    
    resetSecretBroker();
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testEnvPath)) {
      fs.unlinkSync(testEnvPath);
    }
    if (fs.existsSync(testMetaPath)) {
      fs.unlinkSync(testMetaPath);
    }
    resetSecretBroker();
  });

  describe('storeSecret and resolveSecret', () => {
    it('should store and retrieve a secret', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('TEST_KEY', 'test-value-123');
      
      const value = await secretBroker.resolveSecret('TEST_KEY', {
        purpose: 'testing',
        requestedBy: 'jest'
      });
      
      expect(value).toBe('test-value-123');
    });

    it('should prefix keys with MAI_ automatically', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('MY_API_KEY', 'my-secret-key');
      
      // Check that the key is stored with MAI_ prefix in .env
      const envContent = fs.readFileSync(testEnvPath, 'utf8');
      expect(envContent).toContain('MAI_MY_API_KEY=');
    });

    it('should throw on non-existent secret', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await expect(secretBroker.resolveSecret('NON_EXISTENT')).rejects.toThrow('Secret not found');
    });
  });

  describe('redactSecret', () => {
    it('should redact API key patterns', () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      const text = 'My API key is sk-abc123xyz and another is sk-ant-def456';
      const redacted = secretBroker.redactSecret(text);
      
      expect(redacted).not.toContain('sk-abc123xyz');
      expect(redacted).not.toContain('sk-ant-def456');
      expect(redacted).toContain('[REDACTED]');
    });

    it('should redact Bearer tokens', () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const redacted = secretBroker.redactSecret(text);
      
      expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(redacted).toContain('[REDACTED]');
    });

    it('should redact password fields', () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      const text = 'password="supersecret123"';
      const redacted = secretBroker.redactSecret(text);
      
      expect(redacted).not.toContain('supersecret123');
      expect(redacted).toContain('[REDACTED]');
    });
  });

  describe('isConfigured', () => {
    it('should return true for configured secrets', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('CONFIGURED_KEY', 'value');
      
      expect(secretBroker.isConfigured('CONFIGURED_KEY')).toBe(true);
    });

    it('should return false for non-configured secrets', () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      expect(secretBroker.isConfigured('NOT_CONFIGURED')).toBe(false);
    });
  });

  describe('listSecrets', () => {
    it('should list all secret keys', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('KEY_A', 'value-a');
      await secretBroker.storeSecret('KEY_B', 'value-b');
      await secretBroker.storeSecret('KEY_C', 'value-c');
      
      const keys = await secretBroker.listSecrets();
      
      expect(keys.length).toBe(3);
      expect(keys).toContain('MAI_KEY_A');
      expect(keys).toContain('MAI_KEY_B');
      expect(keys).toContain('MAI_KEY_C');
    });

    it('should return sorted keys', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('ZEBRA', 'z');
      await secretBroker.storeSecret('ALPHA', 'a');
      
      const keys = await secretBroker.listSecrets();
      
      expect(keys[0]).toBe('MAI_ALPHA');
      expect(keys[1]).toBe('MAI_ZEBRA');
    });
  });

  describe('getStatus', () => {
    it('should return status for configured secret', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('STATUS_KEY', 'value');
      
      const status = secretBroker.getStatus('STATUS_KEY');
      
      expect(status.configured).toBe(true);
      expect(status.needsRotation).toBe(false);
    });

    it('should return status for non-configured secret', () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      const status = secretBroker.getStatus('NON_EXISTENT');
      
      expect(status.configured).toBe(false);
    });
  });

  describe('auditSecretAccess', () => {
    it('should track secret access', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('AUDIT_KEY', 'value');
      
      // Access the secret multiple times
      await secretBroker.resolveSecret('AUDIT_KEY', { purpose: 'test1', requestedBy: 'user1' });
      await secretBroker.resolveSecret('AUDIT_KEY', { purpose: 'test2', requestedBy: 'user2' });
      
      const audit = await secretBroker.auditSecretAccess('AUDIT_KEY');
      
      expect(audit.key).toBe('MAI_AUDIT_KEY');
      expect(audit.accesses.length).toBe(2);
      expect(audit.accesses[0].purpose).toBe('test1');
      expect(audit.accesses[1].requestedBy).toBe('user2');
    });
  });

  describe('revokeSecret', () => {
    it('should delete a secret', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('TO_REVOKE', 'value');
      expect(secretBroker.isConfigured('TO_REVOKE')).toBe(true);
      
      await secretBroker.revokeSecret('TO_REVOKE');
      
      expect(secretBroker.isConfigured('TO_REVOKE')).toBe(false);
    });

    it('should remove from audit log', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('AUDIT_REVOKE', 'value');
      await secretBroker.resolveSecret('AUDIT_REVOKE', { purpose: 'test', requestedBy: 'user' });
      
      await secretBroker.revokeSecret('AUDIT_REVOKE');
      
      const audit = await secretBroker.auditSecretAccess('AUDIT_REVOKE');
      expect(audit.accesses.length).toBe(0);
    });
  });

  describe('testSecret', () => {
    it('should validate OpenAI key format', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('OPENAI_API_KEY', 'sk-validkey123');
      
      const result = await secretBroker.testSecret('OPENAI_API_KEY');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('valid');
    });

    it('should reject invalid OpenAI key format', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('OPENAI_API_KEY', 'invalid-key-format');
      
      const result = await secretBroker.testSecret('OPENAI_API_KEY');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('sk-');
    });

    it('should validate Anthropic key format', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('ANTHROPIC_API_KEY', 'sk-ant-validkey');
      
      const result = await secretBroker.testSecret('ANTHROPIC_API_KEY');
      
      expect(result.success).toBe(true);
    });

    it('should validate NVIDIA key format', async () => {
      secretBroker = new SecretBrokerImpl(testEnvPath);
      
      await secretBroker.storeSecret('NVIDIA_NIM_API_KEY', 'nvapi-validkey');
      
      const result = await secretBroker.testSecret('NVIDIA_NIM_API_KEY');
      
      expect(result.success).toBe(true);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getSecretBroker', () => {
      const instance1 = getSecretBroker();
      const instance2 = getSecretBroker();
      expect(instance1).toBe(instance2);
    });

    it('should reset singleton on resetSecretBroker', () => {
      const instance1 = getSecretBroker();
      resetSecretBroker();
      const instance2 = getSecretBroker();
      expect(instance1).not.toBe(instance2);
    });
  });
});
