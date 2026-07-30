import fs from "node:fs";
import chalk from "chalk";
import inquirer from "inquirer";
import { HarnessConfig, loadConfig } from "./config";
import { readConfig, updateConfig } from "./config/loader";
import { updateEnv } from "./config/env";
import { printBanner } from "./ui/banner";
import { onboardWelcome, onboardAudio } from "./onboarding/sections/welcome";
import { onboardOllama } from "./onboarding/sections/ollama";
import { onboardWakeWord } from "./onboarding/sections/wakeWord";
import { onboardStartup } from "./onboarding/sections/startup";
import { onboardObsidian } from "./onboarding/sections/obsidian";
import { onboardPermissions } from "./onboarding/sections/permissions";
import { validateSetup, runSmokeTests } from "./onboarding/validation";

async function configureApiKeys(configPath: string, envPath: string): Promise<void> {
  console.log(chalk.cyan("\n=== Configure API Keys ===\n"));
  
  const config = readConfig(configPath);
  
  // OpenAI API Key
  const openAiAnswer = await inquirer.prompt([
    {
      type: "confirm",
      name: "configureOpenAi",
      message: "Configure OpenAI API key?",
      default: false
    }
  ]);
  
  if (openAiAnswer.configureOpenAi) {
    const openAiKey = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: "Enter your OpenAI API key:",
        mask: "*",
        validate: (input: string) => {
          if (input.trim().length < 10) return "API key must be at least 10 characters";
          return true;
        }
      }
    ]);
    
    updateEnv({ OPENAI_API_KEY: openAiKey.apiKey }, envPath);
    
    // Update config
    updateConfig({ 
      openai: { 
        apiKey: openAiKey.apiKey,
        model: config.openai?.model ?? "gpt-4o-mini",
        baseUrl: config.openai?.baseUrl ?? "https://api.openai.com/v1",
        creditBudget: config.openai?.creditBudget ?? 10
      }
    }, configPath);
    
    console.log(chalk.green("✓ OpenAI API key saved to .env and harness.config.json\n"));
  }
  
  // Anthropic API Key
  const anthropicAnswer = await inquirer.prompt([
    {
      type: "confirm",
      name: "configureAnthropic",
      message: "Configure Anthropic API key?",
      default: false
    }
  ]);
  
  if (anthropicAnswer.configureAnthropic) {
    const anthropicKey = await inquirer.prompt([
      {
        type: "password",
        name: "apiKey",
        message: "Enter your Anthropic API key:",
        mask: "*",
        validate: (input: string) => {
          if (input.trim().length < 10) return "API key must be at least 10 characters";
          return true;
        }
      }
    ]);
    
    updateEnv({ ANTHROPIC_API_KEY: anthropicKey.apiKey }, envPath);
    
    // Update config
    updateConfig({ 
      anthropic: { 
        apiKey: anthropicKey.apiKey,
        model: config.anthropic?.model ?? "claude-3-haiku-20240307",
        baseUrl: config.anthropic?.baseUrl ?? "https://api.anthropic.com/v1",
        creditBudget: config.anthropic?.creditBudget ?? 10
      }
    }, configPath);
    
    console.log(chalk.green("✓ Anthropic API key saved to .env and harness.config.json\n"));
  }
  
  console.log(chalk.cyan("\nAPI keys configured. You can now use these providers.\n"));
}

async function configureGateway(configPath: string): Promise<void> {
  console.log(chalk.cyan("\n=== Configure Gateway Settings ===\n"));
  
  const config = readConfig(configPath);
  
  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "enableGateway",
      message: "Enable UI Gateway (web console)?",
      default: config.gateway?.enabled ?? true
    },
    {
      type: "input",
      name: "gatewayPort",
      message: "Gateway port:",
      default: String(config.gateway?.port ?? 3096),
      when: (answers) => answers.enableGateway,
      validate: (input: string) => {
        const num = Number(input);
        if (isNaN(num) || num < 1 || num > 65535) return "Must be a valid port number (1-65535)";
        return true;
      }
    }
  ]);
  
  updateConfig({
    gateway: {
      enabled: answers.enableGateway,
      port: answers.enableGateway ? Number(answers.gatewayPort) : 3096
    }
  }, configPath);
  
  console.log(chalk.green("✓ Gateway settings updated\n"));
  
  if (answers.enableGateway) {
    console.log(chalk.cyan("\nGateway Access:\n"));
    console.log(chalk.gray(`The UI Gateway will be available at: http://localhost:${answers.gatewayPort}`));
    console.log(chalk.gray("\nTo start the gateway, run:"));
    console.log(chalk.white("  jarvis gateway start"));
    console.log(chalk.gray("\nThe web console allows you to:"));
    console.log(chalk.gray("  - Chat with your assistant"));
    console.log(chalk.gray("  - Switch between model providers"));
    console.log(chalk.gray("  - Monitor system status"));
    console.log(chalk.gray("  - View and run actions"));
    console.log(chalk.gray("  - Search memory\n"));
  }
}

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
          { name: "Reset everything", value: "reset" },
          { name: "Configure API keys (OpenAI/Anthropic)", value: "apikeys" },
          { name: "Configure Gateway settings", value: "gateway" }
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

    if (answer.action === "apikeys") {
      await configureApiKeys(configPath, envPath);
      return;
    }

    if (answer.action === "gateway") {
      await configureGateway(configPath);
      return;
    }
  }

  const existing = readConfig(configPath);
  let config = { ...existing };

  try {
    // Section 1: Welcome & Identity
    let welcomeConfig = await onboardWelcome(config);
    config = { ...config, ...welcomeConfig };
    updateConfig(welcomeConfig, configPath);

    // Section 2: Ollama Setup
    let ollamaConfig = await onboardOllama(config);
    config = { ...config, ...ollamaConfig };
    updateConfig(ollamaConfig, configPath);

    // Section 3: Audio Setup
    const enableAudio = config.audio?.stt?.enabled || config.audio?.tts?.enabled;
    let audioConfig = await onboardAudio(config, enableAudio ?? false);
    config = { ...config, ...audioConfig };
    updateConfig(audioConfig, configPath);

    // Section 4: Wake Word Setup
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

    // Section 5: Startup Setup
    let startupConfig = await onboardStartup(config);
    config = { ...config, ...startupConfig };
    updateConfig(startupConfig, configPath);

    // Section 6: Obsidian & Projects
    let obsidianConfig = await onboardObsidian(config);
    config = { ...config, ...obsidianConfig };
    updateConfig(obsidianConfig, configPath);

    // Section 7: Permissions
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
