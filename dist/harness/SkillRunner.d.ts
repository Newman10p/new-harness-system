import { ModelAdapter } from "./ModelAdapter";
import { HarnessConfig } from "../config";
export interface SkillDefinition {
    id?: string;
    name?: string;
    description?: string;
    prompt?: string;
    model?: string;
    script?: string;
    inputs?: Record<string, string>;
    outputNote?: string;
    noteTitle?: string;
    sandbox?: boolean;
    sandbox_root?: string;
    self_improvement?: boolean;
}
export interface SkillRunResult {
    text: string;
    skill: SkillDefinition;
    noteTitle?: string;
}
export declare class SkillRunner {
    private modelAdapter;
    private config;
    constructor(modelAdapter: ModelAdapter, config: HarnessConfig);
    loadSkill(skillPath: string): Promise<SkillDefinition>;
    runSkill(skillPath: string, values?: Record<string, string>): Promise<SkillRunResult>;
    private interpolatePrompt;
    private runScriptSkill;
}
//# sourceMappingURL=SkillRunner.d.ts.map