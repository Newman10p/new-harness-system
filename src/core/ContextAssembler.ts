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
  DESIGN_SKILL_PATH,
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

    // 3b. Design skill — UI design principles for web interface generation/modification
    //    Loads agent/skills/design-system.md and extracts core sections for the system prompt.
    //    The full design system (1463 lines) is available for reference when needed.
    try {
      const designSkill = await fs.readFile(DESIGN_SKILL_PATH, "utf-8");
      if (designSkill.trim()) {
        // Extract key sections to keep system prompt focused but comprehensive
        const designSections = designSkill.split(/^## /m);
        const coreSections = designSections.filter(s =>
          s.startsWith("Philosophy") ||
          s.startsWith("Layout System") ||
          s.startsWith("Typography") ||
          s.startsWith("Color System") ||
          s.startsWith("Accessibility") ||
          s.startsWith("Common Mistakes") ||
          s.startsWith("Pre-Flight Checklist")
        );
        if (coreSections.length > 0) {
          const designSummary = "## UI Design Skill (Premium Frontend Architect)\n\n" +
            "When generating, evaluating, or modifying any web UI, follow these principles:\n" +
            "- Use an 8px spacing grid system with consistent design tokens\n" +
            "- Establish clear visual hierarchy: anchor (primary action), supporting (secondary), ambient (context)\n" +
            "- WCAG 2.2 AA accessibility: 4.5:1 contrast for normal text, 3:1 for large text, keyboard navigation, semantic HTML, `:focus-visible`\n" +
            "- Responsive-first: mobile → tablet → desktop with breakpoints at 640/768/1024/1280px\n" +
            "- Subtle, purposeful motion (100-300ms micro-interactions, 200-400ms transitions)\n" +
            "- Respect `prefers-reduced-motion` for all animations\n" +
            "- shadcn/ui conventions with `cva` variants, Radix UI primitives, Tailwind CSS utility-first styling\n" +
            "- CSS custom properties for theming (`--background`, `--foreground`, `--primary`, `--muted`, `--accent` etc.)\n" +
            "- Generative UI: AI can generate interfaces on-the-fly via structured output → component map pattern\n" +
            "- Empty states, onboarding flows, and loading skeletons should feel intentional, not broken\n" +
            "- Charts, timelines, kanban boards: use structured data patterns, not hardcoded visuals\n" +
            "\nFor the complete design system with component patterns, dashboard layouts, form design,\n" +
            "motion specs, and pre-flight checklist, reference: `agent/skills/design-system.md`\n";
          sections.push(designSummary);
        }
      }
    } catch {
      // Design skill file not yet available — non-fatal
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

    // Web search engine configuration
    const searchEngine = process.env.SEARCH_ENGINE || "duckduckgo";
    const hasTavily = !!process.env.TAVILY_API_KEY;
    const hasSearXNG = !!process.env.SEARXNG_URL;
    const searchCapabilities: string[] = [searchEngine];
    if (hasTavily && searchEngine !== "tavily") searchCapabilities.push("tavily");
    if (hasSearXNG && searchEngine !== "searxng") searchCapabilities.push("searxng");
    // DuckDuckGo is always available as fallback
    if (searchEngine !== "duckduckgo") searchCapabilities.push("duckduckgo (fallback)");

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
      `**Web Search**: Available via \`${searchCapabilities.join(" + ")}\` engine(s).\n` +
      `Use \`web-search\` to look up current information, and \`web-scrape\` to read web page content.\n` +
      `You have full internet access — use it whenever the user asks about current events, recent data,\n` +
      `documentation, news, weather, or anything that may have changed after your training cutoff.\n\n` +
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
