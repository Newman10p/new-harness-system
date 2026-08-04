// ─── M.A.I. Context Assembler ───────────────────────────────────────────────
// Reads markdown "brain files" and assembles the system prompt + context
// payload that get injected into the LLM conversation.
//
// Architecture: All business logic (identity, policy, tools) lives in .md
// files, not hardcoded. The assembler just concatenates them with ───
// separators for the LLM to parse.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import { createRequire } from "node:module";
import {
  IDENTITY_PATH,
  POLICY_PATH,
  TOOLS_CATALOG_PATH,
  CONTEXT_PATH,
  INBOX_PATH,
} from "./constants.js";
import type { PolicyConfig } from "../types/index.js";

// Lazy-load UserModel (file may not exist yet)
const _require = createRequire(import.meta.url);
let _UserModel: { new (): { getProfileSummary: () => Promise<string | null> } } | null = null;
try {
  const mod = _require("./UserModel.js");
  _UserModel = mod.UserModel ?? mod.default ?? null;
} catch { /* not yet created */ }

export class ContextAssembler {
  /**
   * Build the system prompt from identity + policy body + tools catalog.
   * Policy frontmatter (YAML rules) is NOT included — only the human-readable
   * policy body, so the LLM understands intent, not enforcement mechanics.
   */
  static async assembleSystemPrompt(
    policyConfig?: PolicyConfig
  ): Promise<string> {
    const sections: string[] = [];

    // 1. Identity — who the agent is
    try {
      const identity = await fs.readFile(IDENTITY_PATH, "utf-8");
      const parsed = matter(identity);
      sections.push(parsed.content);
    } catch {
      sections.push("You are M.A.I., a helpful AI assistant.");
    }

    // 2. Policy body — rules and objectives (not the YAML frontmatter)
    try {
      const policy = await fs.readFile(POLICY_PATH, "utf-8");
      const parsed = matter(policy);
      if (parsed.content.trim()) {
        sections.push(parsed.content);
      }
    } catch {
      // No policy file — that's okay, PolicyEngine has fallback
    }

    // 3. Tools catalog — what actions are available
    try {
      const catalog = await fs.readFile(TOOLS_CATALOG_PATH, "utf-8");
      const parsed = matter(catalog);
      if (parsed.content.trim()) {
        sections.push(parsed.content);
      }
    } catch {
      // No catalog — actions will still be registered
    }

    // 4. Dynamic policy reminder — inject current deny/allow/approval rules
    //    so the LLM is aware of constraints even if it hasn't read the files
    if (policyConfig) {
      const reminders: string[] = [];
      if (policyConfig.deny_commands && policyConfig.deny_commands.length > 0) {
        reminders.push(
          `BLOCKED COMMANDS (never attempt): ${policyConfig.deny_commands.join(", ")}`
        );
      }
      if (
        policyConfig.allow_network &&
        policyConfig.allow_network.length > 0
      ) {
        reminders.push(
          `ALLOWED NETWORK HOSTS: ${policyConfig.allow_network.join(", ")}`
        );
      } else if (policyConfig.allow_network === undefined) {
        reminders.push("NETWORK ACCESS: denied by default (empty allow_network)");
      }
      if (
        policyConfig.require_approval &&
        policyConfig.require_approval.length > 0
      ) {
        reminders.push(
          `APPROVAL REQUIRED: ${policyConfig.require_approval.join(", ")}`
        );
      }
      if (reminders.length > 0) {
        sections.push(
          "## Active Policy Constraints\n\n" + reminders.join("\n")
        );
      }
    }

    // 5. Runtime environment — platform, home dir, cwd, shell info
    const homeDir = os.homedir();
    const platform = os.platform();
    const arch = os.arch();
    const hostname = os.hostname();
    const cwd = process.cwd();
    const shell = process.env.SHELL || process.env.COMSPEC || "unknown";
    const desktopDir = path.join(homeDir, platform === "win32" ? "Desktop" : "Desktop");
    const downloadsDir = path.join(homeDir, platform === "win32" ? "Downloads" : "Downloads");
    const documentsDir = path.join(homeDir, platform === "win32" ? "Documents" : "Documents");
    const tmpDir = os.tmpdir();
    const platformName = platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : "Linux";

    sections.push(
      `## Runtime Environment\n\n` +
      `- **OS**: ${platformName} (${platform} ${arch})\n` +
      `- **Hostname**: ${hostname}\n` +
      `- **User Home**: ${homeDir}\n` +
      `- **Working Directory**: ${cwd}\n` +
      `- **Shell**: ${shell}\n` +
      `- **Temp**: ${tmpDir}\n\n` +
      `**Common Paths** (always use these absolute paths):\n` +
      `- Desktop: \`${desktopDir}\`\n` +
      `- Downloads: \`${downloadsDir}\`\n` +
      `- Documents: \`${documentsDir}\`\n` +
      `- Home: \`${homeDir}\`\n\n` +
      `**Important**: When the user refers to "the desktop", "my desktop", "put it on the desktop", etc., use the path \`${desktopDir}\`. ` +
      `Always use absolute paths starting with \`${homeDir}\` or \`${cwd}\` for file operations. ` +
      `Do NOT create relative directories like "./desktop" — always use the real absolute path.`
    );

    // 6. User profile (learned preferences from UserModel)
    if (_UserModel) {
      try {
        const userModel = new _UserModel();
        await userModel.init();
        const profileSummary = userModel.getProfileSummary();
        if (profileSummary) {
          sections.push("## User Profile (Learned)\n\n" + profileSummary);
        }
      } catch { /* non-fatal */ }
    }

    return sections.join("\n\n---\n\n");
  }

  /**
   * Build the user-context payload from inbox + memory files.
   * These provide the LLM with real-time state: recent events,
   * user notes, accumulated context from prior loops.
   */
  static async assembleContextPayload(): Promise<string> {
    const sections: string[] = [];

    // 1. Inbox — recent events (file watches, errors, notifications)
    try {
      const inbox = await fs.readFile(INBOX_PATH, "utf-8");
      if (inbox.trim()) {
        sections.push("## Inbox (Recent Events)\n\n" + inbox.trim());
      }
    } catch {
      // No inbox yet
    }

    // 2. Context — long-term memory / accumulated context
    try {
      const context = await fs.readFile(CONTEXT_PATH, "utf-8");
      if (context.trim()) {
        sections.push("## Memory (Accumulated Context)\n\n" + context.trim());
      }
    } catch {
      // No context yet
    }

    return sections.join("\n\n---\n\n");
  }
}
