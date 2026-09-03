"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionEngine = void 0;
class InteractionEngine {
    modelAdapter;
    skillRunner;
    obsidianConnector;
    constructor(modelAdapter, skillRunner, obsidianConnector) {
        this.modelAdapter = modelAdapter;
        this.skillRunner = skillRunner;
        this.obsidianConnector = obsidianConnector;
    }
    async runInteraction(input) {
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
    async runNoteInteraction(notePath) {
        const note = this.obsidianConnector.parseNote(notePath);
        const prompt = `Summarize this note for action items:\n\n${note.content}`;
        const result = await this.modelAdapter.generate({ prompt, maxTokens: 512 });
        return {
            text: result.text.trim(),
            meta: { agent: "Jarvis", skills: ["note-summarizer"] }
        };
    }
}
exports.InteractionEngine = InteractionEngine;
//# sourceMappingURL=interaction.js.map