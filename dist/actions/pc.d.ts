import { HarnessAction } from "./types";
export interface PcMonitorOutput {
    cpu: {
        loadAvg: number[];
        cores: number;
        model?: string;
    };
    memory: {
        totalGb: number;
        freeGb: number;
        usedPercent: number;
    };
    disk: {
        totalGb: number;
        freeGb: number;
        usedPercent: number;
    };
    uptime: number;
    hostname: string;
    platform: string;
}
declare class PcMonitorAction implements HarnessAction {
    name: string;
    description: string;
    run(_input: unknown): Promise<PcMonitorOutput>;
}
declare class PcControlAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        status: string;
        action: string;
    }>;
}
export declare const pcMonitorAction: PcMonitorAction;
export declare const pcControlAction: PcControlAction;
export declare function registerPcActions(): void;
export {};
//# sourceMappingURL=pc.d.ts.map