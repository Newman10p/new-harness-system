// ─── get-network-info ─────────────────────────────────────────────────
// Retrieves network interface information using Node.js os module.
// Attempts to get bandwidth stats via platform commands if available.

import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Action, ActionContext, ActionResult } from "../../types/index.js";

const execAsync = promisify(exec);

interface NetworkInterface {
  name: string;
  internal: boolean;
  family: string;
  address: string;
  netmask: string;
  mac: string;
  cidr?: string;
  // Bandwidth stats (only available if platform command succeeds)
  bytesIn?: number;
  bytesOut?: number;
  packetsIn?: number;
  packetsOut?: number;
}

export async function getNetworkInfo(
  _action: Action,
  _ctx: ActionContext
): Promise<ActionResult> {
  try {
    const ifaces = os.networkInterfaces();
    const interfaces: NetworkInterface[] = [];

    for (const [name, entries] of Object.entries(ifaces)) {
      if (!entries) continue;
      for (const entry of entries) {
        interfaces.push({
          name,
          internal: entry.internal,
          family: entry.family,
          address: entry.address,
          netmask: entry.netmask ?? "",
          mac: entry.mac ?? "",
          cidr: entry.cidr ?? undefined,
        });
      }
    }

    // Try to get bandwidth stats on Linux
    const platform = os.platform();
    if (platform === "linux") {
      try {
        const { stdout } = await execAsync(
          "cat /proc/net/dev 2>/dev/null | tail -n +3",
          { timeout: 3_000 }
        );
        const bwMap = parseProcNetDev(stdout);

        for (const iface of interfaces) {
          const bw = bwMap.get(iface.name);
          if (bw) {
            iface.bytesIn = bw.bytesIn;
            iface.bytesOut = bw.bytesOut;
            iface.packetsIn = bw.packetsIn;
            iface.packetsOut = bw.packetsOut;
          }
        }
      } catch {
        // /proc/net/dev not available
      }
    }

    const externalInterfaces = interfaces.filter((i) => !i.internal);
    const loopbackInterfaces = interfaces.filter((i) => i.internal);

    return {
      ok: true,
      data: {
        hostname: os.hostname(),
        total: interfaces.length,
        external: externalInterfaces.length,
        interfaces: externalInterfaces,
        loopback: loopbackInterfaces,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to get network info: ${message}` };
  }
}

function parseProcNetDev(
  stdout: string
): Map<string, { bytesIn: number; bytesOut: number; packetsIn: number; packetsOut: number }> {
  const map = new Map<
    string,
    { bytesIn: number; bytesOut: number; packetsIn: number; packetsOut: number }
  >();

  for (const line of stdout.trim().split("\n")) {
    // Format: "  eth0:  1234  567  ...  890  123  ..."
    const match = line.match(/^(\s*)([\w.-]+):\s+(.+)/);
    if (!match) continue;

    const name = match[2];
    const fields = match[3].trim().split(/\s+/).map(Number);

    // /proc/net/dev columns:
    // 0: rx_bytes, 1: rx_packets, ..., 8: tx_bytes, 9: tx_packets
    if (fields.length >= 10) {
      map.set(name, {
        bytesIn: fields[0],
        packetsIn: fields[1],
        bytesOut: fields[8],
        packetsOut: fields[9],
      });
    }
  }

  return map;
}
