"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiniObsidianMemory = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
/**
 * Mini Obsidian-based memory layer. Reads/writes Markdown notes in a vault.
 */
class MiniObsidianMemory {
    vaultPath;
    memoryFolder;
    constructor(vaultPath, memoryFolder) {
        this.vaultPath = node_path_1.default.resolve(vaultPath);
        this.memoryFolder = memoryFolder ?? "AgentMemory";
    }
    getMemoryDir() {
        return node_path_1.default.join(this.vaultPath, this.memoryFolder);
    }
    async indexVault() {
        const notes = [];
        await this.walkDir(this.vaultPath, notes);
        return notes;
    }
    async walkDir(dir, notes) {
        try {
            const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = node_path_1.default.join(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith(".")) {
                    await this.walkDir(fullPath, notes);
                }
                else if (entry.isFile() && entry.name.endsWith(".md")) {
                    try {
                        const note = await this.parseNote(fullPath);
                        notes.push(note);
                    }
                    catch { /* skip unreadable */ }
                }
            }
        }
        catch { /* skip inaccessible */ }
    }
    async parseNote(filePath) {
        const content = await promises_1.default.readFile(filePath, "utf8");
        const title = this.extractTitle(content) ?? node_path_1.default.basename(filePath, ".md");
        const tags = this.extractTags(content);
        return { path: filePath, title, tags };
    }
    extractTitle(content) {
        const h1 = content.match(/^#\s+(.+)/m);
        return h1?.[1]?.trim();
    }
    extractTags(content) {
        const tags = [];
        const tagRegex = /#([\w-]+)/g;
        let match;
        while ((match = tagRegex.exec(content)) !== null) {
            if (!match[1].startsWith("http"))
                tags.push(match[1]);
        }
        return [...new Set(tags)];
    }
    async search(query) {
        const all = await this.indexVault();
        const q = query.toLowerCase();
        return all.filter((n) => n.title.toLowerCase().includes(q) ||
            n.tags.some((t) => t.toLowerCase().includes(q)) ||
            n.path.toLowerCase().includes(q));
    }
    async read(relativePath) {
        const resolved = node_path_1.default.resolve(this.vaultPath, relativePath);
        return promises_1.default.readFile(resolved, "utf8");
    }
    async write(relativePath, content) {
        const resolved = node_path_1.default.resolve(this.vaultPath, relativePath);
        await promises_1.default.mkdir(node_path_1.default.dirname(resolved), { recursive: true });
        await promises_1.default.writeFile(resolved, content, "utf8");
    }
    async writeMemory(title, content, tags) {
        const date = new Date().toISOString().slice(0, 10);
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
        const filename = `${date}-${slug}.md`;
        const tagStr = tags?.length ? `\n${tags.map((t) => `#${t}`).join(" ")}\n` : "";
        const fullContent = `# ${title}\n${tagStr}\n${content}\n`;
        await this.write(node_path_1.default.join(this.memoryFolder, filename), fullContent);
        return node_path_1.default.join(this.memoryFolder, filename);
    }
}
exports.MiniObsidianMemory = MiniObsidianMemory;
//# sourceMappingURL=MiniObsidianMemory.js.map