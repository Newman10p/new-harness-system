#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { loadConfig } from "./config";
import { SkillRunner } from "./harness/SkillRunner";
import { createPrioritizedModelAdapter } from "./harness/ModelAdapterFactory";
import { ObsidianConnector } from "./harness/ObsidianConnector";
import { loadAudioAdapters } from "./audio/audioLoader";
import { InteractionEngine } from "./core/interaction";
import { printBanner } from "./ui/banner";
import { SandboxedSkillRunner } from "./skills/SandboxedSkillRunner";
import { runOnboarding } from "./onboarding";
import { WorkspaceAgent } from "./workspace/WorkspaceAgent";
import { mergeEnvIntoConfig } from "./config/env";
import { Orchestrator } from "./core/orchestrator";
import { registerAllActions } from "./actions/index";
import { AudioRegistry } from "./audio/AudioRegistry";

function printUsage(): void {
  console.log(`
Jarvis AI Harness CLI

Usage:
  jarvis init                                         # Run onboarding wizard
  jarvis chat --msg <message>                         # Direct chat with model
  jarvis run-skill --skill <skill-file> [--key value ...]
  jarvis run-sandbox --skill <skill-file>
  jarvis promote-skill --skill <skill-file>
  jarvis list-skills
  jarvis work --task <description>                    # Agentic workspace automation

  # Tools / Actions (agentic)
  jarvis tools list                                   # List all available tools/actions
  jarvis tools run <name> --json '{"key":"val"}'      # Run a tool/action

  # Providers
  jarvis provider list                                # List configured providers
  jarvis provider use <name>                          # Set default provider

  # Audio
  jarvis audio mode [builtIn|custom|disabled]         # Show/set audio mode
  jarvis listen --file <audio-file> [--out <audio-file>]
  jarvis speak --text <message> --out <audio-file>

  # Vault
  jarvis inspect-vault
  jarvis create-note --title <title> --filename <file>

  # Security
  jarvis security status                              # Show security alerts and status

  # Info
  jarvis providers                                    # Show provider + credit info
  jarvis pc monitor                                   # Show CPU/RAM/disk stats

Examples:
  jarvis init                                         # Setup wizard
  jarvis tools list                                   # List all registered actions
  jarvis tools run pc.monitor                         # Check system resources
  jarvis provider list                                # Show all providers
  jarvis provider use ollama_local                    # Switch provider
`);
}

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  let key: string | null = null;
  for (const token of args) {
    if (token.startsWith("--")) {
      key = token.substring(2);
      result[key] = "";
    } else if (key) {
      result[key] = token;
      key = null;
    }
  }
  return result;
}

function buildPromptFromArgs(args: Record<string, string>): string {
  if (args.text) return args.text;
  return Object.entries(args)
    .filter(([k]) => !["skill","config","file","out","sandboxRoot","timeout","msg","json"].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join(" ");
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs();
  const command = process.argv[2];
  const subcommand = process.argv[3];

  // Register all actions at startup
  registerAllActions();

  const configPath = args.config ?? "harness.config.json";
  const configExists = fs.existsSync(configPath);

  if (command === "init") {
    await runOnboarding();
    return;
  }

  if (!configExists) {
    console.log("\nFirst time setup detected! Running onboarding wizard...\n");
    await runOnboarding();
    console.log("\nNow running your command...\n");
  }

  const rawConfig = loadConfig(configPath);
  const config = mergeEnvIntoConfig(rawConfig);
  printBanner(config.assistantName ?? "Jarvis");

  // Core services
  const modelAdapter = createPrioritizedModelAdapter(config);
  const audioAdapters = loadAudioAdapters(config);
  const audioRegistry = new AudioRegistry(config);
  const orchestrator = new Orchestrator(config);
  const skillRunner = new SkillRunner(modelAdapter, config);
  const obsidianConnector = new ObsidianConnector(config.vaultPath ?? "./vault");
  const interactionEngine = new InteractionEngine(modelAdapter, skillRunner, obsidianConnector);
  const sandboxRunner = new SandboxedSkillRunner(config);
  const workspaceAgent = new WorkspaceAgent(modelAdapter, config);

  if (!command) {
    printUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      // === CHAT ===
      case "chat": {
        const message = args.msg ?? args.message ?? args.text;
        if (!message) throw new Error("Missing --msg for chat command");
        console.log(`\n🤖 Generating response...\n`);
        const result = await modelAdapter.generate({ prompt: message, maxTokens: 1024 });
        console.log(result.text);
        if (result.metadata?.servingProvider) console.log(`\n(served by: ${result.metadata.servingProvider})`);
        if (result.metadata?.remainingCredits !== undefined) console.log(`(credits remaining: ${result.metadata.remainingCredits})`);
        break;
      }

      // === SKILLS ===
      case "run-skill": {
        const skill = args.skill;
        if (!skill) throw new Error("Missing --skill path");
        const inputValues: Record<string, string> = {};
        for (const [key, value] of Object.entries(args)) {
          if (key === "skill" || key === "config") continue;
          inputValues[key] = value;
        }
        const loaded = await skillRunner.loadSkill(skill);
        if (loaded.sandbox) {
          console.log("Skill is marked sandboxed. Running in sandbox instead.");
          await sandboxRunner.runSkill(skill, {
            sandboxRoot: loaded.sandbox_root ?? args.sandboxRoot ?? `./sandbox/${path.basename(skill, path.extname(skill))}`,
            maxRuntimeMs: args.timeout ? Number(args.timeout) : 20000,
            allowedCommands: config.permissions?.allowedExternalCommands
          });
          break;
        }
        const result = await skillRunner.runSkill(skill, inputValues);
        console.log(result.text);
        if (result.skill.outputNote) {
          const filename = result.skill.outputNote;
          const noteTitle = result.noteTitle ?? result.skill.noteTitle ?? "AI generated note";
          obsidianConnector.createNote(filename, noteTitle, result.text, {
            createdBy: "new-harness-system", skill: result.skill.name ?? "unknown"
          });
          console.log(`Note created: ${filename}`);
        }
        break;
      }

      case "run-sandbox": {
        const skill = args.skill;
        if (!skill) throw new Error("Missing --skill path");
        if (!config.permissions?.allowSandboxedSkills) throw new Error("Sandboxed skills disabled.");
        await sandboxRunner.runSkill(skill, {
          sandboxRoot: args.sandboxRoot ?? `./sandbox/${path.basename(skill, path.extname(skill))}`,
          maxRuntimeMs: args.timeout ? Number(args.timeout) : 20000,
          allowedCommands: config.permissions?.allowedExternalCommands
        });
        break;
      }

      case "promote-skill": {
        const skill = args.skill;
        if (!skill) throw new Error("Missing --skill path");
        const promoted = await sandboxRunner.promoteSkill(skill);
        console.log(promoted ? `Skill promoted: ${skill}` : `Promotion cancelled for skill: ${skill}`);
        break;
      }

      case "list-skills": {
        const skillDir = path.resolve(process.cwd(), config.skillsPath ?? "./skills");
        const files = fs.existsSync(skillDir) ? fs.readdirSync(skillDir) : [];
        console.log(`Skills in ${skillDir}:`);
        for (const file of files) console.log(`- ${file}`);
        break;
      }

      // === VAULT ===
      case "inspect-vault": {
        const notes = await obsidianConnector.listNotes();
        for (const note of notes) console.log(`- ${note.path}: ${note.title}`);
        break;
      }

      case "create-note": {
        const title = args.title;
        const filename = args.filename;
        const content = args.content ?? "";
        if (!title || !filename) throw new Error("Missing --title or --filename");
        obsidianConnector.createNote(filename, title, content, { createdBy: "new-harness-system" });
        console.log(`Note created: ${filename}`);
        break;
      }

      // === AUDIO ===
      case "listen": {
        const file = args.file;
        if (!file) throw new Error("Missing --file path");
        if (!audioAdapters.stt) throw new Error("STT adapter not configured.");
        const transcription = await audioAdapters.stt.transcribe({ filePath: file });
        console.log(`Transcribed: ${transcription}`);
        const output = await interactionEngine.runInteraction({ text: transcription, source: "audio" });
        console.log(output.text);
        if (audioAdapters.tts) {
          const audioBuffer = await audioAdapters.tts.synthesize(output.text);
          fs.writeFileSync(args.out ?? "./listen-response.wav", audioBuffer);
        }
        break;
      }

      case "speak": {
        const text = buildPromptFromArgs(args);
        if (!text) throw new Error("Missing text");
        if (!audioAdapters.tts) throw new Error("TTS adapter not configured.");
        const audioBuffer = await audioAdapters.tts.synthesize(text, {
          voice: args.voice, rate: args.rate ? Number(args.rate) : undefined
        });
        fs.writeFileSync(args.out ?? "./speak-output.wav", audioBuffer);
        console.log(`TTS saved to ${args.out ?? "./speak-output.wav"}`);
        break;
      }

      case "audio": {
        if (subcommand === "mode") {
          const mode = args._ ?? process.argv[4];
          if (mode && ["builtIn","custom","disabled"].includes(mode)) {
            console.log(`Audio mode would be set to: ${mode} (edit harness.config.json)`);
          } else {
            const status = audioRegistry.getStatus();
            console.log(`Audio mode: ${status.mode}, STT: ${status.stt}, TTS: ${status.tts}`);
          }
        } else {
          console.log("Usage: jarvis audio mode [builtIn|custom|disabled]");
        }
        break;
      }

      // === WORKSPACE AGENT ===
      case "do":
      case "work":
      case "agent": {
        const task = args.task ?? args.prompt ?? args.text ?? args.message;
        if (!task) throw new Error("Missing --task or --prompt for workspace action");
        const result = await workspaceAgent.execute(task);
        console.log(result);
        break;
      }

      // === TOOLS / ACTIONS ===
      case "tools": {
        if (subcommand === "list") {
          const actions = orchestrator.actions.list();
          console.log(`\n📦 Registered Actions (${actions.length}):\n`);
          const grouped = new Map<string, typeof actions>();
          for (const { action, meta } of actions) {
            const cat = grouped.get(meta.category) ?? [];
            cat.push({ action, meta });
            grouped.set(meta.category, cat);
          }
          for (const [category, items] of grouped) {
            console.log(`  [${category.toUpperCase()}]`);
            for (const { action, meta } of items) {
              const confirmMark = meta.requiresConfirmation ? " ⚠️" : "";
              console.log(`    ${action.name}${confirmMark} - ${meta.description}`);
            }
            console.log("");
          }
        } else if (subcommand === "run") {
          const actionName = process.argv[4];
          if (!actionName) throw new Error("Missing action name. Usage: jarvis tools run <name> [--json ...]");
          let input: unknown = {};
          if (args.json) {
            try { input = JSON.parse(args.json); } catch { throw new Error("Invalid JSON in --json"); }
          }
          const result = await orchestrator.executeAction(actionName, input);
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("Usage: jarvis tools list | jarvis tools run <name> [--json '{}']");
        }
        break;
      }

      // === PROVIDERS ===
      case "provider": {
        if (subcommand === "list") {
          const providers = orchestrator.providers.listProviders();
          console.log(`\n📡 Configured Providers:\n`);
          for (const p of providers) {
            const isDefault = p.name === orchestrator.providers.defaultProviderName ? " ← default" : "";
            console.log(`  ${p.name} (${p.type}) - model: ${p.model}${isDefault}`);
          }
        } else if (subcommand === "use") {
          const name = process.argv[4];
          if (!name) throw new Error("Missing provider name. Usage: jarvis provider use <name>");
          orchestrator.setProvider(name);
          console.log(`Default provider set to: ${name}`);
        } else {
          console.log("Usage: jarvis provider list | jarvis provider use <name>");
        }
        break;
      }

      case "providers": {
        const providers = orchestrator.providers.listProviders();
        console.log("\n📡 Configured Providers:\n");
        for (const p of providers) {
          const isDefault = p.name === orchestrator.providers.defaultProviderName ? " ← default" : "";
          console.log(`  ${p.name} (${p.type}) - model: ${p.model}${isDefault}`);
        }
        break;
      }

      // === PC MONITOR ===
      case "pc": {
        if (subcommand === "monitor") {
          const result = await orchestrator.executeAction("pc.monitor", {});
          const r = result as any;
          console.log(`\n💻 System Resources:\n`);
          console.log(`  CPU: ${r.cpu?.cores} cores, load: ${r.cpu?.loadAvg?.join(", ")}`);
          console.log(`  Memory: ${r.memory?.usedPercent}% used (${r.memory?.freeGb} GB free / ${r.memory?.totalGb} GB total)`);
          console.log(`  Disk: ${r.disk?.usedPercent}% used (${r.disk?.freeGb} GB free / ${r.disk?.totalGb} GB total)`);
          console.log(`  Uptime: ${Math.floor(r.uptime / 3600)}h ${Math.floor((r.uptime % 3600) / 60)}m`);
        } else {
          console.log("Usage: jarvis pc monitor");
        }
        break;
      }

      // === SECURITY ===
      case "security": {
        if (subcommand === "status") {
          const status = orchestrator.security.getStatus();
          const alerts = orchestrator.security.getRecentAlerts(10);
          console.log(`\n🔒 Security Monitor Status:\n`);
          console.log(`  Total alerts: ${status.totalAlerts}`);
          console.log(`  Total actions logged: ${status.totalActions}`);
          console.log(`  Terminal call rate: ${status.terminalCallRate.toFixed(1)}/min`);
          console.log(`\n  Recent Alerts:\n`);
          if (alerts.length === 0) {
            console.log("  No recent alerts.");
          } else {
            for (const alert of alerts) {
              const prefix = alert.severity === "critical" ? "🔴" : alert.severity === "warning" ? "🟡" : "🔵";
              console.log(`  ${prefix} [${alert.category}] ${alert.message}`);
            }
          }
        } else {
          console.log("Usage: jarvis security status");
        }
        break;
      }

      default: {
        printUsage();
        process.exit(1);
      }
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Clean shutdown
  orchestrator.shutdown();
}

main();