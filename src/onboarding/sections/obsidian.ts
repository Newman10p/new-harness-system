import inquirer from "inquirer";
import { HarnessConfig, ProjectConfig } from "../../config";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";

export async function onboardObsidian(existing: Partial<HarnessConfig>): Promise<Partial<HarnessConfig>> {
  console.log(chalk.cyan("\n=== Obsidian Vault Setup ===\n"));

  const connectVault = await inquirer.prompt([
    {
      type: "confirm",
      name: "connect",
      message: "Connect an Obsidian vault?",
      default: !!existing.vaultPath
    }
  ]);

  if (!connectVault.connect) {
    return {};
  }

  const vaultPath = await inquirer.prompt([
    {
      type: "input",
      name: "path",
      message: "Path to your Obsidian vault directory:",
      default: existing.vaultPath ?? "./vault",
      validate: (input: string) => {
        const resolved = path.resolve(process.cwd(), input);
        if (!fs.existsSync(resolved)) {
          return `Directory does not exist: ${resolved}`;
        }
        return true;
      }
    }
  ]);

  const config: Partial<HarnessConfig> = {
    vaultPath: vaultPath.path
  };

  // Ask about projects
  const addProjects = await inquirer.prompt([
    {
      type: "confirm",
      name: "register",
      message: "Register project folders?",
      default: false
    }
  ]);

  if (!addProjects.register) {
    return config;
  }

  const projects: ProjectConfig[] = [];

  while (true) {
    const project = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Project name (or 'done' to finish):",
        validate: (input: string) => input.trim().length > 0 || "Name cannot be empty"
      }
    ]);

    if (project.name.toLowerCase() === "done") {
      break;
    }

    const projectDetails = await inquirer.prompt([
      {
        type: "input",
        name: "path",
        message: `Path for ${project.name}:`,
        default: `./${project.name}`,
        validate: (input: string) => input.trim().length > 0 || "Path cannot be empty"
      },
      {
        type: "list",
        name: "type",
        message: `Type for ${project.name}:`,
        choices: ["game", "ai", "docs", "other"],
        default: "other"
      }
    ]);

    projects.push({
      name: project.name,
      path: projectDetails.path,
      type: projectDetails.type as "game" | "ai" | "docs" | "other"
    });

    console.log(chalk.green(`✓ Added project: ${project.name}\n`));
  }

  if (projects.length > 0) {
    config.projects = projects;
  }

  return config;
}
