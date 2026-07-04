import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SpeechToTextAdapter } from "./AudioAdapter";

const execFileAsync = promisify(execFile);

export class WhisperSttAdapter implements SpeechToTextAdapter {
  constructor(private modelPath?: string) {}

  async transcribe(input: { filePath?: string; buffer?: Buffer }): Promise<string> {
    const resolvedPath = input.filePath
      ? path.resolve(process.cwd(), input.filePath)
      : input.buffer
      ? await this.saveTempBuffer(input.buffer)
      : undefined;

    if (!resolvedPath) {
      throw new Error("WhisperSttAdapter requires a filePath or buffer input.");
    }

    try {
      const whisperModule = await import("@pr0gramm/fluester");
      const whisper = (whisperModule as any)?.default ?? (whisperModule as any);
      if (whisper) {
        const result = await (whisper as any)(resolvedPath, {
          model: this.modelPath ?? "base"
        });
        return String((result as any)?.text ?? result?.result ?? result ?? "").trim();
      }
    } catch (error) {
      console.warn("Whisper binding unavailable, falling back to whisper CLI:", error);
    }

    // Fallback to CLI
    try {
      const args = [resolvedPath, "--model", this.modelPath ?? "base", "--language", "en", "--task", "transcribe"];
      const { stdout, stderr } = await execFileAsync("whisper", args, {
        cwd: process.cwd(),
        env: process.env
      });

      if (stderr) {
        console.warn(stderr);
      }

      return stdout.trim();
    } catch (cliError) {
      throw new Error(`Whisper transcription failed: ${cliError}`);
    }
  }

  private async saveTempBuffer(buffer: Buffer): Promise<string> {
    const tmpPath = path.join(os.tmpdir(), `jarvis-whisper-${Date.now()}.wav`);
    fs.writeFileSync(tmpPath, buffer);
    return tmpPath;
  }
}
