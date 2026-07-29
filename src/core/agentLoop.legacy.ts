import { EventBus, globalEventBus } from "./eventBus";
import { AgentState } from "./agentState";
import { WorkflowEngine } from "./workflowEngine";
import { Orchestrator } from "./orchestrator";

/**
 * Main agent loop. Subscribes to all events and routes them to workflows or actions.
 */
export async function startAgentLoop(
  orchestrator: Orchestrator,
  agentState: AgentState,
  workflowEngine: WorkflowEngine,
  eventBus: EventBus = globalEventBus
): Promise<() => void> {
  const unsubscribe = eventBus.subscribe(async (event) => {
    switch (event.type) {
      case "user_input": {
        const text = event.payload.text.toLowerCase();

        if (text.startsWith("pause ")) {
          const target = text.replace("pause ", "").trim();
          const wf = workflowEngine.list().find((w) => w.name.toLowerCase().includes(target));
          if (wf) { workflowEngine.pause(wf.id); console.log(`  ⏸ Paused: ${wf.name}`); }
          return;
        }
        if (text.startsWith("resume ")) {
          const target = text.replace("resume ", "").trim();
          const wf = workflowEngine.list().find((w) => w.name.toLowerCase().includes(target));
          if (wf) { workflowEngine.resume(wf.id); console.log(`  ▶ Resumed: ${wf.name}`); }
          return;
        }
        if (text.startsWith("cancel ")) {
          const target = text.replace("cancel ", "").trim();
          const wf = workflowEngine.list().find((w) => w.name.toLowerCase().includes(target));
          if (wf) { workflowEngine.cancel(wf.id); console.log(`  ⛔ Cancelled: ${wf.name}`); }
          return;
        }
        console.log(`  🧠 Input: "${event.payload.text}"`);
        break;
      }
      case "file_changed":
        console.log(`  📁 File changed: ${event.payload.path}`);
        break;
      case "resource_state":
        if (agentState.shouldThrottle()) {
          const avg = agentState.getAverageResource(2);
          console.log(`  ⚠ High resource: CPU ${avg.cpu.toFixed(0)}%, RAM ${avg.ram.toFixed(0)}%`);
        }
        break;
      case "device_event":
        if (event.payload.kind === "usb") {
          const info = event.payload.info as any;
          console.log(`  🔌 USB: ${info.description ?? info.id}`);
        }
        break;
      case "scheduled_task":
        console.log(`  ⏰ Task: ${event.payload.id}`);
        break;
      case "workflow_update":
        console.log(`  🔄 ${event.payload.id}: ${event.payload.status}`);
        break;
    }
  });

  console.log("[AgentLoop] Started");
  return unsubscribe;
}