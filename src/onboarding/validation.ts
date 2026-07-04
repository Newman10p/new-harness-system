import { HarnessConfig, loadConfig } from "../config";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";

export async function validateSetup(config: HarnessConfig): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Validate config loads
  try {
    loadConfig();
  } catch (error) {
    errors.push(`Config loading failed: ${error}`);
  }

  // Validate vault if connected
  if (config.vaultPath) {
    const resolved = path.resolve(process.cwd(), config.vaultPath);
    if (!fs.existsSync(resolved)) {
      errors.push(`Vault path not found: ${resolved}`);
    }
  }

  // Validate audio config
  if (config.audio?.tts?.enabled && config.audio.tts.backend === "http") {
    if (!config.audio.tts.endpoint) {
      errors.push("TTS HTTP endpoint not configured");
    } else {
      try {
        new URL(config.audio.tts.endpoint);
      } catch {
        errors.push(`Invalid TTS endpoint URL: ${config.audio.tts.endpoint}`);
      }
    }
  }

  // Validate wake word config
  if (config.audio?.wakeWord?.enabled) {
    if (!config.audio.wakeWord.keyword) {
      errors.push("Wake word keyword not set");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function runSmokeTests(config: HarnessConfig): Promise<void> {
  console.log(chalk.cyan("\nRunning smoke tests...\n"));

  // Test 1: Config validation
  try {
    const validation = await validateSetup(config);
    if (validation.valid) {
      console.log(chalk.green("✓ Config validation passed"));
    } else {
      console.log(chalk.yellow("⚠ Config validation issues:"));
      for (const error of validation.errors) {
        console.log(chalk.red(`  - ${error}`));
      }
    }
  } catch (error) {
    console.log(chalk.red(`✗ Config validation failed: ${error}`));
  }

  // Test 2: Audio adapters (if enabled)
  if (config.audio?.stt?.enabled || config.audio?.tts?.enabled) {
    try {
      console.log(chalk.green("✓ Audio adapters configured"));
    } catch (error) {
      console.log(chalk.yellow(`⚠ Audio setup may need manual testing`));
    }
  }

  // Test 3: Vault connectivity
  if (config.vaultPath) {
    const resolved = path.resolve(process.cwd(), config.vaultPath);
    if (fs.existsSync(resolved)) {
      console.log(chalk.green(`✓ Vault accessible: ${resolved}`));
    } else {
      console.log(chalk.red(`✗ Vault not found: ${resolved}`));
    }
  }

  // Test 4: Skills directory
  const skillsPath = path.resolve(process.cwd(), config.skillsPath ?? "./skills");
  if (fs.existsSync(skillsPath)) {
    console.log(chalk.green(`✓ Skills directory found`));
  } else {
    console.log(chalk.yellow(`⚠ Skills directory not found (will be created on first use)`));
  }
}
