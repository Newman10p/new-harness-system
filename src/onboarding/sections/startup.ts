import inquirer from "inquirer";
import { HarnessConfig } from "../../config";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";

export interface GatewayConfig {
  enabled?: boolean;
  port?: number;
}

export async function onboardStartup(existing: Partial<HarnessConfig>): Promise<Partial<HarnessConfig>> {
  console.log(chalk.cyan("\n=== Startup & Gateway Setup ===\n"));
  
  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "autoStart",
      message: "Enable auto-start on boot?",
      default: false
    },
    {
      type: "confirm",
      name: "enableGateway",
      message: "Enable UI Gateway (web console)?",
      default: true
    },
    {
      type: "input",
      name: "gatewayPort",
      message: "Gateway port:",
      default: "3096",
      when: (answers) => answers.enableGateway,
      validate: (input: string) => {
        const num = Number(input);
        if (isNaN(num) || num < 1 || num > 65535) return "Must be a valid port number (1-65535)";
        return true;
      }
    }
  ]);

  const config: Partial<HarnessConfig> = {
    startup: {
      autoStart: answers.autoStart,
      platform: process.platform as any
    },
    gateway: {
      enabled: answers.enableGateway,
      port: answers.enableGateway ? Number(answers.gatewayPort) : 3096
    }
  };

  // Generate startup files for auto-start
  if (answers.autoStart) {
    const osType = process.platform;
    console.log(chalk.yellow(`\nDetected OS: ${osType}\n`));

    if (osType === "win32") {
      const batContent = `@echo off\nREM Auto-generated Jarvis harness startup\ncd /d "${process.cwd()}"\nnpm start\n`;
      const scriptPath = path.join(process.cwd(), "scripts", "startHarness.bat");
      fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
      fs.writeFileSync(scriptPath, batContent, "utf8");
      console.log(chalk.green(`✓ Generated: ${scriptPath}`));
      console.log(chalk.gray(`\nTo enable auto-start on Windows:\n  1. Press Windows+R and type: shell:startup\n  2. Copy ${scriptPath} to that folder\n`));
    } else if (osType === "linux") {
      const serviceName = "jarvis-harness";
      const serviceContent = `[Unit]\nDescription=Jarvis AI Harness\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=${process.cwd()}\nExecStart=/usr/bin/npm start\nRestart=on-failure\nRestartSec=10\n\n[Install]\nWantedBy=default.target\n`;
      const scriptPath = path.join(process.cwd(), "scripts", `${serviceName}.service`);
      fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
      fs.writeFileSync(scriptPath, serviceContent, "utf8");
      console.log(chalk.green(`✓ Generated: ${scriptPath}`));
      console.log(chalk.gray(`\nTo enable auto-start on Linux:\n  1. Copy the .service file to ~/.config/systemd/user/\n  2. Run: systemctl --user daemon-reload\n  3. Run: systemctl --user enable ${serviceName}\n`));
    } else if (osType === "darwin") {
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key>\n  <string>com.jarvis.harness</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>npm</string>\n    <string>start</string>\n  </array>\n  <key>WorkingDirectory</key>\n  <string>${process.cwd()}</string>\n  <key>RunAtLoad</key>\n  <true/>\n  <key>KeepAlive</key>\n  <true/>\n</dict>\n</plist>\n`;
      const scriptPath = path.join(process.cwd(), "scripts", "com.jarvis.harness.plist");
      fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
      fs.writeFileSync(scriptPath, plistContent, "utf8");
      console.log(chalk.green(`✓ Generated: ${scriptPath}`));
      console.log(chalk.gray(`\nTo enable auto-start on macOS:\n  1. Copy the .plist file to ~/Library/LaunchAgents/\n  2. Run: launchctl load ~/Library/LaunchAgents/com.jarvis.harness.plist\n`));
    }
  }

  if (answers.enableGateway) {
    console.log(chalk.cyan("\n=== Gateway Access ===\n"));
    console.log(chalk.gray("The UI Gateway will be available at:"));
    console.log(chalk.white(`  http://localhost:${answers.gatewayPort}`));
    console.log(chalk.gray("\nYou can access the web console to:"));
    console.log(chalk.gray("  - Chat with your assistant"));
    console.log(chalk.gray("  - Switch between model providers"));
    console.log(chalk.gray("  - Monitor system status"));
    console.log(chalk.gray("  - View and run actions"));
    console.log(chalk.gray("  - Search memory"));
  }

  return config;
}
