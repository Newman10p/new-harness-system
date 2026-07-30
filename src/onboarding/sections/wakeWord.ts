import inquirer from "inquirer";
import { HarnessConfig } from "../../config";
import chalk from "chalk";

export async function onboardWakeWord(existing: Partial<HarnessConfig>): Promise<Partial<HarnessConfig>> {
  console.log(chalk.cyan("\n=== Wake Word Setup ===\n"));
  console.log(chalk.gray("A simple, free, and easy option is OpenWakeWord. It works well for local testing and doesn't require a paid service.\n"));

  const enableWakeWord = await inquirer.prompt([
    {
      type: "confirm",
      name: "enable",
      message: "Enable wake-word detection with OpenWakeWord?",
      default: false
    }
  ]);

  if (!enableWakeWord.enable) {
    return {};
  }

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "keyword",
      message: "Wake word keyword:",
      default: existing.audio?.wakeWord?.keyword ?? "jarvis"
    },
    {
      type: "input",
      name: "modelPath",
      message: "Path to OpenWakeWord model (leave empty for default):",
      default: existing.audio?.wakeWord?.modelPath ?? ""
    }
  ]);

  const config: Partial<HarnessConfig> = {
    audio: {
      wakeWord: {
        enabled: true,
        modelPath: answers.modelPath.trim() || undefined,
        keyword: answers.keyword.trim() || "jarvis"
      }
    }
  };

  return config;
}
