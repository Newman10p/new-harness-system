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
    },
    {
      type: "confirm",
      name: "useCloud",
      message: "Also enable Ollama Cloud (for cloud-based models)?",
      default: false,
      when: (answers) => answers.useOllama
    },
    {
      type: "input",
      name: "cloudEndpoint",
      message: "Ollama Cloud endpoint:",
      default: existing.cloud?.endpoint ?? "https://ollama.example.com",
      when: (answers) => answers.useCloud
    },
    {
      type: "input",
      name: "cloudModel",
      message: "Default Ollama Cloud model:",
      default: existing.cloud?.model ?? "llama3.2",
      when: (answers) => answers.useCloud
    },
    {
      type: "input",
      name: "creditBudget",
      message: "Credit budget for cloud calls (default: 5):",
      default: existing.cloud?.creditBudget?.toString() ?? "5",
      when: (answers) => answers.useCloud,
      validate: (input: string) => {
        const num = Number(input);
        if (isNaN(num) || num < 0) return "Must be a positive number";
        return true;
      }
    }
  ]);

  const config: Partial<HarnessConfig> = {};

  if (answers.useOllama) {
    config.ollama = {
      endpoint: answers.endpoint.trim(),
      model: answers.model.trim()
    };
  }

  if (answers.useCloud) {
    config.cloud = {
      provider: "ollama-cloud",
      endpoint: answers.cloudEndpoint.trim(),
      model: answers.cloudModel.trim(),
      creditBudget: Number(answers.creditBudget)
    };
  }

  // If no ollama or cloud was selected, ensure we have at least a minimal config
  if (!answers.useOllama && !answers.useCloud) {
    // Keep defaults from welcome section
    return {};
  }

  return config;
}
