import fs from "node:fs";
import path from "node:path";
import { SkillFeedbackStore } from "./skillFeedback";
import { ModelAdapter } from "../harness/ModelAdapter";

export interface AdaptationProposal {
  skillId: string;
  description: string;
  changes: string[];
  sandboxPath: string;
  approved: boolean;
}

/**
 * Analyzes skill feedback and proposes adaptations.
 * Makes self-adaptation conversational via natural language proposals.
 */
export class SkillAdaptationEngine {
  private proposals: AdaptationProposal[] = [];
  private agentDir: string;

  constructor(
    private feedbackStore: SkillFeedbackStore,
    private modelAdapter: ModelAdapter,
    agentDir?: string
  ) {
    this.agentDir = path.resolve(agentDir ?? "./agent/skills");
    fs.mkdirSync(this.agentDir, { recursive: true });
  }

  /**
   * Analyze skill feedback and generate adaptation proposals.
   */
  async analyze(skillId: string): Promise<AdaptationProposal | null> {
    const failureRate = this.feedbackStore.getFailureRate(skillId);
    const corrections = this.feedbackStore.getFrequentCorrections(skillId);

    if (failureRate < 0.2 && corrections.size === 0) {
      return null; // No adaptation needed
    }

    const mdPath = path.join(this.agentDir, `${skillId}.md`);
    const existingContent = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : `# ${skillId}\n\nNo diary yet.\n`;

    const prompt = `You are analyzing skill "${skillId}" for the Jarvis harness.
Failure rate: ${(failureRate * 100).toFixed(0)}%
Frequent corrections: ${Array.from(corrections.entries()).map(([c, n]) => `${c} (${n}x)`).join(", ") || "none"}

Current skill diary:
${existingContent}

Propose specific improvements to this skill's behavior. Return a JSON object:
{
  "description": "brief summary of proposed changes",
  "changes": ["change 1", "change 2", ...]
}`;

    const result = await this.modelAdapter.generate({ prompt, maxTokens: 1024, temperature: 0.3 });
    const text = result.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const sandboxPath = path.join(this.agentDir, `sandbox-${skillId}.md`);

      const proposal: AdaptationProposal = {
        skillId,
        description: parsed.description ?? "Improve skill behavior",
        changes: Array.isArray(parsed.changes) ? parsed.changes : [],
        sandboxPath,
        approved: false
      };

      // Write sandbox copy
      const sandboxContent = `${existingContent}\n\n## Proposed Changes (${new Date().toISOString().slice(0, 10)})\n${proposal.changes.map((c: string) => `- ${c}`).join("\n")}\n`;
      fs.writeFileSync(sandboxPath, sandboxContent, "utf8");

      this.proposals.push(proposal);
      return proposal;
    } catch {
      return null;
    }
  }

  /**
   * Get all pending proposals.
   */
  getPendingProposals(): AdaptationProposal[] {
    return this.proposals.filter((p) => !p.approved);
  }

  /**
   * Approve a proposal and merge changes.
   */
  approve(proposal: AdaptationProposal): void {
    const mdPath = path.join(this.agentDir, `${proposal.skillId}.md`);
    if (fs.existsSync(proposal.sandboxPath)) {
      fs.copyFileSync(proposal.sandboxPath, mdPath);
    }
    proposal.approved = true;
  }

  /**
   * Reject a proposal.
   */
  reject(proposal: AdaptationProposal): void {
    if (fs.existsSync(proposal.sandboxPath)) {
      fs.unlinkSync(proposal.sandboxPath);
    }
    proposal.approved = false;
  }

  /**
   * Generate a conversational adaptation message.
   */
  async generateProposalMessage(proposal: AdaptationProposal): Promise<string> {
    const prompt = `You are Jarvis, a helpful AI operator. You've analyzed your "${proposal.skillId}" skill and found it needs improvement.

Proposed changes:
${proposal.changes.map((c) => `- ${c}`).join("\n")}

Write a brief, conversational message to the user explaining what you noticed and asking if they'd like to apply these changes. Be friendly and specific.`;

    const result = await this.modelAdapter.generate({ prompt, maxTokens: 512, temperature: 0.7 });
    return result.text.trim();
  }
}