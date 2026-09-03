import { HarnessAction } from "./types";
export interface SecurityAuditInput {
    code: string;
    language?: string;
}
declare class SecurityAuditAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        issues: string[];
        summary: string;
    }>;
}
declare class SecurityDiagnosticsAction implements HarnessAction {
    name: string;
    description: string;
    run(_input: unknown): Promise<{
        diagnostics: string[];
    }>;
}
export declare const securityAuditAction: SecurityAuditAction;
export declare const securityDiagnosticsAction: SecurityDiagnosticsAction;
export declare function registerSecurityActions(): void;
export {};
//# sourceMappingURL=security.d.ts.map