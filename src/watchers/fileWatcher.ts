import fs from "node:fs";
import path from "node:path";
import { EventBus, globalEventBus } from "../core/eventBus";

export class FileWatcher {
  private watchers: fs.FSWatcher[] = [];
  private running = false;

  constructor(
    private paths: string[],
    private eventBus: EventBus = globalEventBus
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    for (const dir of this.paths) {
      try {
        const resolved = path.resolve(dir);
        if (!fs.existsSync(resolved)) {
          fs.mkdirSync(resolved, { recursive: true });
        }
        const watcher = fs.watch(resolved, (eventType, filename) => {
          if (filename) {
            this.eventBus.emit({
              type: "file_changed",
              payload: { path: path.join(resolved, filename) }
            });
          }
        });
        this.watchers.push(watcher);
        console.log(`[FileWatcher] Watching: ${resolved}`);
      } catch (error) {
        console.warn(`[FileWatcher] Could not watch ${dir}:`, error);
      }
    }
  }

  stop(): void {
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers = [];
    this.running = false;
  }
}