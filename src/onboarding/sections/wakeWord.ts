import inquirer from "inquirer";
import { HarnessConfig } from "../../config";
import chalk from "chalk";

export async function onboardWakeWord(existing: Partial<HarnessConfig>): Promise<Partial<HarnessConfig>> {
  console.log(chalk.cyan("\n=== Wake Word Setup ===\n"));

  const enableWakeWord = await inquirer.prompt([
    {
      type: "confirm",
      name: "enable",
      message: "Enable wake-word detection ('Jarvis' keyword)?",
      default: true
    }
  ]);

  if (!enableWakeWord.enable) {
    return {};
  }

  console.log(chalk.yellow("\nTo set up wake word detection, you need to get a Picovoice AccessKey:\n"));
  console.log(chalk.gray("1. Visit: https://console.picovoice.ai/"));
  console.log(chalk.gray("2. Sign up or log in"));
  console.log(chalk.gray("3. Go to the AccessKey section and copy your key"));
  console.log(chalk.gray("4. Return to this terminal and paste it below\n"));

  const answers = await inquirer.prompt([
    {
      type: "password",
      name: "accessKey",
      message: "Picovoice AccessKey (hidden input):",
      mask: "*",
      validate: (input: string) => input.trim().length > 0 || "AccessKey cannot be empty"
    },
    {
      type: "input",
      name: "modelPath",
      message: "Path to Porcupine model file (or leave empty for default):",
      default: existing.audio?.wakeWord?.modelPath ?? ""
    }
  ]);

  const config: Partial<HarnessConfig> = {
    audio: {
      wakeWord: {
        enabled: true,
        accessKey: answers.accessKey.trim(),
        modelPath: answers.modelPath.trim() || undefined,
        keyword: "jarvis"
      }
    }
  };

  return config;
}
