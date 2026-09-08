/**
 * Tests for ConfigManager
 */

import { ConfigManagerImpl, getConfigManager, resetConfigManager } from '../src/config/ConfigManager';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('ConfigManager', () => {
  const testConfigPath = path.join(__dirname, '../../test-harness.config.json');
  const testEnvPath = path.join(__dirname, '../../test.env');
  
  let configManager: ConfigManagerImpl;

  beforeEach(() => {
    // Clean up any existing test files
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    if (fs.existsSync(testEnvPath)) {
      fs.unlinkSync(testEnvPath);
    }
    
    resetConfigManager();
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    if (fs.existsSync(testEnvPath)) {
      fs.unlinkSync(testEnvPath);
    }
    resetConfigManager();
  });

  describe('initialization', () => {
    it('should initialize with default config when no file exists', () => {
      configManager = new ConfigManagerImpl(testConfigPath, testEnvPath);
      
      const model = configManager.get<string>('model');
      expect(model).toBe('llama3.2');
      
      const assistantName = configManager.get<string>('assistantName');
      expect(assistantName).toBe('Jarvis');
    });

    it('should load config from file', () => {
      // Create a test config file
      const testConfig = {
        model: 'custom-model',
        assistantName: 'TestAssistant'
      };
      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));
      
      configManager = new ConfigManagerImpl(testConfigPath, testEnvPath);
      
      expect(configManager.get<string>('model')).toBe('custom-model');
      expect(configManager.get<string>('assistantName')).toBe('TestAssistant');
    });

    it('should merge file config with defaults', () => {
      const testConfig = {
        model: 'custom-model'
      };
      fs.writeFileSync(testConfigPath, JSON.stringify(testConfig));
      
      configManager = new ConfigManagerImpl(testConfigPath, testEnvPath);
      
      // Should have custom value
      expect(configManager.get<string>('model')).toBe('custom-model');
      // Should have default value
      expect(configManager.get<string>('assistantName')).toBe('Jarvis');
    });
  });

  describe('get/set operations', () => {
    beforeEach(() => {
      configManager = new ConfigManagerImpl(testConfigPath, testEnvPath);
    });

    it('should get nested values', () => {
      const gatewayEnabled = configManager.get<boolean>('gateway.enabled');
      expect(gatewayEnabled).toBe(true);
      
      const gatewayPort = configManager.get<number>('gateway.port');
      expect(gatewayPort).toBe(3096);
    });

    it('should set values', async () => {
      await configManager.set('assistantName', 'NewAssistant', {
        source: 'test',
        actor: 'tester'
      });
      
      expect(configManager.get<string>('assistantName')).toBe('NewAssistant');
    });

    it('should set nested values', async () => {
      await configManager.set('gateway.port', 8080, {
        source: 'test',
        actor: 'tester'
      });
      
      expect(configManager.get<number>('gateway.port')).toBe(8080);
    });

    it('should throw on invalid values', async () => {
      await expect(configManager.set('gateway.port', -1, {
        source: 'test',
        actor: 'tester'
      })).rejects.toThrow();
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      configManager = new ConfigManagerImpl(testConfigPath, testEnvPath);
    });

    it('should validate correct values', () => {
      const result = configManager.validate('gateway.port', 8080);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject invalid enum values', () => {
      const result = configManager.validate('audio.mode', 'invalid');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('one of'))).toBe(true);
    });

    it('should reject out-of-range numbers', () => {
      const result = configManager.validate('gateway.port', 70000);
      expect(result.valid).toBe(false);
    });

    it('should validate all config', async () => {
      const report = await configManager.validateAll();
      expect(report.overallValid).toBe(true);
    });
  });

  describe('change history', () => {
    beforeEach(() => {
      configManager = new ConfigManagerImpl(testConfigPath, testEnvPath);
    });

    it('should record changes in history', async () => {
      await configManager.set('assistantName', 'First', {
        source: 'test',
        actor: 'tester'
      });
      
      await configManager.set('assistantName', 'Second', {
        source: 'test',
        actor: 'tester'
      });
      
      const history = configManager.history();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should include metadata in history', async () => {
      await configManager.set('assistantName', 'Test', {
        source: 'unit-test',
        actor: 'jest',
        reason: 'testing history'
      });
      
      const history = configManager.history();
      expect(history[0].changeSet.source).toBe('unit-test');
      expect(history[0].changeSet.actor).toBe('jest');
      expect(history[0].changeSet.reason).toBe('testing history');
    });
  });

  describe('preview', () => {
    beforeEach(() => {
      configManager = new ConfigManagerImpl(testConfigPath, testEnvPath);
    });

    it('should preview valid changes', async () => {
      const result = await configManager.preview({
        changes: [{ path: 'assistantName', oldValue: 'Jarvis', newValue: 'Preview' }],
        source: 'test',
        actor: 'tester'
      });
      
      expect(result.wouldApply).toBe(true);
      expect(result.validationErrors.length).toBe(0);
    });

    it('should preview invalid changes', async () => {
      const result = await configManager.preview({
        changes: [{ path: 'gateway.port', oldValue: 3096, newValue: -1 }],
        source: 'test',
        actor: 'tester'
      });
      
      expect(result.wouldApply).toBe(false);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });

    it('should detect sensitive changes requiring approval', async () => {
      const result = await configManager.preview({
        changes: [{ path: 'permissions.safetyLevel', oldValue: 'balanced', newValue: 'experimental' }],
        source: 'test',
        actor: 'tester'
      });
      
      expect(result.requiresApproval).toBe(true);
    });
  });

  describe('rollback', () => {
    beforeEach(() => {
      configManager = new ConfigManagerImpl(testConfigPath, testEnvPath);
    });

    it('should rollback to previous version', async () => {
      const initialVersion = configManager.getCurrentVersion();
      const initialValue = configManager.get<string>('assistantName');
      
      await configManager.set('assistantName', 'Changed', {
        source: 'test',
        actor: 'tester'
      });
      
      expect(configManager.get<string>('assistantName')).toBe('Changed');
      
      const result = await configManager.rollback(initialVersion);
      expect(result.success).toBe(true);
      expect(configManager.get<string>('assistantName')).toBe(initialValue);
    });
  });

  describe('watchers', () => {
    beforeEach(() => {
      configManager = new ConfigManagerImpl(testConfigPath, testEnvPath);
    });

    it('should notify watchers on change', async () => {
      const mockCallback = jest.fn();
      const unsubscribe = configManager.watch('assistantName', mockCallback);
      
      await configManager.set('assistantName', 'Watched', {
        source: 'test',
        actor: 'tester'
      });
      
      expect(mockCallback).toHaveBeenCalledWith('Watched');
      
      unsubscribe();
      
      await configManager.set('assistantName', 'AfterUnsubscribe', {
        source: 'test',
        actor: 'tester'
      });
      
      // Should not be called again after unsubscribe
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getConfigManager', () => {
      const instance1 = getConfigManager();
      const instance2 = getConfigManager();
      expect(instance1).toBe(instance2);
    });

    it('should reset singleton on resetConfigManager', () => {
      const instance1 = getConfigManager();
      resetConfigManager();
      const instance2 = getConfigManager();
      expect(instance1).not.toBe(instance2);
    });
  });
});
