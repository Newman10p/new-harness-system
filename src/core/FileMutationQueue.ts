// ─── M.A.I. File Mutation Queue ──────────────────────────────────────────────
// Adapted from Pi (earendil-works/pi): file-mutation-queue.ts
//
// Serializes concurrent tool calls that target the same file using promise
// chaining on canonical paths. This prevents race conditions when parallel
// tool calls (e.g. two write-file actions) target the same file.
//
// Usage:
//   const queue = new FileMutationQueue();
//   await queue.enqueue("/path/to/file.txt", async () => {
//     await fs.writeFile("/path/to/file.txt", content);
//   });

import path from "node:path";
import type { FileMutationQueue as IFileMutationQueue } from "../types/index.js";

export class FileMutationQueue implements IFileMutationQueue {
  private queue: Map<string, Promise<void>> = new Map();
  private _pending = 0;

  /**
   * Enqueue a file operation. If another operation is already running on the
   * same canonical path, this operation will wait for it to complete first.
   */
  async enqueue(filePath: string, operation: () => Promise<void>): Promise<void> {
    const canonical = path.resolve(filePath);
    const prev = this.queue.get(canonical) ?? Promise.resolve();

    this._pending++;
    const next = prev.then(async () => {
      try {
        await operation();
      } finally {
        this._pending--;
        // Clean up if this was the last operation for this path
        if (this.queue.get(canonical) === next) {
          this.queue.delete(canonical);
        }
      }
    });

    this.queue.set(canonical, next);
    return next;
  }

  /** Drain all pending operations — waits for every path's chain to settle. */
  async drain(): Promise<void> {
    const promises = Array.from(this.queue.values());
    await Promise.all(promises);
  }

  /** Number of pending operations across all paths. */
  get pending(): number {
    return this._pending;
  }

  /** Check if a path currently has a pending operation. */
  isPathBusy(filePath: string): boolean {
    return this.queue.has(path.resolve(filePath));
  }
}

// Singleton instance for use across the agent loop
let _instance: FileMutationQueue | null = null;

export function getFileMutationQueue(): FileMutationQueue {
  if (!_instance) {
    _instance = new FileMutationQueue();
  }
  return _instance;
}
