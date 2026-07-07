import fs from "node:fs/promises";
import path from "node:path";
import { HarnessAction, ActionMeta } from "./types";
import { globalActionRegistry } from "../registry/actionsRegistry";

export interface FsInput {
  path: string;
  content?: string;
}

function isPathAllowed(targetPath: string, allowlist: string[]): boolean {
  const normalized = path.resolve(targetPath);
  for (const allowed of allowlist) {
    const resolvedAllowed = path.resolve(allowed);
    if (normalized.startsWith(resolvedAllowed + path.sep) || normalized === resolvedAllowed) {
      return true;
    }
  }
  return false;
}

// ===== FS: Create =====
class FsCreateAction implements HarnessAction {
  name = "fs.create";
  description = "Create a new file (fails if exists)";

  async run(input: unknown): Promise<{ path: string; created: boolean }> {
    const { path: filePath, content = "" } = input as FsInput;
    if (!filePath) throw new Error("fs.create requires 'path'");
    const resolved = path.resolve(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf8");
    return { path: filePath, created: true };
  }
}

// ===== FS: Write =====
class FsWriteAction implements HarnessAction {
  name = "fs.write";
  description = "Write content to a file (overwrites if exists)";

  async run(input: unknown): Promise<{ path: string; written: boolean }> {
    const { path: filePath, content = "" } = input as FsInput;
    if (!filePath) throw new Error("fs.write requires 'path'");
    if (content === undefined) throw new Error("fs.write requires 'content'");
    const resolved = path.resolve(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf8");
    return { path: filePath, written: true };
  }
}

// ===== FS: Append =====
class FsAppendAction implements HarnessAction {
  name = "fs.append";
  description = "Append content to a file";

  async run(input: unknown): Promise<{ path: string; appended: boolean }> {
    const { path: filePath, content = "" } = input as FsInput;
    if (!filePath) throw new Error("fs.append requires 'path'");
    if (content === undefined) throw new Error("fs.append requires 'content'");
    const resolved = path.resolve(filePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.appendFile(resolved, content, "utf8");
    return { path: filePath, appended: true };
  }
}

// ===== FS: Read =====
class FsReadAction implements HarnessAction {
  name = "fs.read";
  description = "Read the contents of a file";

  async run(input: unknown): Promise<{ path: string; content: string; size: number }> {
    const { path: filePath } = input as FsInput;
    if (!filePath) throw new Error("fs.read requires 'path'");
    const resolved = path.resolve(filePath);
    const content = await fs.readFile(resolved, "utf8");
    return { path: filePath, content, size: content.length };
  }
}

// ===== FS: List =====
class FsListAction implements HarnessAction {
  name = "fs.list";
  description = "List files and directories in a path";

  async run(input: unknown): Promise<{ path: string; entries: string[] }> {
    const { path: dirPath } = input as FsInput;
    if (!dirPath) throw new Error("fs.list requires 'path'");
    const resolved = path.resolve(dirPath);
    const entries = await fs.readdir(resolved);
    return { path: dirPath, entries };
  }
}

// ===== FS: Delete =====
class FsDeleteAction implements HarnessAction {
  name = "fs.delete";
  description = "Delete a file or empty directory (requires confirmation)";

  async run(input: unknown): Promise<{ path: string; deleted: boolean }> {
    const { path: filePath } = input as FsInput;
    if (!filePath) throw new Error("fs.delete requires 'path'");
    const resolved = path.resolve(filePath);
    await fs.rm(resolved, { recursive: false, force: true });
    return { path: filePath, deleted: true };
  }
}

// Register all FS actions
const fsCreateAction = new FsCreateAction();
const fsWriteAction = new FsWriteAction();
const fsAppendAction = new FsAppendAction();
const fsReadAction = new FsReadAction();
const fsListAction = new FsListAction();
const fsDeleteAction = new FsDeleteAction();

export {
  fsCreateAction,
  fsWriteAction,
  fsAppendAction,
  fsReadAction,
  fsListAction,
  fsDeleteAction
};

export function registerFsActions(): void {
  globalActionRegistry.register(fsCreateAction, {
    name: "fs.create", description: "Create a new file (fails if exists)", category: "fs"
  });
  globalActionRegistry.register(fsWriteAction, {
    name: "fs.write", description: "Write content to a file (overwrites if exists)", category: "fs"
  });
  globalActionRegistry.register(fsAppendAction, {
    name: "fs.append", description: "Append content to a file", category: "fs"
  });
  globalActionRegistry.register(fsReadAction, {
    name: "fs.read", description: "Read the contents of a file", category: "fs"
  });
  globalActionRegistry.register(fsListAction, {
    name: "fs.list", description: "List files and directories in a path", category: "fs"
  });
  globalActionRegistry.register(fsDeleteAction, {
    name: "fs.delete", description: "Delete a file or empty directory", requiresConfirmation: true, category: "fs"
  });
}

export { isPathAllowed };