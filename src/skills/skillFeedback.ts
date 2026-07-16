import fs from "node:fs";
import path from "node:path";

export interface SkillRunRecord {
  skillId: string;
  timestamp: Date;
  inputs: Record<string, unknown>;
  output?: string;
  outcome: "success" | "failure" | "corrected";
  correction?: string;
  rating?: number;
}

export class SkillFeedbackStore {
  private records: SkillRunRecord[] = [];
  private storePath: string;

  constructor(storePath?: string) {
    this.storePath = path.resolve(storePath ?? "./agent/skill-feedback.json");
    this.load();
  }

  log(record: SkillRunRecord): void {
    this.records.push(record);
    if (this.records.length > 1000) this.records = this.records.slice(-500);
    this.save();
  }

  getRecent(count = 20): SkillRunRecord[] {
    return this.records.slice(-count).reverse();
  }

  getBySkill(skillId: string): SkillRunRecord[] {
    return this.records.filter((r) => r.skillId === skillId);
  }

  getFailureRate(skillId: string): number {
    const records = this.getBySkill(skillId);
    if (records.length === 0) return 0;
    const failures = records.filter((r) => r.outcome === "failure" || r.outcome === "corrected");
    return failures.length / records.length;
  }

  getFrequentCorrections(skillId: string): Map<string, number> {
    const corrections = new Map<string, number>();
    for (const r of this.getBySkill(skillId)) {
      if (r.correction) {
        corrections.set(r.correction, (corrections.get(r.correction) ?? 0) + 1);
      }
    }
    return corrections;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        this.records = JSON.parse(fs.readFileSync(this.storePath, "utf8"));
      }
    } catch { /* ignore */ }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      fs.writeFileSync(this.storePath, JSON.stringify(this.records, null, 2), "utf8");
    } catch { /* ignore */ }
  }
}