/**
 * Action initializer - registers all action modules with the global registry.
 * Import this once at startup to ensure all actions are available.
 */
import { registerFsActions } from "./fs";
import { registerTerminalActions } from "./terminal";
import { registerPcActions } from "./pc";
import { registerDeviceActions } from "./device";
import { registerSim3dActions } from "./sim3d";
import { registerNetworkActions } from "./network";
import { registerSecurityActions } from "./security";

/**
 * Register all built-in actions with the global ActionRegistry.
 */
export function registerAllActions(): void {
  registerFsActions();
  registerTerminalActions();
  registerPcActions();
  registerDeviceActions();
  registerSim3dActions();
  registerNetworkActions();
  registerSecurityActions();
  console.log(`[Actions] All actions registered`);
}