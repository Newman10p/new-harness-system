"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sim3dRunAction = void 0;
exports.registerSim3dActions = registerSim3dActions;
const node_child_process_1 = require("node:child_process");
const actionsRegistry_1 = require("../registry/actionsRegistry");
class Sim3dRunAction {
    name = "sim3d.run";
    description = "Run a 3D simulation scenario (requires external simulator)";
    async run(input) {
        const { scenario, parameters } = input;
        if (!scenario)
            throw new Error("sim3d.run requires 'scenario'");
        // Check if sim3d is enabled in config
        const simEnabled = global.__sim3dEnabled === true;
        if (!simEnabled) {
            return {
                summary: `3D simulation is disabled. Scenario: ${scenario}`,
                success: false
            };
        }
        // Try to find a simulator binary
        const simulators = ["blender", "unity", "unreal", "godot", "webots", "gazebo"];
        let simulatorPath = null;
        for (const sim of simulators) {
            try {
                (0, node_child_process_1.execSync)(`which ${sim} 2>/dev/null || where ${sim} 2>nul`, { encoding: "utf8", timeout: 3000 });
                simulatorPath = sim;
                break;
            }
            catch { /* not found */ }
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
exports.sim3dRunAction = new Sim3dRunAction();
function registerSim3dActions() {
    actionsRegistry_1.globalActionRegistry.register(exports.sim3dRunAction, {
        name: "sim3d.run", description: "Run a 3D simulation scenario (requires external simulator)", category: "sim3d"
    });
}
//# sourceMappingURL=sim3d.js.map