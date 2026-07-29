// ─── compact-memory ────────────────────────────────────────────────────────
// Reads a markdown file, sends it to the LLM for summarization,
// and overwrites the file with the compressed version.
// Uses a low temperature (0.3) for factual summarization.
//
// The LLM instance is injected via ctx.llm (type-erased to unknown
// to keep primitives decoupled from the OpenAI SDK).

import fs from "node:fs/promises";
import type { Action, ActionContext, ActionResult, OpenAI } from "../../types/index.js";

export async function compactMemory(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const filePath = String(action.path ?? "");

  if (!filePath) {
    return { ok: false, error: "Missing required field: path" };
  }

  if (!ctx.llm) {
    return { ok: false, error: "LLM not available in context — cannot compact memory" };
  }

  const llm = ctx.llm as OpenAI;

  try {
    // Read the file to compact
    const content = await fs.readFile(filePath, "utf-8");

    if (!content.trim()) {
      return { ok: true, data: { message: "File is empty, nothing to compact" } };
    }

    const prompt = [
      `You are a memory compaction assistant. Summarize the following content,`,
      `preserving key facts, decisions, action items, and important context.`,
      `Remove redundancy, duplicates, and verbose descriptions.`,
      `Keep the output concise but complete. Do not add information not present in the input.`,
      `Output ONLY the compacted summary, nothing else.\n\n`,
      `---\n\n${content}`,
    ].join(" ");

    const response = await llm.chat.completions.create({
      model: (llm as unknown as { _options?: { model?: string } })._options?.model ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4096,
    });

    const compacted = response.choices[0]?.message?.content ?? "";

    // Overwrite the file with the compacted version
    await fs.writeFile(filePath, compacted.trim(), "utf-8");

    return {
      ok: true,
      data: {
        originalSize: content.length,
        compactedSize: compacted.length,
        savings: Math.round((1 - compacted.length / content.length) * 100),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to compact memory: ${message}` };
  }
}
