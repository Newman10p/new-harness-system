/**
 * Core Action interface for the harness tool plugin system.
 */
export interface HarnessAction {
  name: string;
  description: string;
  run(input: unknown): Promise<unknown>;
}

export interface ActionContext {
  allowlist: string[];
  safetyLevel: "conservative" | "balanced" | "experimental";
  requireConfirmation: boolean;
}

export interface ActionMeta {
  name: string;
  description: string;
  requiresConfirmation?: boolean;
  requiresAllowlist?: boolean;
  category: "code" | "fs" | "terminal" | "sim3d" | "pc" | "device" | "network" | "security";
}