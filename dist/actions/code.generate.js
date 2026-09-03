"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.codeGenerateMeta = exports.codeGenerateAction = void 0;
const actionsRegistry_1 = require("../registry/actionsRegistry");
class CodeGenerateAction {
    name = "code.generate";
    description = "Generate code snippets or files using the active model provider";
    async run(input) {
        const { language, brief, filePath, modelAdapter } = input;
        if (!language || !brief) {
            throw new Error("code.generate requires 'language' and 'brief'");
        }
        const prompt = `Generate ${language} code for the following task. Return ONLY the code, no explanations or markdown formatting.\n\nTask: ${brief}`;
        if (modelAdapter) {
            const result = await modelAdapter.generate({ prompt, maxTokens: 2048, temperature: 0.2 });
            const code = this.extractCode(result.text, language);
            // If filePath provided, write via fs action if available
            if (filePath && actionsRegistry_1.globalActionRegistry.has("fs.write")) {
                await actionsRegistry_1.globalActionRegistry.runAction("fs.write", {
                    path: filePath,
                    content: code
                });
            }
            return { code, language, filePath };
        }
        return { code: `// Generated code for ${language}: ${brief}\n`, language, filePath };
    }
    extractCode(text, _language) {
        // Strip markdown code fences if present
        let code = text.trim();
        const fenceMatch = code.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        if (fenceMatch) {
            code = fenceMatch[1].trim();
        }
        return code;
    }
}
exports.codeGenerateAction = new CodeGenerateAction();
exports.codeGenerateMeta = {
    name: "code.generate",
    description: "Generate code snippets or files using the active model provider",
    requiresConfirmation: false,
    category: "code"
};
// Auto-register
actionsRegistry_1.globalActionRegistry.register(exports.codeGenerateAction, exports.codeGenerateMeta);
//# sourceMappingURL=code.generate.js.map