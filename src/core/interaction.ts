import { ModelAdapter } from "../harness/ModelAdapter";
import { SkillRunner } from "../harness/SkillRunner";
import { ObsidianConnector } from "../harness/ObsidianConnector";

export interface InteractionInput {
  text: string;
  source: "cli" | "audio" | "note" | "api";
  contextId?: string;
  skillPath?: string;
}

export interface InteractionOutput {
  text: string;
  meta?: { agent?: string; skills?: string[] };
  contextId?: string;
}

export class InteractionEngine {
  constructor(
    private modelAdapter: ModelAdapter,
    private skillRunner: SkillRunner,
    private obsidianConnector: ObsidianConnector
  ) {}

  async runInteraction(input: InteractionInput): Promise<InteractionOutput> {
    if (input.skillPath) {
      const result = await this.skillRunner.runSkill(input.skillPath, { input: input.text });
      return {
        text: result.text,
        meta: { agent: "Jarvis", skills: [result.skill.name ?? input.skillPath] },
        contextId: input.contextId
      };
    }

    const modelResult = await this.modelAdapter.generate({ prompt: input.text, maxTokens: 512 });
    return {
      text: modelResult.text.trim(),
      meta: { agent: "Jarvis", skills: [] },
      contextId: input.contextId
    };
  }

  async runNoteInteraction(notePath: string): Promise<InteractionOutput> {
    const note = this.obsidianConnector.parseNote(notePath);
    const prompt = `Summarize this note for action items:\n\n${note.content}`;
    const result = await this.modelAdapter.generate({ prompt, maxTokens: 512 });
    return {
      text: result.text.trim(),
      meta: { agent: "Jarvis", skills: ["note-summarizer"] }
    };
  }
}
