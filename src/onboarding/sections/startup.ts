import inquirer from "inquirer";
import { HarnessConfig } from "../../config";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export async function onboardStartup(existing: Partial<HarnessConfig>): Promise<Partial<HarnessConfig>> {
  console.log(chalk.cyan("\n=== Startup Setup ===\n"));

  const answers = await inquirer.prompt([
    {
      type: "confirm",
      name: "autoStart",
      message: "Enable auto-start on boot?",
      default: false
    }
  ]);

  if (!answers.autoStart) {
    return { startup: { autoStart: false } };
  }

  const osType = process.platform;
  console.log(chalk.yellow(`\nDetected OS: ${osType}\n`));

  const config: Partial<HarnessConfig> = {
    startup: {
      autoStart: true,
      platform: osType as any
    }
  };

  // Generate startup files
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

  return config;
}
