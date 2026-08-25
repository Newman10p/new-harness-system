---
name: M.A.I. Tools Catalog
version: 5.2.0
total_actions: 52
---

# M.A.I. Tools Catalog

Complete list of available actions. The LLM uses these to decide what
operations to perform. Each action has specific required and optional fields.

## File System

### read-file
Read the contents of a file.
```json
{"action": "read-file", "path": "/path/to/file.txt"}
```
- `path` (required): File path to read

### write-file
Write content to a file (creates parent dirs automatically, overwrites existing).
```json
{"action": "write-file", "path": "/path/to/file.txt", "content": "Hello, world!"}
```
- `path` (required): Target file path
- `content` (required): Content to write

### append-file
Append content to a file (creates if doesn't exist).
```json
{"action": "append-file", "path": "/path/to/file.txt", "content": "New line"}
```
- `path` (required): Target file path
- `content` (required): Content to append

### list-directory
List files and directories at a path.
```json
{"action": "list-directory", "path": "/some/directory"}
```
- `path` (optional): Directory path (defaults to ".")

## Terminal

### execute-terminal
Execute a shell command with sandboxing. Requires approval. Simple commands (no pipes/redirects) run via `spawn` with `shell: false`; commands requiring shell operators fall back to `exec` with a restricted environment and danger-pattern blocking.
```json
{"action": "execute-terminal", "command": "ls -la", "timeout": 30000}
```
- `command` (required): Shell command to run
- `timeout` (optional): Timeout in ms (default: 30000)

**Blocked patterns**: pipes to `sh -c`, `eval`, `exec`, `source`, dot-source, `${IFS}`, `$()`, backtick subshells, `base64 -d |`, `xxd -r |`, heredoc redirects to shell, process substitution, pipe to interpreters, curl/wget pipe to shell.

## Monitoring

### watch-directory
Watch a directory for filesystem changes (creates inbox entries).
```json
{"action": "watch-directory", "path": "/some/directory"}
```
- `path` (required): Directory to watch

### get-system-info
Get hostname, platform, CPU, and memory information.
```json
{"action": "get-system-info"}
```
No parameters required.

### get-process-list
Get top 30 processes sorted by memory usage.
```json
{"action": "get-process-list"}
```
No parameters required.

## Network

### open-url
Open a URL in the default browser.
```json
{"action": "open-url", "url": "https://github.com"}
```
- `url` (required): URL to open

### http-request
Make an HTTP request. Requires approval.
```json
{"action": "http-request", "url": "https://api.github.com/repos", "method": "GET"}
```
- `url` (required): URL to request
- `method` (optional): HTTP method (default: "GET")
- `headers` (optional): Request headers object
- `body` (optional): Request body object

## HUD & Memory

### emit-hud-update
Send a structured update to the HUD display.
```json
{"action": "emit-hud-update", "channel": "jarvis_speech", "payload": {"text": "Hello!"}}
```
- `channel` (required): One of: jarvis_speech, activity_log, system_metrics, threat_level, reactor_pulse
- `payload` (required): Payload object matching the channel type

### compact-memory
Compress and summarize a markdown file using LLM.
```json
{"action": "compact-memory", "path": "/path/to/memory.md"}
```
- `path` (required): File to compact

## Extended Actions (v2.1)

### screenshot-capture
Capture a screenshot of the current screen. Optionally analyze it with a VLM.
**Parameters**: `path` (optional), `display` (optional), `analyze` (optional, boolean), `analysis_prompt` (optional)
- `analyze`: If true, automatically sends the screenshot to a Vision Language Model for analysis
- `analysis_prompt`: Custom prompt for the VLM (default: "Describe what you see in this screenshot...")
**Returns**: File path, size, and optionally `analysis` (VLM description) or `analysisError`

### clipboard-read
Read the current system clipboard content.
**Returns**: Clipboard text content

### clipboard-write
Write text to the system clipboard.
**Parameters**: `text` (required) — content to write

### open-application
Launch an application by name.
**Parameters**: `app` (required), `args` (optional array)

### search-files
Search files by content pattern.
**Parameters**: `query` (required), `directory` (optional), `file_pattern` (optional), `max_results` (optional, default 20)

### get-gpu-info
Get GPU information, temperature, and utilization.
**Returns**: GPU name, temperature, memory, utilization (if available)

### get-network-info
Get network interface information.
**Returns**: List of interfaces with IP, MAC, status

### manage-processes
Kill or restart a process.
**Parameters**: `operation` ("kill" | "restart"), `pid` or `name`

### voice-call
Manage voice call state for the HUD.
**Parameters**: `operation` ("start" | "stop" | "status")

### list-files-detailed
Enhanced file listing for the file manager UI.
**Parameters**: `path` (optional), `show_hidden` (optional, default false)
**Returns**: Array of file entries with name, path, size, modified, type, extension

### semantic-recall
Search memory and context files for relevant information.
**Parameters**: `query` (required)
**Returns**: Relevant sections from memory/context files

## Self-Improvement Actions (v3.0)

### self-modify
Modify M.A.I.'s own configuration, identity, or policy files.
Requires approval. For existing file modifications, a unified diff is generated and included in the response data.
```json
{"action": "self-modify", "target": "identity.md", "operation": "append", "content": "New section text"}
```
- `target` (required): File to modify (identity.md, policy.md, catalog.md, etc.)
- `operation` (required): One of: `append`, `replace`, `insert_before`, `insert_after`, `remove_section`
- `content` (required for append/replace/insert_before/insert_after): Content to apply
- `section_marker` (required for insert_before/insert_after/remove_section): Markdown heading to locate
- **Returns**: `target`, `operation`, `section_marker`, `backup`, `new_size`, and `diff` (unified diff string for existing file modifications)

### self-evaluate
Evaluate M.A.I.'s recent performance and generate a quality score.
```json
{"action": "self-evaluate", "scope": "last_10_interactions"}
```
- `scope` (optional): Evaluation scope — "last_10_interactions", "session", "all" (default: "session")
- `criteria` (optional): Specific criteria to evaluate against

### self-diagnose
Run a self-diagnostic check on all M.A.I. subsystems.
```json
{"action": "self-diagnose"}
```
No parameters required.
**Returns**: Health status of all subsystems (LLM, policy, actions, memory, proactive engine)

### self-repair
Attempt to automatically repair a detected issue.
Requires approval.
```json
{"action": "self-repair", "issue": "memory file corrupted", "strategy": "restore_backup"}
```
- `issue` (required): Description of the issue to repair
- `strategy` (optional): Repair strategy — "restore_backup", "rebuild", "reset" (default: "restore_backup")

### adaptive-config
Adjust runtime configuration parameters based on current conditions.
Requires approval.
```json
{"action": "adaptive-config", "parameter": "max_loop_iterations", "value": 15}
```
- `parameter` (required): Configuration parameter to adjust
- `value` (required): New value for the parameter
- `reason` (optional): Why this change is needed

## Memory & User Model Actions (v3.0)

### remember
Store a piece of information in long-term memory.
```json
{"action": "remember", "fact": "User prefers dark mode", "tags": ["preference", "ui"]}
```
- `fact` (required): Information to remember
- `category` (optional): Type — preference, fact, pattern, instruction, relationship
- `tags` (optional): Tags for categorization and retrieval
- `confidence` (optional): 0-1 confidence score (default: 0.5)

### recall
Retrieve relevant memories matching a query.
```json
{"action": "recall", "query": "user preferences", "max_results": 5}
```
- `query` (required): Search query for memory retrieval
- `max_results` (optional): Maximum results to return (default: 5)
- `tags` (optional): Filter by specific tags

### forget
Remove a specific memory or memories matching criteria.
```json
{"action": "forget", "query": "outdated preference", "confirm": true}
```
- `query` (required): Query identifying memories to forget
- `confirm` (required): Must be true to actually delete
- `all` (optional): If true, forget all matching (default: false, forget only first match)

### profile-update
Update the learned user profile with new information.
```json
{"action": "profile-update", "field": "communication_style", "value": "concise"}
```
- `field` (required): Profile field to update (e.g. communication_style, expertise_level, preferred_tools)
- `value` (required): New value for the field

## Learning & Skill Actions (v3.0)

### learn-pattern
Detect and store a recurring pattern from recent interactions.
```json
{"action": "learn-pattern", "pattern": "User always asks for tests first", "confidence": 0.8}
```
- `pattern` (required): Description of the pattern
- `confidence` (optional): Confidence level 0-1 (default: 0.5)
- `context` (optional): When/where this pattern applies

### create-skill
Create a new reusable skill from a sequence of actions.
```json
{"action": "create-skill", "name": "deploy-check", "description": "Run deployment checks", "steps": [...]}
```
- `name` (required): Skill name
- `description` (required): Skill description
- `steps` (required): Array of action templates
- `inputs` (optional): Array of skill input definitions

### optimize-skill
Optimize an existing skill for better performance or reliability.
```json
{"action": "optimize-skill", "name": "deploy-check", "strategy": "reduce_steps"}
```
- `name` (required): Name of skill to optimize
- `strategy` (optional): Optimization strategy (default: "reduce_steps")

### rollback
Revert a file to a previous state using timestamped backups. Requires approval.
```json
{"action": "rollback", "target": "memory/context.md", "backup_id": "auto"}
```
- `target` (required): File path to restore (relative to project root)
- `backup_id` (optional): Backup ID to restore, `"auto"` (most recent, default), `"list"` (list all backups with diffs), or `"compare:<id>"` (show diff between backup and current file without restoring)
- `dry_run` (optional): If true, preview the restore without modifying files

**Features**: Backup rotation (max 50 per target), `diff_from_current` in listings, `compare` mode for inspection without restore, pre-rollback backup creation.

## Device Manipulation Actions (v4.0)

### control-window
Move, resize, focus, minimize, maximize, close, or arrange windows on the host desktop.
Requires approval for close/arrange operations.
```json
{"action": "control-window", "operation": "move", "title": "Terminal", "x": 0, "y": 0, "width": 800, "height": 600}
```
- `operation` (required): "move" | "resize" | "focus" | "minimize" | "maximize" | "close" | "list" | "arrange"
- `title` (optional): Window title to match
- `app` (optional): Application name to match
- `x`, `y` (optional): Window position
- `width`, `height` (optional): Window size
- `layout` (optional): "cascade" | "tile" | "side-by-side" (for arrange)

### input-inject
Inject keyboard or mouse input into the system.
Requires approval.
```json
{"action": "input-inject", "type": "text", "text": "Hello World"}
```
- `type` (required): "key" | "text" | "mouse" | "scroll" | "shortcut"
- `key` (optional): Key name (for key type)
- `text` (optional): Text to type (for text type)
- `mouseX`, `mouseY` (optional): Mouse coordinates
- `mouseButton` (optional): "left" | "right" | "middle"
- `shortcut` (optional): Shortcut string e.g. "ctrl+c", "cmd+shift+3"

### system-setting
Control system settings — volume, brightness, WiFi, Bluetooth, DND mode, etc.
Requires approval.
```json
{"action": "system-setting", "setting": "volume", "value": 50}
```
- `setting` (required): "volume" | "brightness" | "wifi" | "bluetooth" | "dnd" | "night-shift" | "resolution" | "sleep" | "lock" | "shutdown" | "restart"
- `value` (required): Setting value (number, string, or boolean)
- `display` (optional): Display number for multi-monitor setups

### media-control
Control media playback — play, pause, skip, volume for any media player.
```json
{"action": "media-control", "command": "toggle"}
```
- `command` (required): "play" | "pause" | "toggle" | "next" | "previous" | "stop" | "volume-up" | "volume-down" | "mute" | "info"
- `app` (optional): Specific media player app name
- `volume` (optional): Volume level 0-100

### screen-arrange
Manage desktops, workspaces, and multi-monitor layout.
```json
{"action": "screen-arrange", "operation": "switch-desktop", "index": 2}
```
- `operation` (required): "switch-desktop" | "create-desktop" | "remove-desktop" | "list-desktops" | "move-to-desktop" | "set-wallpaper" | "mirror" | "extend"
- `index` (optional): Desktop/workspace index
- `direction` (optional): "left" | "right" | "up" | "down"
- `app` (optional): App name (for move-to-desktop)
- `wallpaperUrl` (optional): Wallpaper image path/URL

### notification-send
Send a system notification on the host device.
```json
{"action": "notification-send", "title": "Build Complete", "body": "Project X built successfully in 42s", "urgency": "normal"}
```
- `title` (required): Notification title
- `body` (required): Notification body text
- `sound` (optional): Sound to play
- `urgency` (optional): "low" | "normal" | "critical" (default: "normal")
- `timeout` (optional): Auto-dismiss timeout in seconds
- `actions` (optional): Array of action button labels

## Advanced Actions (v4.0)

### dry-run
Simulate an action without executing it — see what WOULD happen.
```json
{"action": "dry-run", "targetAction": "execute-terminal", "targetParams": {"command": "rm -rf /tmp/build"}}
```
- `targetAction` (required): The action name to simulate
- `targetParams` (optional): Parameters for the simulated action
- **Returns**: Predicted side effects, risk score, warnings

### run-macro
Execute a named macro (user-defined multi-step workflow).
```json
{"action": "run-macro", "name": "deploy", "variables": {"env": "production"}}
```
- `name` (required): Macro name or trigger word
- `id` (optional): Macro ID (alternative to name)
- `variables` (optional): Variables to substitute in macro steps

### search-conversations
Search through indexed conversation history.
```json
{"action": "search-conversations", "query": "Docker configuration", "limit": 10}
```
- `query` (required): Search query text
- `keyword` (optional): Alternative keyword search
- `limit` (optional): Max results (default: 20)
- `intent` (optional): Filter by intent type
- `from` (optional): Start date for date range filter
- `to` (optional): End date for date range filter

## Web Search & Browsing Actions (v5.0)

### web-search
Search the web using a multi-backend search engine. Returns ranked results with titles, URLs, and snippets. Use this to look up current information, news, documentation, or any real-time data from the internet.
```json
{"action": "web-search", "query": "latest Node.js LTS release version"}
```
- `query` (required): Search query — what you want to find on the internet
- `max_results` (optional): Max results to return (default: 8, max: 20)

**When to use**: Any time you need information from the internet — current events, documentation, APIs, news, weather, prices, tutorials, troubleshooting, etc. Always prefer `web-search` over guessing or using outdated training knowledge. After getting search results, use `web-scrape` to read the full content of the most relevant URLs.

### web-scrape
Fetch a web page and extract its readable text content. Strips HTML, scripts, styles, and navigation noise. Returns clean text you can read and summarize.
```json
{"action": "web-scrape", "url": "https://nodejs.org/en/blog/release"}
```
- `url` (required): The web page URL to fetch and read
- `max_chars` (optional): Maximum characters to return (default: 15000, max: 50000)

**When to use**: After `web-search` finds relevant URLs, use `web-scrape` to read the actual page content. Also useful for fetching specific documentation pages, articles, or any web content directly.

**Workflow**: `web-search` to find relevant URLs → `web-scrape` the best ones → read and summarize for the user.

**Note**: Only works with HTML pages. For JSON APIs, use `http-request` instead.

## Vision Actions (v5.0)

### analyze-image
Analyze an image using a Vision Language Model (VLM). Accepts a file path or base64-encoded image string and returns a text description of the image contents.
```json
{"action": "analyze-image", "path": "/path/to/screenshot.png", "prompt": "What's on screen?"}
```
Or with base64:
```json
{"action": "analyze-image", "image_base64": "iVBORw0KGgo...", "prompt": "Describe this"}
```
- `path` (optional): File path to the image to analyze
- `image_base64` (optional): Base64-encoded image string (data URL or raw base64)
- `prompt` (optional): Custom analysis prompt (default: "Describe what you see in this screenshot. Be specific about UI elements, text, and any notable state.")

**Requires**: Either `path` or `image_base64` must be provided.
**Returns**: `description` — the VLM's text description of the image

**When to use**: When you need to understand what's in a screenshot or image — reading UI content, identifying visual elements, checking screen state, describing images. Pairs well with `screenshot-capture` for a "see and understand" workflow.

## Sandbox & Device Control

### sandbox-execute
Unified sandbox execution system. Create persistent isolated sessions with their own working directory and environment, then run commands within them. Supports 4 isolation tiers: `native` (restricted env, lightest), `process` (spawn with memory limits), `docker` (full container isolation), `firejail` (Linux namespace isolation). Every command is validated against 25+ dangerous patterns and analyzed for side effects before execution.

**Operations:**

Create a sandbox session:
```json
{"action": "sandbox-execute", "operation": "create-session", "name": "build-env", "tier": "docker", "timeout": 60000, "memory": 512, "network": true}
```
- `name` (required): Session name (e.g. "build-env", "test-run", "install-deps")
- `tier` (optional): Isolation level — `native` (default), `process`, `docker`, `firejail`
- `timeout` (optional): Per-command timeout in ms (default: 30000)
- `memory` (optional): Memory limit in MB (default: 256)
- `network` (optional): Allow network access (default: false)
- `session_ttl` (optional): Session idle timeout in ms (default: 1800000 = 30min)

Execute a command in a session:
```json
{"action": "sandbox-execute", "operation": "execute", "session_id": "abc123", "command": "npm install && npm test"}
```
- `session_id` (required): Session ID from create-session
- `command` (required): Shell command to execute

List active sessions:
```json
{"action": "sandbox-execute", "operation": "list-sessions"}
```

Get session details:
```json
{"action": "sandbox-execute", "operation": "session-info", "session_id": "abc123"}
```

Destroy a session:
```json
{"action": "sandbox-execute", "operation": "destroy-session", "session_id": "abc123"}
```

Replay a command from history:
```json
{"action": "sandbox-execute", "operation": "replay", "session_id": "abc123", "history_index": 0}
```

Update session config:
```json
{"action": "sandbox-execute", "operation": "update-config", "session_id": "abc123", "tier": "docker", "timeout": 120000}
```

Get sandbox statistics:
```json
{"action": "sandbox-execute", "operation": "stats"}
```

**Returns**: Session objects with command history, resource usage, risk scores. Command results include stdout, stderr, exit code, duration, risk score, and side effect analysis.

**When to use**: When you need to run potentially unsafe commands in isolation. Use `create-session` first, then `execute` commands within it. Choose `docker` tier for maximum isolation, `native` for speed. Sessions persist with their own working directory — ideal for multi-step build processes, package installations, or running tests.

### device-control
Discover, list, search, and control devices. Automatically discovers local system info, display settings, audio devices, USB peripherals, and network services. Supports platform-specific control (Linux, macOS, Windows) for display brightness, volume, media playback, and service management.

**Operations:**

Discover all devices:
```json
{"action": "device-control", "operation": "discover"}
```

List devices (optionally filter by protocol):
```json
{"action": "device-control", "operation": "list", "protocol": "audio"}
```
- `protocol` (optional): Filter by protocol — `local`, `display`, `audio`, `usb`, `network-service`, `bluetooth`, `ssh`, `mqtt`, `home-assistant`

Control a device capability:
```json
{"action": "device-control", "operation": "control", "device_id": "audio-primary", "capability": "volume", "ctrl_action": "set", "value": 75}
```
- `device_id` (required): Device ID from list/search
- `capability` (required): Capability name (e.g. "volume", "brightness", "muted", "play_pause")
- `ctrl_action` (required): `set`, `get`, `toggle`, or `trigger`
- `value` (optional): Value to set (number for volume/brightness, boolean for toggle)

Get device state:
```json
{"action": "device-control", "operation": "get-state", "device_id": "audio-primary", "capability": "volume"}
```

Search devices by name or capability:
```json
{"action": "device-control", "operation": "search", "query": "brightness"}
```

Get detailed device info:
```json
{"action": "device-control", "operation": "device-info", "device_id": "display-primary"}
```

Get device control statistics:
```json
{"action": "device-control", "operation": "stats"}
```

**Returns**: Device objects with id, name, protocol, status, capabilities (typed: switch/slider/sensor/button/toggle/select with current values, ranges, options), and metadata.

**When to use**: When you need to interact with hardware — change volume, adjust screen brightness, discover connected devices, restart services, or control smart home devices (via Home Assistant/MQTT adapters). Always `list` or `search` first to find device IDs, then `control` to send commands.
