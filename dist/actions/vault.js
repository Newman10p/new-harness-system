"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vaultWriteAction = exports.vaultReadAction = exports.vaultSearchAction = void 0;
exports.setMemoryInstance = setMemoryInstance;
exports.registerVaultActions = registerVaultActions;
const actionsRegistry_1 = require("../registry/actionsRegistry");
let _memory = null;
function setMemoryInstance(memory) {
    _memory = memory;
}
class VaultSearchAction {
    name = "vault.search";
    description = "Search vault notes by query";
    async run(input) {
        if (!_memory)
            throw new Error("Obsidian memory not initialized");
        const { query } = input;
        if (!query)
            throw new Error("vault.search requires 'query'");
        const results = await _memory.search(query);
        return { results };
    }
}
class VaultReadAction {
    name = "vault.read";
    description = "Read a vault note by path";
    async run(input) {
        if (!_memory)
            throw new Error("Obsidian memory not initialized");
        const { path } = input;
        if (!path)
            throw new Error("vault.read requires 'path'");
        const content = await _memory.read(path);
        return { content };
    }
}
class VaultWriteAction {
    name = "vault.write";
    description = "Write a vault note";
    async run(input) {
        if (!_memory)
            throw new Error("Obsidian memory not initialized");
        const { path, content } = input;
        if (!path || content === undefined)
            throw new Error("vault.write requires 'path' and 'content'");
        await _memory.write(path, content);
        return { path };
    }
}
exports.vaultSearchAction = new VaultSearchAction();
exports.vaultReadAction = new VaultReadAction();
exports.vaultWriteAction = new VaultWriteAction();
function registerVaultActions() {
    actionsRegistry_1.globalActionRegistry.register(exports.vaultSearchAction, {
        name: "vault.search", description: "Search vault notes by query", category: "security"
    });
    actionsRegistry_1.globalActionRegistry.register(exports.vaultReadAction, {
        name: "vault.read", description: "Read a vault note by path", category: "security"
    });
    actionsRegistry_1.globalActionRegistry.register(exports.vaultWriteAction, {
        name: "vault.write", description: "Write a vault note", category: "security"
    });
}
//# sourceMappingURL=vault.js.map