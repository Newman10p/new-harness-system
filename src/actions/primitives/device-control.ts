// ─── device-control ───────────────────────────────────────────────
// Unified device control primitive.
// Discovers, lists, and controls devices via the DeviceControlManager.
// Supports operations: discover, list, control, get-state, search,
// list-adapters, device-info.

import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";
import { getDeviceControlManager } from "../../sandbox2/DeviceControlManager.js";
import type { DeviceControlManager } from "../../sandbox2/DeviceControlManager.js";

let _manager: DeviceControlManager | null = null;

function getManager(): DeviceControlManager {
  if (!_manager) {
    _manager = getDeviceControlManager();
  }
  return _manager;
}

export async function deviceControl(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const manager = getManager();

  const operation = String(action.operation ?? "list").toLowerCase();

  switch (operation) {
    case "discover":
      return discoverDevices(ctx, manager);
    case "list":
      return listDevices(action, manager);
    case "control":
      return controlDevice(action, ctx, manager);
    case "get-state":
      return getState(action, manager);
    case "search":
      return searchDevices(action, manager);
    case "device-info":
      return deviceInfo(action, manager);
    case "stats":
      return getStats(manager);
    default:
      return {
        ok: false,
        error: `Unknown device operation: "${operation}". Valid: discover, list, control, get-state, search, device-info, stats.`,
      };
  }
}

// ─── Operation Handlers ──────────────────────────────────────────────

async function discoverDevices(ctx: ActionContext, manager: DeviceControlManager): Promise<ActionResult> {
  try {
    const results = await manager.discoverAll();
    const totalNew = results.reduce((sum, r) => sum + r.newDevices.length, 0);

    ctx.emitHud("activity_log" as HudChannel, {
      message: `Device discovery complete: ${totalNew} devices found across ${results.length} adapters`,
      level: "info",
    } as never);

    // Emit individual device_discovered events for HUD
    for (const result of results) {
      for (const device of result.newDevices) {
        ctx.emitHud("device_event" as HudChannel, {
          event: "discovered",
          deviceId: device.id,
          name: device.name,
        } as never);
      }
    }

    await ctx.audit({
      type: "action_executed",
      action: "device-control",
      detail: `Discovered ${totalNew} devices`,
      ok: true,
    });

    return {
      ok: true,
      data: {
        totalDevices: manager.listDevices().length,
        adaptersScanned: results.length,
        results: results.map((r) => ({
          adapter: r.adapterId,
          protocol: r.protocol,
          found: r.devicesFound,
          durationMs: r.durationMs,
          error: r.error,
        })),
      },
    };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

function listDevices(action: Action, manager: DeviceControlManager): ActionResult {
  const protocol = action.protocol ? String(action.protocol) : null;
  let devices = manager.listDevices();

  if (protocol) {
    devices = devices.filter((d) => d.protocol === protocol);
  }

  return {
    ok: true,
    data: devices.map((d) => ({
      id: d.id,
      name: d.name,
      protocol: d.protocol,
      status: d.status,
      capabilities: d.capabilities.map((c) => ({
        name: c.name,
        type: c.type,
        value: c.value,
        options: c.options,
        range: c.range,
        unit: c.unit,
      })),
      adapter: d.adapterId,
      lastSeen: d.lastSeenAt,
    })),
  };
}

async function controlDevice(action: Action, ctx: ActionContext, manager: DeviceControlManager): Promise<ActionResult> {
  const deviceId = String(action.device_id ?? "");
  const capability = String(action.capability ?? "");
  const ctrlAction = String(action.ctrl_action ?? "set");
  const value = action.value;

  if (!deviceId) {
    return { ok: false, error: 'Missing required field: "device_id"' };
  }
  if (!capability) {
    return { ok: false, error: 'Missing required field: "capability"' };
  }

  const result = await manager.sendCommand({
    deviceId,
    capability,
    action: ctrlAction as any,
    value: value as string | number | boolean | undefined,
  });

  // Emit device state change to HUD
  if (result.success) {
    ctx.emitHud("device_event" as HudChannel, {
      event: "state_change",
      deviceId,
      name: deviceId,
      capability,
      value: result.value as string | number | boolean | undefined,
    } as never);
  }

  ctx.emitHud("activity_log" as HudChannel, {
    message: `Device ${deviceId} → ${capability} ${ctrlAction}: ${result.success ? "OK" : result.error}`,
    level: result.success ? "info" : "error",
  } as never);

  await ctx.audit({
    type: result.success ? "action_executed" : "action_blocked",
    action: "device-control",
    detail: `${ctrlAction} ${capability} on ${deviceId}: ${result.success ? "success" : result.error}`,
    durationMs: result.durationMs,
    ok: result.success,
  });

  return {
    ok: result.success,
    data: {
      deviceId: result.deviceId,
      capability: result.capability,
      action: result.action,
      value: result.value,
      previousValue: result.previousValue,
      durationMs: result.durationMs,
    },
    error: result.success ? undefined : result.error,
  };
}

async function getState(action: Action, manager: DeviceControlManager): Promise<ActionResult> {
  const deviceId = String(action.device_id ?? "");
  const capability = String(action.capability ?? "");

  if (!deviceId) return { ok: false, error: 'Missing required field: "device_id"' };
  if (!capability) return { ok: false, error: 'Missing required field: "capability"' };

  const value = await manager.getState(deviceId, capability);
  return { ok: true, data: { deviceId, capability, value } };
}

function searchDevices(action: Action, manager: DeviceControlManager): ActionResult {
  const query = String(action.query ?? "");
  if (!query) return { ok: false, error: 'Missing required field: "query"' };

  const devices = manager.searchDevices(query);
  return {
    ok: true,
    data: {
      query,
      count: devices.length,
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        protocol: d.protocol,
        status: d.status,
        capabilities: d.capabilities.map((c) => c.name),
      })),
    },
  };
}

function deviceInfo(action: Action, manager: DeviceControlManager): ActionResult {
  const deviceId = String(action.device_id ?? "");
  if (!deviceId) return { ok: false, error: 'Missing required field: "device_id"' };

  const device = manager.getDevice(deviceId);
  if (!device) return { ok: false, error: `Device not found: ${deviceId}` };

  return {
    ok: true,
    data: {
      id: device.id,
      name: device.name,
      protocol: device.protocol,
      status: device.status,
      capabilities: device.capabilities,
      metadata: device.metadata,
      adapter: device.adapterId,
      discoveredAt: device.discoveredAt,
      lastSeen: device.lastSeenAt,
    },
  };
}

function getStats(manager: DeviceControlManager): ActionResult {
  return { ok: true, data: manager.getStats() };
}