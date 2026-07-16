import { HarnessAction, ActionMeta } from "./types";
import { globalActionRegistry } from "../registry/actionsRegistry";

let _memory: any = null;
export function setMemoryInstance(memory: any): void {
  _memory = memory;
}

class VaultSearchAction implements HarnessAction {
  name = "vault.search";
  description = "Search vault notes by query";

  async run(input: unknown): Promise<{ results: any[] }> {
    if (!_memory) throw new Error("Obsidian memory not initialized");
    const { query } = input as { query: string };
    if (!query) throw new Error("vault.search requires 'query'");
    const results = await _memory.search(query);
    return { results };
  }
}

class VaultReadAction implements HarnessAction {
  name = "vault.read";
  description = "Read a vault note by path";

  async run(input: unknown): Promise<{ content: string }> {
    if (!_memory) throw new Error("Obsidian memory not initialized");
    const { path } = input as { path: string };
    if (!path) throw new Error("vault.read requires 'path'");
    const content = await _memory.read(path);
    return { content };
  }
}

class VaultWriteAction implements HarnessAction {
  name = "vault.write";
  description = "Write a vault note";

  async run(input: unknown): Promise<{ path: string }> {
    if (!_memory) throw new Error("Obsidian memory not initialized");
    const { path, content } = input as { path: string; content: string };
    if (!path || content === undefined) throw new Error("vault.write requires 'path' and 'content'");
    await _memory.write(path, content);
    return { path };
  }
}

export const vaultSearchAction = new VaultSearchAction();
export const vaultReadAction = new VaultReadAction();
export const vaultWriteAction = new VaultWriteAction();

export function registerVaultActions(): void {
  globalActionRegistry.register(vaultSearchAction, {
    name: "vault.search", description: "Search vault notes by query", category: "security"
  });
  globalActionRegistry.register(vaultReadAction, {
    name: "vault.read", description: "Read a vault note by path", category: "security"
  });
  globalActionRegistry.register(vaultWriteAction, {
    name: "vault.write", description: "Write a vault note", category: "security"
  });
}