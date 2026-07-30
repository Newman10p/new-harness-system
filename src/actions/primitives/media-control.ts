// ─── media-control ───────────────────────────────────────────────────
// Media playback control — play, pause, toggle, next, previous, stop,
// volume-up, volume-down, mute, info. Works with any active media player.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { Action, ActionContext, ActionResult, HudChannel } from "../../types/index.js";

const execAsync = promisify(exec);

type Platform = "darwin" | "linux" | "win32";

function getPlatform(): Platform {
  return process.platform as Platform;
}

const VALID_COMMANDS = [
  "play", "pause", "toggle", "next", "previous", "stop",
  "volume-up", "volume-down", "mute", "info",
];

/** Known media apps per platform for targeted control. */
const MEDIA_APPS: Record<Platform, string[]> = {
  darwin: ["Music", "Spotify", "VLC", "iTunes", "Apple Music"],
  linux: [],
  win32: ["Spotify", "vlc", "Windows Media Player", "Groove Music"],
};

export async function mediaControl(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const command = String(action.command ?? "").toLowerCase();
  const app = action.app ? String(action.app) : undefined;
  const volume = action.volume != null ? Number(action.volume) : undefined;

  if (!VALID_COMMANDS.includes(command)) {
    return { ok: false, error: `Invalid command: "${command}". Must be one of: ${VALID_COMMANDS.join(", ")}` };
  }

  const platform = getPlatform();
  const startMs = Date.now();

  try {
    let result: unknown;

    if (command === "info") {
      result = await getMediaInfo(platform, app);
    } else if (command.startsWith("volume")) {
      result = await controlMediaVolume(platform, command, app, volume);
    } else {
      result = await executeMediaCommand(platform, command, app);
    }

    const durationMs = Date.now() - startMs;

    ctx.emitHud("activity_log" as HudChannel, {
      message: `Media ${command}${app ? ` on ${app}` : ""} — completed`,
      level: "info",
    } as never);

    await ctx.audit({
      type: "action_executed",
      action: "media-control",
      detail: `command=${command} app=${app ?? "auto"} volume=${volume ?? "-"}`,
      durationMs,
      ok: true,
    });

    return { ok: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startMs;

    await ctx.audit({
      type: "action_blocked",
      action: "media-control",
      detail: `command=${command} error=${message}`,
      durationMs,
      ok: false,
    });

    return { ok: false, error: `Media control failed: ${message}` };
  }
}

// ─── Execute play/pause/toggle/next/previous/stop ──────────────────────
async function executeMediaCommand(platform: Platform, command: string, app?: string): Promise<{ command: string; app: string; detail: string }> {
  const targetApp = app ?? "";

  if (platform === "darwin") {
    // If app is specified, target it; otherwise use System Events to control active player
    const appName = targetApp || "Spotify";
    const script = buildAppleScriptCommand(appName, command);
    await execAsync(`osascript -e '${script}'`, { timeout: 10_000 });
    return { command, app: appName, detail: `Executed ${command} on ${appName}` };
  }

  if (platform === "linux") {
    // Use playerctl if available
    try {
      const playerArg = targetApp ? `--player=${targetApp}` : "";
      await execAsync(`playerctl ${playerArg} ${mapLinuxCommand(command)}`, { timeout: 5_000 });
      return { command, app: targetApp || "active", detail: `Executed ${command}` };
    } catch {
      // Fallback: dbus-send MPRIS2
      try {
        const mprisPath = targetApp
          ? `/org/mpris/MediaPlayer2/${targetApp}`
          : await findActiveMPRIS();
        await execAsync(
          `dbus-send --print-reply --dest=org.mpris.MediaPlayer2.${targetApp || "player"} ${mprisPath}/org/mpris.MediaPlayer2.Player ${mapDBusMethod(command)}`,
          { timeout: 5_000 }
        );
        return { command, app: targetApp || "active", detail: `Executed ${command} via D-Bus MPRIS2` };
      } catch {
        throw new Error('No media player control found. Install "playerctl" (Linux) or specify a valid media app.');
      }
    }
  }

  // Windows
  const appName = targetApp || "Spotify";
  try {
    await execAsync(
      `powershell -command "(New-Object -ComObject WScript.Shell).SendKeys('${mapWindowsKey(command)}')"`,
      { timeout: 5_000 }
    );
    return { command, app: appName, detail: `Executed ${command} via global media keys` };
  } catch {
    // Try targeted process approach
    await execAsync(
      `powershell -command "$p = Get-Process '${appName}' -ErrorAction Stop | Select-Object -First 1; $h = $p.MainWindowHandle; if ($h -ne 0) { [Microsoft.VisualBasic.Interaction]::AppActivate('${appName}') }"`,
      { timeout: 10_000 }
    );
    await execAsync(
      `powershell -command "(New-Object -ComObject WScript.Shell).SendKeys('${mapWindowsKey(command)}')"`,
      { timeout: 5_000 }
    );
    return { command, app: appName, detail: `Activated ${appName} and sent ${command}` };
  }
}

// ─── Get current media info ────────────────────────────────────────────
async function getMediaInfo(platform: Platform, app?: string): Promise<Record<string, string>> {
  const info: Record<string, string> = { status: "unknown" };

  if (platform === "darwin") {
    const appName = app || "Spotify";
    try {
      const { stdout } = await execAsync(
        `osascript -e '
tell application "${appName}"
  set t to name of current track
  set a to artist of current track
  set al to album of current track
  set p to player position
  set s to player state
  return t & "|" & a & "|" & al & "|" & p & "|" & s
end tell'`,
        { timeout: 10_000 }
      );
      const [track, artist, album, position, state] = stdout.trim().split("|");
      info.track = track ?? "";
      info.artist = artist ?? "";
      info.album = album ?? "";
      info.position = position ?? "0";
      info.status = state?.toLowerCase() ?? "unknown";
    } catch {
      info.error = `Could not get info from ${appName}. Is it running?`;
    }
  } else if (platform === "linux") {
    try {
      const playerArg = app ? `--player=${app}` : "";
      const { stdout: track } = await execAsync(`playerctl ${playerArg} metadata xesam:title`, { timeout: 3_000 }).catch(() => ({ stdout: "" }));
      const { stdout: artist } = await execAsync(`playerctl ${playerArg} metadata xesam:artist`, { timeout: 3_000 }).catch(() => ({ stdout: "" }));
      const { stdout: album } = await execAsync(`playerctl ${playerArg} metadata xesam:album`, { timeout: 3_000 }).catch(() => ({ stdout: "" }));
      const { stdout: status } = await execAsync(`playerctl ${playerArg} status`, { timeout: 3_000 }).catch(() => ({ stdout: "" }));
      const { stdout: pos } = await execAsync(`playerctl ${playerArg} position`, { timeout: 3_000 }).catch(() => ({ stdout: "" }));
      info.track = track.trim();
      info.artist = artist.trim();
      info.album = album.trim();
      info.status = status.trim().toLowerCase();
      info.position = pos.trim();
    } catch {
      info.error = 'playerctl not available. Install with: sudo apt install playerctl';
    }
  } else {
    info.status = "partial";
    info.track = "Media info via WMI requires specific player support";
    info.note = "Windows media info depends on the player's API";
  }

  return info;
}

// ─── Media volume control ──────────────────────────────────────────────
async function controlMediaVolume(platform: Platform, command: string, app?: string, volume?: number): Promise<{ command: string; detail: string }> {
  if (command === "volume-up" || command === "volume-down") {
    // Use global media keys
    const key = platform === "win32" ? (command === "volume-up" ? "{VOLUME_UP}" : "{VOLUME_DOWN}") : "";
    if (platform === "darwin") {
      await execAsync(`osascript -e 'tell application "System Events" to key code ${command === "volume-up" ? "111" : "113"}'`, { timeout: 5_000 });
    } else if (platform === "linux") {
      await execAsync(`xdotool key XF86AudioRaiseVolume`, { timeout: 3_000 });
    } else {
      await execAsync(`powershell -command "(New-Object -ComObject WScript.Shell).SendKeys('${key}')"`, { timeout: 5_000 });
    }
    return { command, detail: `System volume adjusted: ${command}` };
  }

  // Mute toggle
  if (command === "mute") {
    if (platform === "darwin") {
      await execAsync(`osascript -e 'tell application "System Events" to key code 113'`, { timeout: 5_000 });
    } else if (platform === "linux") {
      await execAsync(`xdotool key XF86AudioMute`, { timeout: 3_000 });
    } else {
      await execAsync(`powershell -command "(New-Object -ComObject WScript.Shell).SendKeys('{VOLUME_MUTE}')"`, { timeout: 5_000 });
    }
    return { command, detail: "Mute toggled" };
  }

  return { command, detail: `Unknown volume command: ${command}` };
}

// ─── Helpers ───────────────────────────────────────────────────────────

function buildAppleScriptCommand(appName: string, command: string): string {
  const appScript = appName === "Music" || appName === "Apple Music"
    ? `tell application "Music"`
    : `tell application "${appName}"`;

  const cmdMap: Record<string, string> = {
    play: `${appScript}\n  play\nend tell`,
    pause: `${appScript}\n  pause\nend tell`,
    toggle: `${appScript}\n  if player state is playing then pause else play\nend tell`,
    next: `${appScript}\n  next track\nend tell`,
    previous: `${appScript}\n  previous track\nend tell`,
    stop: `${appScript}\n  stop\nend tell`,
  };

  return cmdMap[command] ?? `${appScript}\n  play\nend tell`;
}

function mapLinuxCommand(command: string): string {
  const map: Record<string, string> = {
    play: "play", pause: "pause", toggle: "play-pause",
    next: "next", previous: "previous", stop: "stop",
  };
  return map[command] ?? command;
}

function mapDBusMethod(command: string): string {
  const map: Record<string, string> = {
    play: "org.mpris.MediaPlayer2.Player.Play",
    pause: "org.mpris.MediaPlayer2.Player.Pause",
    toggle: "org.mpris.MediaPlayer2.Player.PlayPause",
    next: "org.mpris.MediaPlayer2.Player.Next",
    previous: "org.mpris.MediaPlayer2.Player.Previous",
    stop: "org.mpris.MediaPlayer2.Player.Stop",
  };
  return map[command] ?? "";
}

function mapWindowsKey(command: string): string {
  const map: Record<string, string> = {
    play: "^p", pause: "^p", toggle: "^p",
    next: "^b", previous: "^z", stop: "^s",
  };
  return map[command] ?? "^p";
}

async function findActiveMPRIS(): Promise<string> {
  try {
    const { stdout } = await execAsync(
      "dbus-send --session --dest=org.freedesktop.DBus --type=method_call --print-reply /org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null | rg 'org.mpris.MediaPlayer2'",
      { timeout: 3_000 }
    );
    const match = stdout.match(/org\.mpris\.MediaPlayer2\.(\w+)/);
    if (match) return `/org/mpris/MediaPlayer2/${match[1]}`;
  } catch { /* fall through */ }
  return "/org/mpris/MediaPlayer2/Player";
}
