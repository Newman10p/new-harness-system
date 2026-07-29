---
name: M.A.I. Tools Catalog
version: 2.0.0
total_actions: 12
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
