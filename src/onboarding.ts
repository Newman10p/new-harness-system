import fs from "node:fs";
import chalk from "chalk";
import inquirer from "inquirer";
import { HarnessConfig, loadConfig } from "./config";
import { readConfig, updateConfig } from "./config/loader";
import { updateEnv } from "./config/env";
import { printBanner } from "./ui/banner";
import { onboardWelcome, onboardAudio } from "./onboarding/sections/welcome";
import { onboardWakeWord } from "./onboarding/sections/wakeWord";
import { onboardStartup } from "./onboarding/sections/startup";
import { onboardObsidian } from "./onboarding/sections/obsidian";
import { onboardPermissions } from "./onboarding/sections/permissions";
import { validateSetup, runSmokeTests } from "./onboarding/validation";

export async function runOnboarding(): Promise<void> {
  const configPath = "harness.config.json";
  const envPath = ".env";

  printBanner("Jarvis Setup");

  // Check if config already exists
  const configExists = fs.existsSync(configPath);

  if (configExists) {
    const existing = readConfig(configPath);
    console.log(chalk.gray("Config already exists.\n"));

    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "What would you like to do?",
        choices: [
          { name: "Continue setup / Update settings", value: "continue" },
          { name: "Skip and start harness", value: "skip" },
          { name: "Reset everything", value: "reset" }
        ]
      }
    ]);

    if (answer.action === "skip") {
      console.log(chalk.green("\n✓ Setup skipped. Harness is ready to use!\n"));
      return;
    }

    if (answer.action === "reset") {
      fs.unlinkSync(configPath);
      if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
      console.log(chalk.yellow("Configuration reset. Starting fresh...\n"));
    }
  }

  const existing = readConfig(configPath);
  let config = { ...existing };

  try {
    // Section 1: Welcome & Identity
    let welcomeConfig = await onboardWelcome(config);
    config = { ...config, ...welcomeConfig };
    updateConfig(welcomeConfig, configPath);

    // Section 2: Audio Setup
    const enableAudio = config.audio?.stt?.enabled || config.audio?.tts?.enabled;
    let audioConfig = await onboardAudio(config, enableAudio ?? false);
    config = { ...config, ...audioConfig };
    updateConfig(audioConfig, configPath);

    // Section 3: Wake Word Setup
    const enableWakeWord = enableAudio || (await inquirer.prompt([
      {
        type: "confirm",
        name: "enable",
        message: "Enable wake-word detection?",
        default: false
      }
    ])).enable;

    if (enableWakeWord || config.audio?.wakeWord?.enabled) {
      let wakeWordConfig = await onboardWakeWord(config);
      config = { ...config, ...wakeWordConfig };
      updateConfig(wakeWordConfig, configPath);

      // Save AccessKey to .env
      if (wakeWordConfig.audio?.wakeWord?.accessKey) {
        updateEnv({
          PICOVOICE_ACCESS_KEY: wakeWordConfig.audio.wakeWord.accessKey
        }, envPath);
        console.log(chalk.green("✓ AccessKey saved to .env\n"));
      }
    }

    // Section 4: Startup Setup
    let startupConfig = await onboardStartup(config);
    config = { ...config, ...startupConfig };
    updateConfig(startupConfig, configPath);

    // Section 5: Obsidian & Projects
    let obsidianConfig = await onboardObsidian(config);
    config = { ...config, ...obsidianConfig };
    updateConfig(obsidianConfig, configPath);

    // Section 6: Permissions
    let permissionsConfig = await onboardPermissions(config);
    config = { ...config, ...permissionsConfig };
    updateConfig(permissionsConfig, configPath);

    // Validation & Smoke Tests
    const finalConfig = loadConfig(configPath);

    await runSmokeTests(finalConfig);

    // Summary
    console.log(chalk.cyan("\n=== Setup Complete ===\n"));
    console.log(chalk.green("Configuration saved to: harness.config.json"));
    if (fs.existsSync(envPath)) {
      console.log(chalk.green("Secrets saved to: .env"));
    }

    console.log(chalk.cyan("\nNext steps:\n"));
    console.log(chalk.gray(`1. Run: ${chalk.white("npm run build")}`));
    console.log(chalk.gray(`2. Start harness: ${chalk.white("npm start")}`));
    console.log(chalk.gray(`3. Try a command: ${chalk.white("npm run cli -- list-skills")}`));

    if (config.startup?.autoStart) {
      console.log(chalk.cyan("\nAuto-start setup:\n"));
      console.log(chalk.gray("See the instructions above to enable boot-time startup."));
    }

    console.log(chalk.cyan("\nHave fun! 🚀\n"));
  } catch (error) {
    console.error(chalk.red("\nSetup error:"), error);
    process.exit(1);
  }
}
