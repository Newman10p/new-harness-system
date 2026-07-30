import inquirer from "inquirer";
import { HarnessConfig } from "../../config";
import chalk from "chalk";

export async function onboardPermissions(existing: Partial<HarnessConfig>): Promise<Partial<HarnessConfig>> {
  console.log(chalk.cyan("\n=== Sandbox & Permissions ===\n"));

  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "sandboxByDefault",
      message: "Run new skills in sandbox by default?",
      default: existing.permissions?.allowSandboxedSkills ?? true
    },
    {
      type: "confirm",
      name: "requireConfirmation",
      message: "Require confirmation before writes outside sandbox?",
      default: true
    }
  ]);

  const config: Partial<HarnessConfig> = {
    permissions: {
      allowSandboxedSkills: answers.sandboxByDefault,
      requireConfirmation: answers.requireConfirmation,
      allowedExternalCommands: []
    }
  };

  return config;
}
