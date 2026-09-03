export interface VaultNote {
    path: string;
    title: string;
    tags: string[];
    summary?: string;
}
/**
 * Mini Obsidian-based memory layer. Reads/writes Markdown notes in a vault.
 */
export declare class MiniObsidianMemory {
    private vaultPath;
    private memoryFolder;
    constructor(vaultPath: string, memoryFolder?: string);
    private getMemoryDir;
    indexVault(): Promise<VaultNote[]>;
    private walkDir;
    private parseNote;
    private extractTitle;
    private extractTags;
    search(query: string): Promise<VaultNote[]>;
    read(relativePath: string): Promise<string>;
    write(relativePath: string, content: string): Promise<void>;
    writeMemory(title: string, content: string, tags?: string[]): Promise<string>;
}
//# sourceMappingURL=MiniObsidianMemory.d.ts.map