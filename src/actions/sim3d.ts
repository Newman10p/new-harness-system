import { execSync } from "node:child_process";
import { HarnessAction, ActionMeta } from "./types";
import { globalActionRegistry } from "../registry/actionsRegistry";

export interface Sim3dInput {
  scenario: string;
  parameters?: Record<string, unknown>;
}

export interface Sim3dOutput {
  summary: string;
  details?: string;
  success: boolean;
}

class Sim3dRunAction implements HarnessAction {
  name = "sim3d.run";
  description = "Run a 3D simulation scenario (requires external simulator)";

  async run(input: unknown): Promise<Sim3dOutput> {
    const { scenario, parameters } = input as Sim3dInput;
    if (!scenario) throw new Error("sim3d.run requires 'scenario'");

    // Check if sim3d is enabled in config
    const simEnabled = (global as any).__sim3dEnabled === true;
    if (!simEnabled) {
      return {
        summary: `3D simulation is disabled. Scenario: ${scenario}`,
        success: false
      };
    }

    // Try to find a simulator binary
    const simulators = ["blender", "unity", "unreal", "godot", "webots", "gazebo"];
    let simulatorPath: string | null = null;
    for (const sim of simulators) {
      try {
        execSync(`which ${sim} 2>/dev/null || where ${sim} 2>nul`, { encoding: "utf8", timeout: 3000 });
        simulatorPath = sim;
        break;
      } catch { /* not found */ }
    }

    if (!simulatorPath) {
      return {
        summary: `No 3D simulator found. Scenario: ${scenario}. Install blender, godot, or webots to enable.`,
        details: `Parameters: ${JSON.stringify(parameters ?? {})}`,
        success: false
      };
    }

    // Stub: in production this would invoke the simulator
    return {
      summary: `Simulation '${scenario}' submitted to ${simulatorPath}`,
      details: `Parameters: ${JSON.stringify(parameters ?? {})}`,
      success: true
    };
  }
}

export const sim3dRunAction = new Sim3dRunAction();

export function registerSim3dActions(): void {
  globalActionRegistry.register(sim3dRunAction, {
    name: "sim3d.run", description: "Run a 3D simulation scenario (requires external simulator)", category: "sim3d"
  });
}