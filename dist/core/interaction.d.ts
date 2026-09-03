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
    meta?: {
        agent?: string;
        skills?: string[];
    };
    contextId?: string;
}
export declare class InteractionEngine {
    private modelAdapter;
    private skillRunner;
    private obsidianConnector;
    constructor(modelAdapter: ModelAdapter, skillRunner: SkillRunner, obsidianConnector: ObsidianConnector);
    runInteraction(input: InteractionInput): Promise<InteractionOutput>;
    runNoteInteraction(notePath: string): Promise<InteractionOutput>;
}
//# sourceMappingURL=interaction.d.ts.map