export interface ObsidianNote {
    path: string;
    title: string;
    content: string;
    metadata: Record<string, unknown>;
}
export declare class ObsidianConnector {
    private vaultPath;
    constructor(vaultPath: string);
    listNotes(): Promise<ObsidianNote[]>;
    createNote(filename: string, title: string, content: string, metadata?: Record<string, unknown>): void;
    private walkDirectory;
    parseNote(filePath: string): ObsidianNote;
}
//# sourceMappingURL=ObsidianConnector.d.ts.map