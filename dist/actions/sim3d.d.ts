import { HarnessAction } from "./types";
export interface Sim3dInput {
    scenario: string;
    parameters?: Record<string, unknown>;
}
export interface Sim3dOutput {
    summary: string;
    details?: string;
    success: boolean;
}
declare class Sim3dRunAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<Sim3dOutput>;
}
export declare const sim3dRunAction: Sim3dRunAction;
export declare function registerSim3dActions(): void;
export {};
//# sourceMappingURL=sim3d.d.ts.map