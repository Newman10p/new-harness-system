import { HarnessAction, ActionMeta } from "./types";
import { globalActionRegistry } from "../registry/actionsRegistry";
import { ModelAdapter } from "../harness/ModelAdapter";

export interface CodeGenerateInput {
  language: string;
  brief: string;
  filePath?: string;
  modelAdapter?: ModelAdapter;
}

export interface CodeGenerateOutput {
  code: string;
  language: string;
  filePath?: string;
}

class CodeGenerateAction implements HarnessAction {
  name = "code.generate";
  description = "Generate code snippets or files using the active model provider";

  async run(input: unknown): Promise<CodeGenerateOutput> {
    const { language, brief, filePath, modelAdapter } = input as CodeGenerateInput;
    if (!language || !brief) {
      throw new Error("code.generate requires 'language' and 'brief'");
    }

    const prompt = `Generate ${language} code for the following task. Return ONLY the code, no explanations or markdown formatting.\n\nTask: ${brief}`;

    if (modelAdapter) {
      const result = await modelAdapter.generate({ prompt, maxTokens: 2048, temperature: 0.2 });
      const code = this.extractCode(result.text, language);

      // If filePath provided, write via fs action if available
      if (filePath && globalActionRegistry.has("fs.write")) {
        await globalActionRegistry.runAction("fs.write", {
          path: filePath,
          content: code
        });
      }

      return { code, language, filePath };
    }

    return { code: `// Generated code for ${language}: ${brief}\n`, language, filePath };
  }

  private extractCode(text: string, _language: string): string {
    // Strip markdown code fences if present
    let code = text.trim();
    const fenceMatch = code.match(/```(?:\w+)?\n?([\s\S]*?)```/);
    if (fenceMatch) {
      code = fenceMatch[1].trim();
    }
    return code;
  }
}

export const codeGenerateAction = new CodeGenerateAction();

export const codeGenerateMeta: ActionMeta = {
  name: "code.generate",
  description: "Generate code snippets or files using the active model provider",
  requiresConfirmation: false,
  category: "code"
};

// Auto-register
globalActionRegistry.register(codeGenerateAction, codeGenerateMeta);