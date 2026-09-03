import { HarnessAction, ActionMeta } from "./types";
import { ModelAdapter } from "../harness/ModelAdapter";
export interface CodeGenerateInput {
    language: string;
    brief: string;
    filePath?: string;
    modelAdapter?: ModelAdapter;
}
export interface CodeGenerateOutput {
    code: string;
    language: string;
    filePath?: string;
}
declare class CodeGenerateAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<CodeGenerateOutput>;
    private extractCode;
}
export declare const codeGenerateAction: CodeGenerateAction;
export declare const codeGenerateMeta: ActionMeta;
export {};
//# sourceMappingURL=code.generate.d.ts.map