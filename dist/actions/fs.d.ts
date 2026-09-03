import { HarnessAction } from "./types";
export interface FsInput {
    path: string;
    content?: string;
}
declare function isPathAllowed(targetPath: string, allowlist: string[]): boolean;
declare class FsCreateAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        path: string;
        created: boolean;
    }>;
}
declare class FsWriteAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        path: string;
        written: boolean;
    }>;
}
declare class FsAppendAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        path: string;
        appended: boolean;
    }>;
}
declare class FsReadAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        path: string;
        content: string;
        size: number;
    }>;
}
declare class FsListAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        path: string;
        entries: string[];
    }>;
}
declare class FsDeleteAction implements HarnessAction {
    name: string;
    description: string;
    run(input: unknown): Promise<{
        path: string;
        deleted: boolean;
    }>;
}
declare const fsCreateAction: FsCreateAction;
declare const fsWriteAction: FsWriteAction;
declare const fsAppendAction: FsAppendAction;
declare const fsReadAction: FsReadAction;
declare const fsListAction: FsListAction;
declare const fsDeleteAction: FsDeleteAction;
export { fsCreateAction, fsWriteAction, fsAppendAction, fsReadAction, fsListAction, fsDeleteAction };
export declare function registerFsActions(): void;
export { isPathAllowed };
//# sourceMappingURL=fs.d.ts.map