"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObsidianConnector = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
class ObsidianConnector {
    vaultPath;
    constructor(vaultPath) {
        this.vaultPath = vaultPath;
    }
    async listNotes() {
        const root = node_path_1.default.resolve(process.cwd(), this.vaultPath);
        if (!node_fs_1.default.existsSync(root)) {
            throw new Error(`Vault path does not exist: ${root}`);
        }
        const notes = [];
        await this.walkDirectory(root, async (filePath) => {
            if (!filePath.endsWith(".md")) {
                return;
            }
            const note = this.parseNote(filePath);
            notes.push(note);
        });
        return notes;
    }
    createNote(filename, title, content, metadata = {}) {
        const resolved = node_path_1.default.resolve(process.cwd(), this.vaultPath, filename);
        const folder = node_path_1.default.dirname(resolved);
        node_fs_1.default.mkdirSync(folder, { recursive: true });
        const frontmatter = js_yaml_1.default.dump(metadata);
        const fileBody = `---\n${frontmatter}---\n\n# ${title}\n\n${content}\n`;
        node_fs_1.default.writeFileSync(resolved, fileBody, "utf8");
    }
    async walkDirectory(root, callback) {
        const entries = await node_fs_1.default.promises.readdir(root, { withFileTypes: true });
        for (const entry of entries) {
            const resolved = node_path_1.default.join(root, entry.name);
            if (entry.isDirectory()) {
                await this.walkDirectory(resolved, callback);
            }
            else if (entry.isFile()) {
                await callback(resolved);
            }
        }
    }
    parseNote(filePath) {
        const raw = node_fs_1.default.readFileSync(filePath, "utf8");
        const metadata = {};
        let content = raw;
        let title = node_path_1.default.basename(filePath, ".md");
        if (raw.startsWith("---")) {
            const endIndex = raw.indexOf("---", 3);
            if (endIndex > 0) {
                const frontmatter = raw.slice(3, endIndex).trim();
                try {
                    const parsed = js_yaml_1.default.load(frontmatter);
                    if (parsed) {
                        Object.assign(metadata, parsed);
                        if (typeof parsed.title === "string") {
                            title = parsed.title;
                        }
                    }
                }
                catch {
                    // ignore parse failures
                }
                content = raw.slice(endIndex + 3).trimStart();
            }
        }
        return { path: filePath, title, content, metadata };
    }
}
exports.ObsidianConnector = ObsidianConnector;
//# sourceMappingURL=ObsidianConnector.js.map