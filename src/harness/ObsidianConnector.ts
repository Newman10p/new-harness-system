import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export interface ObsidianNote {
  path: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

export class ObsidianConnector {
  constructor(private vaultPath: string) {}

  async listNotes(): Promise<ObsidianNote[]> {
    const root = path.resolve(process.cwd(), this.vaultPath);
    if (!fs.existsSync(root)) {
      throw new Error(`Vault path does not exist: ${root}`);
    }

    const notes: ObsidianNote[] = [];
    await this.walkDirectory(root, async (filePath) => {
      if (!filePath.endsWith(".md")) {
        return;
      }
      const note = this.parseNote(filePath);
      notes.push(note);
    });
    return notes;
  }

  createNote(filename: string, title: string, content: string, metadata: Record<string, unknown> = {}): void {
    const resolved = path.resolve(process.cwd(), this.vaultPath, filename);
    const folder = path.dirname(resolved);
    fs.mkdirSync(folder, { recursive: true });

    const frontmatter = yaml.dump(metadata);
    const fileBody = `---\n${frontmatter}---\n\n# ${title}\n\n${content}\n`;
    fs.writeFileSync(resolved, fileBody, "utf8");
  }

  private async walkDirectory(root: string, callback: (filePath: string) => Promise<void>): Promise<void> {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const resolved = path.join(root, entry.name);
      if (entry.isDirectory()) {
        await this.walkDirectory(resolved, callback);
      } else if (entry.isFile()) {
        await callback(resolved);
      }
    }
  }

  public parseNote(filePath: string): ObsidianNote {
    const raw = fs.readFileSync(filePath, "utf8");
    const metadata: Record<string, unknown> = {};
    let content = raw;
    let title = path.basename(filePath, ".md");

    if (raw.startsWith("---")) {
      const endIndex = raw.indexOf("---", 3);
      if (endIndex > 0) {
        const frontmatter = raw.slice(3, endIndex).trim();
        try {
          const parsed = yaml.load(frontmatter) as Record<string, unknown>;
          if (parsed) {
            Object.assign(metadata, parsed);
            if (typeof parsed.title === "string") {
              title = parsed.title;
            }
          }
        } catch {
          // ignore parse failures
        }
        content = raw.slice(endIndex + 3).trimStart();
      }
    }

    return { path: filePath, title, content, metadata };
  }
}
