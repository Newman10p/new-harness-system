---
name: M.A.I. Tools Catalog
version: 4.0.0
total_actions: 47
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
Execute a shell command. Requires approval.
```json
{"action": "execute-terminal", "command": "ls -la", "timeout": 30000}
```
- `command` (required): Shell command to run
- `timeout` (optional): Timeout in ms (default: 30000)

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
Capture a screenshot of the current screen.
**Parameters**: `path` (optional), `display` (optional)
**Returns**: File path of saved screenshot

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
Requires approval.
```json
{"action": "self-modify", "target": "identity.md", "changes": "Update core identity section"}
```
- `target` (required): File to modify (identity.md, policy.md, catalog.md, etc.)
- `changes` (required): Description of changes to make
- `backup` (optional): Whether to create backup first (default: true)

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
Revert the system or a specific component to a previous state.
Requires approval.
```json
{"action": "rollback", "target": "config", "version": "previous"}
```
- `target` (required): What to rollback — "config", "skill", "identity", "policy", "all"
- `version` (optional): Version or checkpoint to rollback to (default: "previous")
- `reason` (optional): Reason for the rollback

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
