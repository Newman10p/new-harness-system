import fs from "node:fs/promises";
import path from "node:path";

export interface VaultNote {
  path: string;
  title: string;
  tags: string[];
  summary?: string;
}

/**
 * Mini Obsidian-based memory layer. Reads/writes Markdown notes in a vault.
 */
export class MiniObsidianMemory {
  private vaultPath: string;
  private memoryFolder: string;

  constructor(vaultPath: string, memoryFolder?: string) {
    this.vaultPath = path.resolve(vaultPath);
    this.memoryFolder = memoryFolder ?? "AgentMemory";
  }

  private getMemoryDir(): string {
    return path.join(this.vaultPath, this.memoryFolder);
  }

  async indexVault(): Promise<VaultNote[]> {
    const notes: VaultNote[] = [];
    await this.walkDir(this.vaultPath, notes);
    return notes;
  }

  private async walkDir(dir: string, notes: VaultNote[]): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          await this.walkDir(fullPath, notes);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          try {
            const note = await this.parseNote(fullPath);
            notes.push(note);
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* skip inaccessible */ }
  }

  private async parseNote(filePath: string): Promise<VaultNote> {
    const content = await fs.readFile(filePath, "utf8");
    const title = this.extractTitle(content) ?? path.basename(filePath, ".md");
    const tags = this.extractTags(content);
    return { path: filePath, title, tags };
  }

  private extractTitle(content: string): string | undefined {
    const h1 = content.match(/^#\s+(.+)/m);
    return h1?.[1]?.trim();
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const tagRegex = /#([\w-]+)/g;
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
      if (!match[1].startsWith("http")) tags.push(match[1]);
    }
    return [...new Set(tags)];
  }

  async search(query: string): Promise<VaultNote[]> {
    const all = await this.indexVault();
    const q = query.toLowerCase();
    return all.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)) ||
        n.path.toLowerCase().includes(q)
    );
  }

  async read(relativePath: string): Promise<string> {
    const resolved = path.resolve(this.vaultPath, relativePath);
    return fs.readFile(resolved, "utf8");
  }

  async write(relativePath: string, content: string): Promise<void> {
    const resolved = path.resolve(this.vaultPath, relativePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf8");
  }

  async writeMemory(title: string, content: string, tags?: string[]): Promise<string> {
    const date = new Date().toISOString().slice(0, 10);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    const filename = `${date}-${slug}.md`;
    const tagStr = tags?.length ? `\n${tags.map((t) => `#${t}`).join(" ")}\n` : "";
    const fullContent = `# ${title}\n${tagStr}\n${content}\n`;
    await this.write(path.join(this.memoryFolder, filename), fullContent);
    return path.join(this.memoryFolder, filename);
  }
}