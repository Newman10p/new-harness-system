"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.terminalExecAction = void 0;
exports.registerTerminalActions = registerTerminalActions;
const node_child_process_1 = require("node:child_process");
const actionsRegistry_1 = require("../registry/actionsRegistry");
class TerminalExecAction {
    name = "terminal.exec";
    description = "Execute a shell command with strong restrictions";
    async run(input) {
        const { command, cwd, timeout = 30000 } = input;
        if (!command)
            throw new Error("terminal.exec requires 'command'");
        // Safety: block destructive commands unless explicitly allowed
        const destructivePatterns = [
            /^rm\s+-rf\s+\/\s*$/m, /^mkfs/m, /^dd\s+if=/m,
            /^:(){ :\|:& };:/m, /^chmod\s+777\s+\//m, /^sudo\s+rm/m
        ];
        for (const pattern of destructivePatterns) {
            if (pattern.test(command.trim())) {
                throw new Error(`Destructive command blocked: ${command}`);
            }
        }
        try {
            const output = (0, node_child_process_1.execSync)(command, {
                cwd: cwd ?? process.cwd(),
                timeout,
                encoding: "utf8",
                maxBuffer: 1024 * 1024,
                stdio: ["pipe", "pipe", "pipe"]
            });
            return {
                command,
                stdout: output?.trim() ?? "",
                stderr: "",
                exitCode: 0
            };
        }
        catch (error) {
            return {
                command,
                stdout: error.stdout?.toString()?.trim() ?? "",
                stderr: error.stderr?.toString()?.trim() ?? error.message,
                exitCode: error.status ?? 1
            };
        }
    }
}
exports.terminalExecAction = new TerminalExecAction();
function registerTerminalActions() {
    actionsRegistry_1.globalActionRegistry.register(exports.terminalExecAction, {
        name: "terminal.exec",
        description: "Execute a shell command with strong restrictions",
        requiresConfirmation: true,
        category: "terminal"
    });
}
//# sourceMappingURL=terminal.js.map