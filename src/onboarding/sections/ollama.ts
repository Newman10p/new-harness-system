import inquirer from "inquirer";
import chalk from "chalk";
import { HarnessConfig } from "../../config";

export async function onboardOllama(existing: Partial<HarnessConfig>): Promise<Partial<HarnessConfig>> {
  console.log(chalk.cyan("\n=== Ollama Setup ===\n"));
  console.log(chalk.gray("Jarvis uses Ollama for local model hosting. This step is optional but recommended.\n"));

  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "useOllama",
      message: "Connect to Ollama?",
      default: true
    },
    {
      type: "input",
      name: "endpoint",
      message: "Ollama endpoint:",
      default: existing.ollama?.endpoint ?? "http://127.0.0.1:11434",
      when: (answers) => answers.useOllama
    },
    {
      type: "input",
      name: "model",
      message: "Default Ollama model:",
      default: existing.ollama?.model ?? "llama3.2",
      when: (answers) => answers.useOllama
    }
  ]);

  if (!answers.useOllama) {
    return {};
  }

  return {
    ollama: {
      endpoint: answers.endpoint.trim(),
      model: answers.model.trim()
    }
  };
}
