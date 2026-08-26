// ─── M.A.I. Context Assembler ───────────────────────────────────────────────
// Hermes-style 3-Tier Prompt Assembly:
//
//   STABLE   → identity + tool guidance + skills + design system (cached, rarely changes)
//   CONTEXT  → project context files + AGENTS.md + workspace instructions
//   VOLATILE → memory snapshot + user profile + timestamp + session info + context payload
//
// The ordering matters: stable → context → volatile.
// Skills are part of stable (cached). Memory/profile are volatile (fresh each call).

import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import {
  IDENTITY_PATH,
  POLICY_PATH,
  TOOLS_CATALOG_PATH,
  DESIGN_SKILL_PATH,
  CONTEXT_PATH,
  INBOX_PATH,
  LONG_TERM_MEMORY_PATH,
  USER_PROFILE_PATH,
  SKILLS_DIR,
  PROJECT_ROOT,
} from "./constants.js";
import type { PolicyConfig, AgentState } from "../types/index.js";

// Lazy-load UserModel
const _require = createRequire(__filename);
let _UserModel: { new (): { getProfileSummary: () => Promise<string | null> } } | null = null;
try {
  const mod = _require("./UserModel.js");
  _UserModel = mod.UserModel ?? mod.default ?? null;
} catch { /* not yet created */ }

// ─── Prompt Cache (Hermes pattern) ───────────────────────────────────────────
// The stable tier is assembled once and cached until source files change.
let _stableCache: { hash: string; prompt: string } | null = null;
let _stableCacheTimestamp = 0;
const STABLE_CACHE_TTL_MS = 60_000; // Re-check file hashes every 60s

async function computeStableHash(): Promise<string> {
  const files = [IDENTITY_PATH, POLICY_PATH, TOOLS_CATALOG_PATH, DESIGN_SKILL_PATH];
  const hashes: string[] = [];
  for (const f of files) {
    try {
      const stat = await fs.stat(f);
      hashes.push(`${f}:${stat.mtimeMs}:${stat.size}`);
    } catch {
      hashes.push(`${f}:missing`);
    }
  }
  // Also hash the skills directory listing
  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const skillFiles = entries.filter(e => e.isFile() && (e.name.endsWith('.yaml') || e.name.endsWith('.yml'))).map(e => e.name).sort();
    hashes.push(`skills:${skillFiles.join(',')}`);
  } catch { hashes.push("skills:missing"); }
  
  return crypto.createHash('md5').update(hashes.join('|')).digest('hex');
}

// ─── Context Assembler ───────────────────────────────────────────────────────
export class ContextAssembler {
  /**
   * Build the complete system prompt using Hermes 3-tier assembly.
   * 
   * Tier 1 (STABLE):   Identity + policy + tools + skills + design system
   * Tier 2 (CONTEXT):  Project context files (AGENTS.md, .hermes.md, etc.) + dynamic policy
   * Tier 3 (VOLATILE): Memory snapshot + user profile + timestamp + runtime env + session
   * 
   * The stable tier is cached and only rebuilt when source files change.
   */
  static async assembleSystemPrompt(
    policyConfig?: PolicyConfig,
    agentState?: AgentState,
    options?: { skipStable?: boolean; systemMessageOverride?: string }
  ): Promise<string> {
    const tiers: string[] = [];

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 1: STABLE — Cached, changes only when source files change
    // ══════════════════════════════════════════════════════════════════════════
    if (!options?.skipStable) {
      const stablePrompt = await this.assembleStableTier(policyConfig);
      if (stablePrompt) tiers.push(stablePrompt);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 2: CONTEXT — Project-level context (semi-stable)
    // ══════════════════════════════════════════════════════════════════════════
    const contextPrompt = await this.assembleContextTier(options?.systemMessageOverride);
    if (contextPrompt) tiers.push(contextPrompt);

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 3: VOLATILE — Fresh every call (memory, profile, timestamp)
    // ══════════════════════════════════════════════════════════════════════════
    const volatilePrompt = await this.assembleVolatileTier(agentState, policyConfig);
    if (volatilePrompt) tiers.push(volatilePrompt);

    return tiers.join("\n\n──────────────────────────────────────────────────────────────\n\n");
  }

  /**
   * TIER 1: STABLE — Identity + tool guidance + skills + design system.
   * This tier is cached and only rebuilt when source files change.
   */
  private static async assembleStableTier(policyConfig?: PolicyConfig): Promise<string> {
    const now = Date.now();
    const currentHash = await computeStableHash();

    // Return cached version if still valid
    if (
      _stableCache &&
      _stableCache.hash === currentHash &&
      (now - _stableCacheTimestamp) < STABLE_CACHE_TTL_MS
    ) {
      return _stableCache.prompt;
    }

    const sections: string[] = [];

    // 1. Identity — who the agent is
    try {
      const identity = await fs.readFile(IDENTITY_PATH, "utf-8");
      const parsed = matter(identity);
      sections.push(parsed.content);
    } catch {
      sections.push("You are M.A.I. (Mai), a helpful AI assistant. Be concise, direct, and action-oriented.");
    }

    // 2. Policy body — rules and objectives (not the YAML frontmatter)
    try {
      const policy = await fs.readFile(POLICY_PATH, "utf-8");
      const parsed = matter(policy);
      if (parsed.content.trim()) {
        sections.push(parsed.content);
      }
    } catch {
      // No policy file — PolicyEngine has fallback
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

    // 4. Skills index — scan available YAML skills (Hermes skills hub pattern)
    try {
      const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
      const skillFiles = entries.filter(e => 
        e.isFile() && (e.name.endsWith('.yaml') || e.name.endsWith('.yml'))
      ).map(e => e.name.replace(/\.(yaml|yml)$/, ''));
      
      if (skillFiles.length > 0) {
        let skillsBlock = "## Available Skills\n\n" +
          "You have access to skills that provide specialized workflows. " +
          "Use the `run-skill` action to invoke them.\n\n" +
          "<available_skills>\n";
        for (const name of skillFiles) {
          skillsBlock += `- ${name}\n`;
        }
        skillsBlock += "</available_skills>\n";
        sections.push(skillsBlock);
      }
    } catch { /* No skills dir */ }

    // 5. Design skill — UI design principles (summarized)
    try {
      const designSkill = await fs.readFile(DESIGN_SKILL_PATH, "utf-8");
      if (designSkill.trim()) {
        sections.push(
          "## UI Design Skill (Premium Frontend Architect)\n\n" +
          "When generating, evaluating, or modifying any web UI, follow these principles:\n" +
          "- 8px spacing grid, clear visual hierarchy, WCAG 2.2 AA accessibility\n" +
          "- Responsive-first: mobile → tablet → desktop (640/768/1024/1280px)\n" +
          "- Subtle motion (100-300ms), respect prefers-reduced-motion\n" +
          "- shadcn/ui conventions, Tailwind CSS utility-first, CSS custom properties\n" +
          "- Empty states and loading skeletons should feel intentional\n" +
          "\nFull reference: `agent/skills/design-system.md`"
        );
      }
    } catch { /* non-fatal */ }

    const prompt = sections.join("\n\n---\n\n");

    // Cache it
    _stableCache = { hash: currentHash, prompt };
    _stableCacheTimestamp = now;

    return prompt;
  }

  /**
   * TIER 2: CONTEXT — Project context files + dynamic policy reminders.
   * This tier captures project-specific instructions that don't change per-turn.
   */
  private static async assembleContextTier(systemMessageOverride?: string): Promise<string> {
    const sections: string[] = [];

    // 1. Custom system message override (if provided)
    if (systemMessageOverride) {
      sections.push(systemMessageOverride);
    }

    // 2. Project context files (Hermes: .hermes.md, AGENTS.md, CLAUDE.md, .cursorrules)
    const contextFiles = [
      { path: path.join(PROJECT_ROOT, "AGENTS.md"), label: "AGENTS.md" },
      { path: path.join(PROJECT_ROOT, ".hermes.md"), label: ".hermes.md" },
      { path: path.join(PROJECT_ROOT, "CLAUDE.md"), label: "CLAUDE.md" },
      { path: path.join(PROJECT_ROOT, ".cursorrules"), label: ".cursorrules" },
    ];

    for (const { path: filePath, label } of contextFiles) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        if (content.trim()) {
          sections.push(`## Project Context: ${label}\n\n${content.trim()}`);
        }
      } catch { /* file doesn't exist — skip */ }
    }

    // 3. Dynamic policy reminder
    // (Read from the policyConfig passed in, which comes from PolicyEngine)
    // This is handled in volatile tier now with fresh policy data.

    return sections.join("\n\n---\n\n");
  }

  /**
   * TIER 3: VOLATILE — Fresh every turn.
   * Memory snapshot, user profile, timestamp, runtime env, session state.
   * This data changes frequently and is never cached.
   */
  private static async assembleVolatileTier(
    agentState?: AgentState,
    policyConfig?: PolicyConfig
  ): Promise<string> {
    const sections: string[] = [];

    // 1. Long-term memory snapshot (Hermes: frozen MEMORY.md block)
    try {
      const memory = await fs.readFile(LONG_TERM_MEMORY_PATH, "utf-8");
      if (memory.trim()) {
        // Keep memory compact — truncate if too large
        const maxMemoryChars = 2000;
        const trimmed = memory.length > maxMemoryChars
          ? memory.slice(0, maxMemoryChars) + "\n... [truncated, use `recall` for full memory]"
          : memory;
        sections.push("## Persistent Memory\n\n" + trimmed.trim());
      }
    } catch { /* No long-term memory yet */ }

    // 2. User profile (Hermes: frozen USER profile snapshot)
    if (_UserModel) {
      try {
        const userModel = new _UserModel();
        const profileSummary = await userModel.getProfileSummary();
        if (profileSummary) {
          sections.push("## User Profile\n\n" + profileSummary);
        }
      } catch { /* non-fatal */ }
    }

    // 3. Dynamic policy constraints (fresh each turn from PolicyEngine)
    if (policyConfig) {
      const reminders: string[] = [];
      if (policyConfig.deny_commands && policyConfig.deny_commands.length > 0) {
        reminders.push(`BLOCKED: ${policyConfig.deny_commands.join(", ")}`);
      }
      if (policyConfig.allow_network && policyConfig.allow_network.length > 0) {
        reminders.push(`NETWORK ALLOWED: ${policyConfig.allow_network.join(", ")}`);
      } else if (policyConfig.allow_network === undefined || policyConfig.allow_network.length === 0) {
        reminders.push("NETWORK: denied by default");
      }
      if (policyConfig.require_approval && policyConfig.require_approval.length > 0) {
        reminders.push(`REQUIRES APPROVAL: ${policyConfig.require_approval.join(", ")}`);
      }
      if (reminders.length > 0) {
        sections.push("## Active Policy Constraints\n\n" + reminders.join("\n"));
      }
    }

    // 4. Runtime environment (always fresh)
    const homeDir = os.homedir();
    const platform = os.platform();
    const arch = os.arch();
    const hostname = os.hostname();
    const cwd = process.cwd();
    const shell = process.env.SHELL || process.env.COMSPEC || "unknown";
    const platformName = platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : "Linux";
    const desktopDir = path.join(homeDir, "Desktop");
    const downloadsDir = path.join(homeDir, "Downloads");
    const tmpDir = os.tmpdir();

    // Web search capabilities
    const searchEngine = process.env.SEARCH_ENGINE || "duckduckgo";
    const hasTavily = !!process.env.TAVILY_API_KEY;
    const hasSearXNG = !!process.env.SEARXNG_URL;
    const searchCaps: string[] = [searchEngine];
    if (hasTavily && searchEngine !== "tavily") searchCaps.push("tavily");
    if (hasSearXNG && searchEngine !== "searxng") searchCaps.push("searxng");
    if (searchEngine !== "duckduckgo") searchCaps.push("duckduckgo (fallback)");

    sections.push(
      `## Runtime Environment\n\n` +
      `- **OS**: ${platformName} (${platform} ${arch})\n` +
      `- **Hostname**: ${hostname}\n` +
      `- **Home**: ${homeDir}\n` +
      `- **CWD**: ${cwd}\n` +
      `- **Shell**: ${shell}\n` +
      `- **Temp**: ${tmpDir}\n\n` +
      `**Paths**: Desktop \`${desktopDir}\` | Downloads \`${downloadsDir}\`\n\n` +
      `**Web Search**: ${searchCaps.join(" + ")}. Use web-search for current info.\n` +
      `Always use absolute paths starting with \`${homeDir}\` or \`${cwd}\`.\n` +
      `"The desktop" = \`${desktopDir}\`. Never use relative paths like \"./desktop\".`
    );

    // 5. Timestamp + Session info (Hermes pattern — always at the end)
    const now = new Date();
    const sessionInfo = agentState
      ? `Session: ${agentState.sessionId} | Interactions: ${agentState.totalActionsExecuted} | Compressions: ${agentState.compressionCount}`
      : "Session: new";
    
    sections.push(
      `Current time: ${now.toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})\n` +
      sessionInfo
    );

    // 6. Context pressure warning (Hermes: inject when approaching limits)
    if (agentState) {
      const tokenEstimate = this.estimateTokens(agentState.messages);
      const maxContext = this.estimateMaxContext();
      const usagePercent = (tokenEstimate / maxContext) * 100;
      
      if (usagePercent > 75) {
        sections.push(
          `⚠️ **Context pressure: ${Math.round(usagePercent)}% used** (${tokenEstimate}/${maxContext} tokens). ` +
          `Keep responses concise. Use actions rather than long explanations. ` +
          `The system will compress context if it exceeds 90%.`
        );
      }
    }

    return sections.join("\n\n---\n\n");
  }

  /**
   * Build the user-context payload from inbox + memory files.
   * Injected into the user message, not the system prompt (Hermes pattern).
   */
  static async assembleContextPayload(): Promise<string> {
    const sections: string[] = [];

    // 1. Inbox — recent events (file watches, errors, notifications)
    try {
      const inbox = await fs.readFile(INBOX_PATH, "utf-8");
      if (inbox.trim()) {
        // Keep inbox compact — only last 30 lines
        const lines = inbox.trim().split("\n");
        const recent = lines.slice(-30);
        sections.push("## Inbox (Recent Events)\n\n" + recent.join("\n"));
      }
    } catch { /* No inbox yet */ }

    // 2. Context — accumulated working context
    try {
      const context = await fs.readFile(CONTEXT_PATH, "utf-8");
      if (context.trim()) {
        // Keep context compact
        const maxCtx = 1500;
        const trimmed = context.length > maxCtx
          ? context.slice(0, maxCtx) + "\n... [truncated]"
          : context;
        sections.push("## Working Context\n\n" + trimmed.trim());
      }
    } catch { /* No context yet */ }

    return sections.join("\n\n---\n\n");
  }

  // ─── Token Estimation ────────────────────────────────────────────────────
  /** Rough token estimation: ~4 chars per token for English, ~2 for CJK. */
  static estimateTokens(messages: Array<{ content: string }>): number {
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += msg.content.length;
    }
    // Conservative: 3.5 chars per token average (mix of English and code)
    return Math.ceil(totalChars / 3.5);
  }

  /** Estimate max context from model config. */
  static estimateMaxContext(): number {
    const model = process.env.LLM_MODEL || "llama3.2";
    // Default context windows for common models
    const contextWindows: Record<string, number> = {
      "llama3.2": 128000,
      "llama3.1": 128000,
      "llama3": 8192,
      "llama2": 4096,
      "mistral": 32768,
      "codellama": 16384,
      "qwen2.5": 32768,
      "gemma2": 8192,
      "phi3": 128000,
      "deepseek-r1": 65536,
      "deepseek-coder": 65536,
    };
    // Find matching model
    for (const [key, ctx] of Object.entries(contextWindows)) {
      if (model.toLowerCase().includes(key)) return ctx;
    }
    // Default for unknown models
    return 8192;
  }

  // ─── Context Compression (Hermes pattern) ───────────────────────────────
  /**
   * Compress middle conversation turns when context exceeds threshold.
   * Keeps the first 2 and last 2 turns intact, summarizes the middle.
   * Returns the compression result or null if no compression was needed.
   */
  static async compressIfNeeded(
    messages: Array<{ role: string; content: string }>,
    threshold = 0.85
  ): Promise<{ messages: Array<{ role: string; content: string }>; compressed: boolean; turnsRemoved: number } | null> {
    const tokenEstimate = this.estimateTokens(messages);
    const maxContext = this.estimateMaxContext();
    const usageRatio = tokenEstimate / maxContext;

    if (usageRatio < threshold) return null;

    // Need compression — keep first 2 user/assistant pairs + last 2 pairs
    const nonSystem = messages.filter(m => m.role !== "system");
    const systemMsgs = messages.filter(m => m.role === "system");

    if (nonSystem.length <= 8) return null; // Too few turns to compress

    const keepFirst = 4; // First 2 exchanges
    const keepLast = 4;  // Last 2 exchanges
    const middle = nonSystem.slice(keepFirst, nonSystem.length - keepLast);

    if (middle.length === 0) return null;

    // Build a summary of the middle turns
    const summaryParts: string[] = [];
    for (const msg of middle) {
      const role = msg.role === "user" ? "User" : "M.A.I.";
      const preview = msg.content.slice(0, 150).replace(/\n/g, " ");
      summaryParts.push(`[${role}]: ${preview}${msg.content.length > 150 ? "..." : ""}`);
    }

    const summaryMsg: { role: string; content: string } = {
      role: "assistant",
      content: `[Earlier conversation compressed — ${middle.length} turns summarized]\n\n` +
        summaryParts.join("\n") +
        "\n\n[End of compressed section. Current context continues below.]"
    };

    const compressed = [
      ...systemMsgs,
      ...nonSystem.slice(0, keepFirst),
      summaryMsg,
      ...nonSystem.slice(nonSystem.length - keepLast),
    ];

    return {
      messages: compressed,
      compressed: true,
      turnsRemoved: middle.length,
    };
  }

  /** Invalidate the stable cache (e.g., after file edits). */
  static invalidateStableCache(): void {
    _stableCache = null;
    _stableCacheTimestamp = 0;
  }
}
