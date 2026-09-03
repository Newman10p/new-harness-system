"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fsDeleteAction = exports.fsListAction = exports.fsReadAction = exports.fsAppendAction = exports.fsWriteAction = exports.fsCreateAction = void 0;
exports.registerFsActions = registerFsActions;
exports.isPathAllowed = isPathAllowed;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const actionsRegistry_1 = require("../registry/actionsRegistry");
function isPathAllowed(targetPath, allowlist) {
    const normalized = node_path_1.default.resolve(targetPath);
    for (const allowed of allowlist) {
        const resolvedAllowed = node_path_1.default.resolve(allowed);
        if (normalized.startsWith(resolvedAllowed + node_path_1.default.sep) || normalized === resolvedAllowed) {
            return true;
        }
    }
    return false;
}
// ===== FS: Create =====
class FsCreateAction {
    name = "fs.create";
    description = "Create a new file (fails if exists)";
    async run(input) {
        const { path: filePath, content = "" } = input;
        if (!filePath)
            throw new Error("fs.create requires 'path'");
        const resolved = node_path_1.default.resolve(filePath);
        await promises_1.default.mkdir(node_path_1.default.dirname(resolved), { recursive: true });
        await promises_1.default.writeFile(resolved, content, "utf8");
        return { path: filePath, created: true };
    }
}
// ===== FS: Write =====
class FsWriteAction {
    name = "fs.write";
    description = "Write content to a file (overwrites if exists)";
    async run(input) {
        const { path: filePath, content = "" } = input;
        if (!filePath)
            throw new Error("fs.write requires 'path'");
        if (content === undefined)
            throw new Error("fs.write requires 'content'");
        const resolved = node_path_1.default.resolve(filePath);
        await promises_1.default.mkdir(node_path_1.default.dirname(resolved), { recursive: true });
        await promises_1.default.writeFile(resolved, content, "utf8");
        return { path: filePath, written: true };
    }
}
// ===== FS: Append =====
class FsAppendAction {
    name = "fs.append";
    description = "Append content to a file";
    async run(input) {
        const { path: filePath, content = "" } = input;
        if (!filePath)
            throw new Error("fs.append requires 'path'");
        if (content === undefined)
            throw new Error("fs.append requires 'content'");
        const resolved = node_path_1.default.resolve(filePath);
        await promises_1.default.mkdir(node_path_1.default.dirname(resolved), { recursive: true });
        await promises_1.default.appendFile(resolved, content, "utf8");
        return { path: filePath, appended: true };
    }
}
// ===== FS: Read =====
class FsReadAction {
    name = "fs.read";
    description = "Read the contents of a file";
    async run(input) {
        const { path: filePath } = input;
        if (!filePath)
            throw new Error("fs.read requires 'path'");
        const resolved = node_path_1.default.resolve(filePath);
        const content = await promises_1.default.readFile(resolved, "utf8");
        return { path: filePath, content, size: content.length };
    }
}
// ===== FS: List =====
class FsListAction {
    name = "fs.list";
    description = "List files and directories in a path";
    async run(input) {
        const { path: dirPath } = input;
        if (!dirPath)
            throw new Error("fs.list requires 'path'");
        const resolved = node_path_1.default.resolve(dirPath);
        const entries = await promises_1.default.readdir(resolved);
        return { path: dirPath, entries };
    }
}
// ===== FS: Delete =====
class FsDeleteAction {
    name = "fs.delete";
    description = "Delete a file or empty directory (requires confirmation)";
    async run(input) {
        const { path: filePath } = input;
        if (!filePath)
            throw new Error("fs.delete requires 'path'");
        const resolved = node_path_1.default.resolve(filePath);
        await promises_1.default.rm(resolved, { recursive: false, force: true });
        return { path: filePath, deleted: true };
    }
}
// Register all FS actions
const fsCreateAction = new FsCreateAction();
exports.fsCreateAction = fsCreateAction;
const fsWriteAction = new FsWriteAction();
exports.fsWriteAction = fsWriteAction;
const fsAppendAction = new FsAppendAction();
exports.fsAppendAction = fsAppendAction;
const fsReadAction = new FsReadAction();
exports.fsReadAction = fsReadAction;
const fsListAction = new FsListAction();
exports.fsListAction = fsListAction;
const fsDeleteAction = new FsDeleteAction();
exports.fsDeleteAction = fsDeleteAction;
function registerFsActions() {
    actionsRegistry_1.globalActionRegistry.register(fsCreateAction, {
        name: "fs.create", description: "Create a new file (fails if exists)", category: "fs"
    });
    actionsRegistry_1.globalActionRegistry.register(fsWriteAction, {
        name: "fs.write", description: "Write content to a file (overwrites if exists)", category: "fs"
    });
    actionsRegistry_1.globalActionRegistry.register(fsAppendAction, {
        name: "fs.append", description: "Append content to a file", category: "fs"
    });
    actionsRegistry_1.globalActionRegistry.register(fsReadAction, {
        name: "fs.read", description: "Read the contents of a file", category: "fs"
    });
    actionsRegistry_1.globalActionRegistry.register(fsListAction, {
        name: "fs.list", description: "List files and directories in a path", category: "fs"
    });
    actionsRegistry_1.globalActionRegistry.register(fsDeleteAction, {
        name: "fs.delete", description: "Delete a file or empty directory", requiresConfirmation: true, category: "fs"
    });
}
//# sourceMappingURL=fs.js.map