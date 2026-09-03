import { HarnessAction } from "./types";
export interface TerminalInput {
    command: string;
    cwd?: string;
    timeout?: number;
}
export interface TerminalOutput {
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
}
declare class TerminalExecAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<TerminalOutput>;
}
export declare const terminalExecAction: TerminalExecAction;
export declare function registerTerminalActions(): void;
export {};
//# sourceMappingURL=terminal.d.ts.map