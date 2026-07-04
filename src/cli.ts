#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { loadConfig } from "./config";
import { SkillRunner } from "./harness/SkillRunner";
import { createModelAdapter } from "./harness/ModelAdapterFactory";
import { ObsidianConnector } from "./harness/ObsidianConnector";
import { loadAudioAdapters } from "./audio/audioLoader";
import { InteractionEngine } from "./core/interaction";
import { printBanner } from "./ui/banner";
import { SandboxedSkillRunner } from "./skills/SandboxedSkillRunner";
import { runOnboarding } from "./onboarding";
import { WorkspaceAgent } from "./workspace/WorkspaceAgent";

function printUsage(): void {
  console.log(`
Jarvis AI Harness CLI

Usage:
  jarvis init                                         # Run onboarding wizard
  jarvis run-skill --skill <skill-file> [--key value ...]
  jarvis inspect-vault
  jarvis create-note --title <title> --filename <file> [--content <text>]
  jarvis listen --file <audio-file> [--out <audio-file>]
  jarvis speak --text <message> --out <audio-file>
  jarvis list-skills
  jarvis run-sandbox --skill <skill-file> [--sandboxRoot <dir>] [--timeout <ms>]
  jarvis promote-skill --skill <skill-file>
  jarvis work --task <description>                    # Ask Ollama to create or edit files in your configured folders

Examples:
  jarvis init                                         # Setup wizard (or runs automatically)
  jarvis list-skills                                  # List all available skills
  jarvis run-skill --skill ./skills/example.yml       # Run a skill
  jarvis work --task "Create a todo note in my vault" # Let Ollama edit files in your configured folders
  jarvis speak --text "Hello world" --out output.wav  # Text to speech
  jarvis listen --file input.wav --out output.txt     # Speech to text
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
  if (args.text) {
    return args.text;
  }
  return Object.entries(args)
    .filter(([key]) => key !== "skill" && key !== "config" && key !== "file" && key !== "out" && key !== "sandboxRoot" && key !== "timeout")
    .map(([key, value]) => `${key}: ${value}`)
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

  // Check for first-run or init command
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

  const config = loadConfig(configPath);
  printBanner(config.assistantName ?? "Jarvis");
  const audioAdapters = loadAudioAdapters(config);
  const modelAdapter = createModelAdapter(config);
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
      case "run-skill": {
        const skill = args.skill;
        if (!skill) {
          throw new Error("Missing --skill path");
        }

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
          const content = result.text;
          obsidianConnector.createNote(filename, noteTitle, content, {
            createdBy: "new-harness-system",
            skill: result.skill.name ?? "unknown"
          });
          console.log(`Note created: ${filename}`);
        }
        break;
      }
      case "inspect-vault": {
        const notes = await obsidianConnector.listNotes();
        for (const note of notes) {
          console.log(`- ${note.path}: ${note.title}`);
        }
        break;
      }
      case "create-note": {
        const title = args.title;
        const filename = args.filename;
        const content = args.content ?? "";
        if (!title || !filename) {
          throw new Error("Missing --title or --filename");
        }
        obsidianConnector.createNote(filename, title, content, { createdBy: "new-harness-system" });
        console.log(`Note created: ${filename}`);
        break;
      }
      case "listen": {
        const file = args.file;
        if (!file) {
          throw new Error("Missing --file path for listen command");
        }
        if (!audioAdapters.stt) {
          throw new Error("STT adapter is not configured or enabled.");
        }
        const transcription = await audioAdapters.stt.transcribe({ filePath: file });
        console.log(`Transcribed text: ${transcription}`);

        const output = await interactionEngine.runInteraction({
          text: transcription,
          source: "audio"
        });
        console.log(output.text);

        if (audioAdapters.tts) {
          const audioBuffer = await audioAdapters.tts.synthesize(output.text);
          const outFile = args.out ?? "./listen-response.wav";
          fs.writeFileSync(outFile, audioBuffer);
          console.log(`Response audio saved to ${outFile}`);
        }
        break;
      }
      case "speak": {
        const text = buildPromptFromArgs(args);
        if (!text) {
          throw new Error("Missing text for speak command");
        }
        if (!audioAdapters.tts) {
          throw new Error("TTS adapter is not configured or enabled.");
        }
        const audioBuffer = await audioAdapters.tts.synthesize(text, {
          voice: args.voice,
          rate: args.rate ? Number(args.rate) : undefined
        });
        const outFile = args.out ?? "./speak-output.wav";
        fs.writeFileSync(outFile, audioBuffer);
        console.log(`TTS audio saved to ${outFile}`);
        break;
      }
      case "list-skills": {
        const skillDir = path.resolve(process.cwd(), config.skillsPath ?? "./skills");
        const files = fs.existsSync(skillDir) ? fs.readdirSync(skillDir) : [];
        console.log(`Skills in ${skillDir}:`);
        for (const file of files) {
          console.log(`- ${file}`);
        }
        break;
      }
      case "run-sandbox": {
        const skill = args.skill;
        if (!skill) {
          throw new Error("Missing --skill path for run-sandbox");
        }
        if (!config.permissions?.allowSandboxedSkills) {
          throw new Error("Sandboxed skills are disabled in config.");
        }
        await sandboxRunner.runSkill(skill, {
          sandboxRoot: args.sandboxRoot ?? `./sandbox/${path.basename(skill, path.extname(skill))}`,
          maxRuntimeMs: args.timeout ? Number(args.timeout) : 20000,
          allowedCommands: config.permissions?.allowedExternalCommands
        });
        break;
      }
      case "promote-skill": {
        const skill = args.skill;
        if (!skill) {
          throw new Error("Missing --skill path for promote-skill");
        }
        const promoted = await sandboxRunner.promoteSkill(skill);
        if (promoted) {
          console.log(`Skill promoted: ${skill}`);
        } else {
          console.log(`Promotion cancelled for skill: ${skill}`);
        }
        break;
      }
      case "do":
      case "work":
      case "agent": {
        const task = args.task ?? args.prompt ?? args.text ?? args.message;
        if (!task) {
          throw new Error("Missing --task or --prompt for workspace action");
        }
        const result = await workspaceAgent.execute(task);
        console.log(result);
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
}

main();
