# M.A.I. — Multiple Array Intelligence

**Production-Grade Personal AI Operating System** with unified runtime, policy enforcement, MCP integration, memory management, and JARVIS-like presence.

M.A.I. (Multiple Array Intelligence) is a coherent, production-ready AI operating system featuring:
- **ONE Runtime** — Central MAIRuntime coordinates all tasks, actions, approvals, and state
- **ONE Policy** — PolicyService enforces security rules with durable, auditable approvals
- **ONE Configuration** — ConfigManager with validation, preview, rollback, and history
- **ONE Secret Model** — SecretBroker never exposes secrets to models, logs, or UI
- **ONE Trust Model** — Provenance metadata (TRUSTED, SEMI_TRUSTED, UNTRUSTED) on all content
- **MCP Integration** — First-class MCP client/server with policy enforcement
- **Memory System** — Capture, retrieve, rank, compact, forget with explainability
- **Task System** — Durable, cancellable, observable tasks with full lifecycle
- **Multi-Channel** — HUD, CLI, Telegram, WhatsApp, SMS, SIP, Webhook unified under one runtime
- **System Doctor** — Comprehensive diagnostics with remediation guidance

The system reads markdown files for identity, policy, and tools, calls an OpenAI-compatible LLM, parses fenced ` ```action ` JSON blocks from responses, validates them against a policy firewall, executes actions through a unified gateway, and streams results to a WebSocket-connected Iron Man-style HUD frontend.

## Architecture

```
                         Multi-Device Gateway
                    (SMS / Telegram / WhatsApp /
                     SIP / Webhook / Chat PWA)
                              |
                              v
+-------------------------------------------------------------+
|                    Agent Loop                        |
|  (7-Phase: Assemble -> Infer -> Parse ->               |
|   Enforce -> Execute -> Stream -> Loop)                |
|                                                     |
|  +----------+  +-----------+  +----------+       |
|  | Context   |  |  Response  |  |  Policy  |       |
|  | Assembler |  |  Parser    |  |  Engine  |       |
|  +----+------+  +-----------+  +----+-----+       |
|       |                            |                |
|  +----v-----------------------------v-----------+     |
|  |           Action Registry                  |     |
|  |  49 primitives across 6 groups:            |     |
|  |   . Core (12) . Intelligence (20)          |     |
|  |   . Device Control (6) . Extended (6)     |     |
|  |   . Integration (3) . Vision (2)         |     |
|  +--------------------------------------------+     |
|                                                     |
|  +--------------+  +-------------+  +-----------+ |
|  | Event Mesh   |  | Notifications|  | Macros    | |
|  | (pub/sub)    |  | Aggregator   |  | Engine    | |
|  +--------------+  +-------------+  +-----------+ |
|                                                     |
|  +--------------+  +-------------+  +-----------+ |
|  | Analytics    |  | Sandbox     |  | Ambient   | |
|  | Engine       |  | (4 tiers)   |  | Audio     | |
|  +--------------+  +-------------+  +-----------+ |
|                                                     |
|  +--------------+  +-------------+  +-----------+ |
|  | Browser      |  | Email       |  | Device    | |
|  | Control (CDP)|  | (IMAP/SMTP) |  | Control   | |
|  +--------------+  +-------------+  +-----------+ |
+-----------------------------------------------------+
                       |
           +-----------+-----------+
           v                       v
      CLI Output           WebSocket (HUD)
      (terminal)         ws://localhost:8080
                               |
                   +-----------+-----------+
                   v           v           v
            HUD Frontend   Chat PWA   API Routes
          localhost:3000  /chat/    /api/*
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Markdown-First** | All business logic (identity, policy, tools) lives in `.md` files, not code. Edit behavior without recompiling. |
| **Action Protocol** | LLM communicates via ` ```action` fenced JSON blocks. Simple, debuggable, language-agnostic. |
| **Policy as Firewall** | YAML frontmatter in `policy.md` defines deny/allow/approval rules. Enforced before any execution. |
| **OpenAI SDK** | Compatible with OpenAI, Ollama, NVIDIA NIM, Anthropic, and any OpenAI-compatible endpoint. |
| **60s Hard Timeout** | Every action is race'd against a 60s timeout. The agent never hangs. |
| **Never-Throw Registry** | ActionRegistry.execute() always returns an ActionResult. No unhandled promise rejections. |
| **Lazy-Loading Subsystems** | All subsystems (gateway, auth, events, notifications, browser, email, etc.) are loaded via try/catch. Gracefully optional — nothing crashes if a module is missing. |
| **Multi-Channel Gateway** | External channels (SMS, Telegram, WhatsApp, SIP, Webhook) normalize into a single `processUserMessage()` entry point. |
| **Zero-Dependency Integration** | Browser control (CDP over raw WebSocket) and email (IMAP/SMTP over raw TLS sockets) use no external libraries beyond the existing `ws` package. |

## Features Overview (14 Subsystems)

### Phase 1 — Multi-Device Gateway
Access M.A.I. from any device or messaging platform. All channels normalize into the agent loop.

| Channel | Status | Config |
|---------|--------|--------|
| **SMS** (Twilio) | Optional | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| **Telegram** | Optional | `TELEGRAM_BOT_TOKEN` |
| **WhatsApp** (Twilio) | Optional | `TWILIO_WHATSAPP_SID` |
| **SIP / Voice Call** | Optional | `SIP_SERVER`, `SIP_USER`, `SIP_PASS` |
| **Webhook** | Optional | Custom HTTP endpoint |
| **Chat PWA** | Built-in | `/chat/` on the HUD server |

### Phase 2 — Auth & Access Control
QR-based device pairing, role-based access control, session management.

- **Roles:** owner, admin, user, guest
- **Device Pairing:** Scan QR code to connect a new device
- **Session Management:** Auto-expiry, refresh tokens
- **Permission Middleware:** HTTP API route protection

### Phase 3 — Intelligence Expansion

| Subsystem | Description |
|-----------|-------------|
| **Event Mesh** | Pub/sub with glob pattern matching, TTL, dead letter queue |
| **Notification Aggregator** | Pulls from Gmail, GitHub, Slack, Calendar, RSS |
| **Macro Engine** | User-defined multi-step workflows with variables |
| **Conversation Index** | Full-text search across all chat history |
| **Self-Improvement Engine** | Self-evaluate, self-diagnose, self-repair, self-modify |
| **Proactive Engine** | Triggers actions based on conditions (CPU, memory, time) |
| **User Model** | Learns and remembers user preferences over time |

### Phase 4 — Chat PWA & Cloud Relay

- **Chat PWA:** Mobile-first progressive web app at `/chat/`, installable on phones
- **Cloud Tunnel:** Expose M.A.I. securely via Cloudflare Tunnel, Ngrok, or WireGuard

### Phase 5 — Device Control & Analytics

| Capability | Description |
|------------|-------------|
| **Window Management** | Move, resize, focus, minimize, maximize, close, arrange windows |
| **Input Injection** | Keyboard, mouse, scroll, shortcut injection |
| **System Settings** | Volume, brightness, WiFi, Bluetooth, DND, lock, shutdown |
| **Media Control** | Play/pause/skip/volume for any media player |
| **Screen Management** | Desktops, workspaces, multi-monitor layouts |
| **Sandbox / Dry-Run** | 4-tier isolation (native, process, docker, firejail), risk scoring |
| **Analytics Engine** | Tracks interactions, JSONL append-only storage |
| **Ambient Audio** | Always-listening mode with wake word detection |

### Phase 6 — Browser Control (CDP)

Direct browser automation via Chrome DevTools Protocol. No Puppeteer, no Playwright — just raw WebSocket CDP.

| Capability | Description |
|------------|-------------|
| **Browser Discovery** | Auto-discovers Chrome/Brave instances via `--remote-debugging-port` or port scanning (9222-9225) |
| **Tab Management** | List, search, create, close, activate tabs across all discovered browsers |
| **Navigation** | Navigate to URLs, wait for page load, extract page content |
| **Google Search** | Live Google search with automatic result extraction (titles, URLs, snippets) |
| **Screenshots** | Capture tab screenshots saved to disk |
| **JavaScript Eval** | Execute arbitrary JavaScript in the browser context |
| **Content Extraction** | Extract readable text, links, and structured data from any page |

All browser operations are **auto-approved** (no confirmation gates) — M.A.I. can browse and search the web autonomously.

### Phase 7 — Email Access (IMAP/SMTP)

Full email access with zero external dependencies. Built from scratch using Node.js `tls` and `net` modules.

| Capability | Description |
|------------|-------------|
| **Multi-Account** | Configure multiple email accounts (Gmail, Outlook, custom IMAP) |
| **Folder Management** | List and browse IMAP folders |
| **Message Operations** | List, search, read, send, delete, mark-as-read |
| **Gmail Support** | Works with Gmail App Passwords and OAuth |
| **HTML Email** | Full multipart MIME support for sending HTML emails |
| **Auto-Approval** | All email operations are auto-approved for autonomous use |

## Brain Files (Markdown-First Architecture)

```
agent/
  identity.md               # Who M.A.I. is, how to communicate
  instructions.md           # Behavioral instructions and workflows
  memory.md                # Memory management directives
  policy.md                # YAML frontmatter: deny/allow/approval rules
  models.md                # Model configuration and routing
  voice.md                  # Voice/TTS settings
  tools/
    catalog.md             # Human-readable docs for all 49 actions
    list.md                 # Quick reference action list
  workflows/
    background.md          # Background task definitions

memory/
  context.md                # Accumulated long-term memory
  user-profile.md            # Learned user profile
  long-term.md               # Persistent memory store
  patterns.md                # Learned behavioral patterns
  self-improvements.md       # Self-improvement log
  proactive-rules.md        # Proactive trigger rules
  conversation-index.json    # Full-text search index

state/
  inbox.md                   # Event log (file watches, notifications)
  audit.log.md               # Audit trail
  runtime-config.json       # Runtime configuration
  gateway-config.json        # Gateway channel configs
  auth.json                  # Auth state (sessions, devices)
  tunnel-config.json         # Cloud tunnel config
  analytics-events.jsonl     # Analytics event store
  notifications-config.json # Notification source configs
  macro-runs.json            # Macro execution history
  circuit-breaker.json       # Circuit breaker state

macros/                      # User-defined macro files
skills/                      # Skill definitions (.yml)
vault/                       # Obsidian-style knowledge vault
```

### policy.md Example

```yaml
---
deny_commands:
  - "rm -rf"
  - "mkfs"
  - "shutdown"
  - "reboot"
allow_network:
  - "github.com"
  - "api.github.com"
  - "google.com"
  - "mail.google.com"
  - "imap.gmail.com"
  - "smtp.gmail.com"
  - "outlook.office.com"
  - "imap-mail.outlook.com"
  - "smtp.office365.com"
  - "localhost"
  - "127.0.0.1"
auto_approve:
  - sandbox-execute
  - device-control
  - ui-adapt
  - dry-run
  - browser-control
  - email-access
require_approval:
  - execute-terminal
  - write-file
  - http-request
  - self-modify
  - self-repair
  - input-inject
  - system-setting
  - control-window
---
```

## 49 Action Primitives

### Core (12)

| Action | Safety | Description |
|--------|--------|-------------|
| `read-file` | Auto | Read file contents |
| `write-file` | Approval | Create/overwrite files |
| `append-file` | Auto | Append to a file |
| `list-directory` | Auto | List directory contents |
| `watch-directory` | Auto | Monitor directory changes |
| `get-system-info` | Auto | Hostname, CPU, memory |
| `get-process-list` | Auto | Top 30 processes by memory |
| `execute-terminal` | Approval | Run shell commands |
| `open-url` | Auto | Open URL in browser |
| `http-request` | Approval | Make HTTP requests |
| `emit-hud-update` | Auto | Send data to HUD |
| `compact-memory` | Auto | LLM-assisted file summarization |

### Intelligence (20)

| Action | Safety | Description |
|--------|--------|-------------|
| `self-modify` | Approval | Modify M.A.I.'s own config/identity/policy |
| `self-evaluate` | Auto | Evaluate recent performance quality |
| `self-diagnose` | Auto | Run health checks on all subsystems |
| `self-repair` | Approval | Auto-repair detected issues |
| `adaptive-config` | Approval | Adjust runtime parameters |
| `remember` | Auto | Store info in long-term memory |
| `recall` | Auto | Retrieve memories by query |
| `forget` | Auto | Remove specific memories |
| `profile-update` | Auto | Update learned user profile |
| `learn-pattern` | Auto | Store recurring behavioral patterns |
| `create-skill` | Auto | Create reusable skills from action sequences |
| `optimize-skill` | Auto | Optimize existing skills |
| `rollback` | Approval | Revert to a previous system state |
| `semantic-recall` | Auto | Search memory files for relevant info |
| `search-files` | Auto | Search files by content pattern |
| `dry-run` | Auto | Simulate an action without executing |
| `run-macro` | Auto | Execute a named macro workflow |
| `search-conversations` | Auto | Full-text search conversation history |
| `schedule-task` | Auto | Schedule recurring tasks |
| `run-skill` | Auto | Execute a named skill |

### Device Control (6)

| Action | Safety | Description |
|--------|--------|-------------|
| `control-window` | Approval | Move/resize/focus/minimize/maximize/close windows |
| `input-inject` | Approval | Keyboard/mouse/scroll/shortcut injection |
| `system-setting` | Approval | Volume, brightness, WiFi, Bluetooth, DND, lock |
| `media-control` | Auto | Play/pause/skip/volume for media players |
| `screen-arrange` | Auto | Desktops, workspaces, multi-monitor |
| `notification-send` | Auto | Send system notifications |

### Extended (6)

| Action | Safety | Description |
|--------|--------|-------------|
| `screenshot-capture` | Auto | Capture screen screenshot |
| `clipboard-read` | Auto | Read system clipboard |
| `clipboard-write` | Auto | Write to system clipboard |
| `open-application` | Auto | Launch application by name |
| `get-gpu-info` | Auto | GPU info, temperature, utilization |
| `get-network-info` | Auto | Network interface info |

### Integration (3)

| Action | Safety | Description |
|--------|--------|-------------|
| `sandbox-execute` | Auto | 4-tier sandbox: native, process, docker, firejail |
| `device-control` | Auto | Discover/control devices, displays, audio, USB |
| `ui-adapt` | Auto | Self-adapt the HUD interface |

### Web & Vision (2)

| Action | Safety | Description |
|--------|--------|-------------|
| `web-search` | Auto | Multi-backend web search with ranked results |
| `web-scrape` | Auto | Fetch and extract readable content from web pages |
| `analyze-image` | Auto | VLM-powered image analysis (path or base64) |

### Browser Control (15 operations)

A single `browser-control` action with 15 operations for full browser automation via CDP.

| Operation | Safety | Description |
|-----------|--------|-------------|
| `discover` | Auto | Discover running browser instances |
| `list-browsers` | Auto | List all discovered browsers |
| `list-tabs` | Auto | List tabs across all browsers |
| `search-tabs` | Auto | Find tabs by title or URL pattern |
| `new-tab` | Auto | Open a new tab with optional URL |
| `close-tab` | Auto | Close a specific tab |
| `activate-tab` | Auto | Focus/bring a tab to front |
| `navigate` | Auto | Navigate a tab to a URL |
| `google-search` | Auto | Live Google search with result extraction |
| `screenshot` | Auto | Capture a tab screenshot |
| `get-content` | Auto | Extract readable page content |
| `extract-search-results` | Auto | Extract Google search result DOM elements |
| `evaluate-js` | Auto | Run JavaScript in the browser page |
| `browser-info` | Auto | Get browser version and capabilities |
| `stats` | Auto | Browser control session statistics |

### Email Access (10 operations)

A single `email-access` action with 10 operations for full email management via IMAP/SMTP.

| Operation | Safety | Description |
|-----------|--------|-------------|
| `list-accounts` | Auto | List configured email accounts |
| `list-folders` | Auto | List IMAP folders for an account |
| `list-messages` | Auto | List messages in a folder |
| `get-message` | Auto | Read a specific email message |
| `search` | Auto | Search messages by query (IMAP SEARCH) |
| `unread` | Auto | Get unread message count |
| `send` | Auto | Send an email (text or HTML) |
| `delete` | Auto | Delete a message |
| `mark-read` | Auto | Mark a message as read |
| `stats` | Auto | Email access statistics |

## Voice System

M.A.I. supports a multi-backend voice pipeline with automatic fallback chains.

### Text-to-Speech (TTS) — Priority Order

| Backend | Quality | Speed | License | Notes |
|---------|---------|-------|---------|-------|
| **Kokoro** (local) | MOS ~4.2 | Fast | Apache 2.0 | 82M params, best quality, requires Kokoro binary or ONNX runtime |
| **Piper** (local) | MOS ~3.8 | Fast | MIT | 200M+ params, good quality, requires Piper binary |
| **HTTP TTS** (remote) | Varies | Network | — | Any HTTP TTS endpoint (e.g., Coqui, Bark server) |

### Speech-to-Text (STT) — Priority Order

| Backend | Speed | Accuracy | Notes |
|---------|-------|----------|-------|
| **Moonshine** (local) | 5x Whisper | Good for short utterances | ~200MB, ONNX runtime, MIT license, optimized for real-time |
| **Whisper** (local/remote) | Standard | High accuracy | ~1GB, supports HTTP endpoint or local model |

### Configuration

```json
{
  "audio": {
    "stt": {
      "backend": "moonshine",
      "enabled": true
    },
    "tts": {
      "backend": "kokoro",
      "enabled": true
    },
    "wakeWord": {
      "enabled": true,
      "keyword": "mai"
    }
  }
}
```

### Environment Variables

```
KOKORO_BIN=/path/to/kokoro          # Kokoro binary or "onnx"
KOKORO_MODEL=/path/to/model.onnx    # Kokoro voice model
KOKORO_CONFIG=/path/to/config.json  # Model config
MOONSHINE_MODEL_DIR=/path/to/models # Moonshine STT model directory
```

## HUD WebSocket Protocol

### Outbound Channels (Agent -> HUD)

| Channel | Payload | Description |
|---------|---------|-------------|
| `jarvis_speech` | `{ text: string }` | Conversational output |
| `activity_log` | `{ message: string, level: "info"|"warn"|"error" }` | Activity feed |
| `system_metrics` | `{ cpu: number, memory: number, disk: number }` | System stats |
| `threat_level` | `{ level: "green"|"yellow"|"orange"|"red", detail?: string }` | Security status |
| `reactor_pulse` | `{ power: number, status: string }` | Agent heartbeat |
| `gpu_stats` | `{ temperature, utilization, memory_used, memory_total }` | GPU stats |
| `device_connected` | `{ deviceId, deviceName, channel }` | New device paired |
| `device_disconnected` | `{ deviceId, reason }` | Device disconnected |
| `gateway_message` | `{ channel, from, text }` | External message received |
| `notification_incoming` | `{ source, title, body, timestamp }` | Notification received |
| `ambient_listening` | `{ active, transcript, confidence }` | Wake word / speech detected |
| `tunnel_status` | `{ active, method, publicUrl }` | Cloud tunnel status |
| `analytics_snapshot` | `{ totalInteractions, messagesSent, actionsExecuted, errorRate }` | Analytics data |
| `sandbox_output` | `{ sessionId, command, stdout, stderr, exitCode }` | Sandbox command output |
| `sandbox_session_event` | `{ event, session }` | Sandbox session lifecycle |
| `device_event` | `{ deviceId, event, data }` | Device control events |
| `action_progress` | `{ action, status, progress }` | Long-running action progress |
| `browser_event` | `{ event, data }` | Browser control events (tab created, navigated, etc.) |
| `email_event` | `{ event, data }` | Email events (new mail, sent, etc.) |
| `bg_activity` | `{ task, status, detail }` | Background task activity |

### Inbound Messages (HUD -> Agent)

```json
{ "type": "user_input", "text": "Hello M.A.I." }
{ "type": "approval_response", "approved": true }
{ "type": "device_control", "action": "control-window", "params": { "operation": "maximize" } }
{ "type": "notification_action", "source": "gmail", "action": "mark_read", "id": "..." }
{ "type": "macro_trigger", "name": "deploy", "variables": { "env": "production" } }
{ "type": "conversation_search", "query": "Docker configuration", "limit": 10 }
```

## HTTP API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send a message to the agent |
| `POST` | `/api/approve` | Approve/reject a pending action |
| `GET` | `/api/status` | System status (running, loops, messages) |
| `GET` | `/api/audit` | Recent audit log (last 100 entries) |
| `GET` | `/api/health` | Subsystem health check |
| `GET` | `/api/files?dir=&hidden=` | File listing with metadata |
| `GET` | `/api/network` | Network interface stats |
| `POST` | `/api/voice-call` | Toggle voice call state |

---

## Quick Start

## Quick Start

### Prerequisites

- **Node.js** >= 18 (tested with 18.x, 20.x, 22.x, 24.x)
- **npm** (comes with Node.js)
- **An LLM endpoint** — at least one of:
  - [Ollama](https://ollama.ai/) (local, free, recommended for getting started)
  - OpenAI API key
  - Anthropic API key
  - NVIDIA NIM API key
  - Any OpenAI-compatible endpoint

### Installation

#### Option 1: Local Development Setup (Recommended)

```bash
# Clone the repository
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system

# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify installation
npm run cli -- --help
```

#### Option 2: Global Installation

```bash
# Clone and install globally
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system
npm install
npm run build
npm install -g .

# Verify installation
mai --help
```

### Configuration

#### Step 1: Create Environment File

```bash
cp .env.example .env
```

#### Step 2: Configure LLM Provider

Edit `.env` with your LLM settings. Choose ONE provider:

**Local Ollama (Default - Free):**
```bash
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.2
LLM_PROVIDER=ollama
```

> **Note:** Install Ollama from [ollama.ai](https://ollama.ai) and pull a model: `ollama pull llama3.2`

**Ollama Cloud:**
```bash
LLM_BASE_URL=https://api.ollama.ai/v1
LLM_API_KEY=oll-cloud-xxxxxxxxxxxxxxxx
LLM_MODEL=llama3.2
LLM_PROVIDER=ollama-cloud
```

**OpenAI:**
```bash
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-your-key-here
LLM_MODEL=gpt-4o-mini
LLM_PROVIDER=openai
```

**NVIDIA NIM:**
```bash
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_API_KEY=nvapi-your-key-here
LLM_MODEL=meta/llama3-70b-instruct
LLM_PROVIDER=nvidia
```

**Anthropic:**
```bash
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_API_KEY=sk-ant-your-key-here
LLM_MODEL=claude-3-haiku-20240307
LLM_PROVIDER=anthropic
```

#### Step 3: Optional Features Configuration

**Browser Control** (Chrome DevTools Protocol):
Launch Chrome/Brave with remote debugging:
```bash
google-chrome --remote-debugging-port=9222
# or
brave-browser --remote-debugging-port=9223
```

**Email Access** (Gmail/Outlook):
Add to `harness.config.json`:
```json
{
  "email": {
    "enabled": true,
    "accounts": [{
      "id": "gmail-primary",
      "host": "imap.gmail.com",
      "port": 993,
      "smtpHost": "smtp.gmail.com",
      "smtpPort": 465,
      "username": "you@gmail.com",
      "password": "xxxx xxxx xxxx xxxx"
    }]
  }
}
```

**Gateway Channels** (Telegram, WhatsApp, SMS, SIP):
Add to `.env`:
```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TWILIO_ACCOUNT_SID=ACxxxxxx
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890
```

### Running M.A.I.

#### CLI Mode (Interactive Terminal)

```bash
# Using npm
npm run cli

# Using compiled binary
node dist/index.js

# If installed globally
mai
```

#### Server Mode (HUD + WebSocket + API + Chat PWA)

```bash
# Using npm
npm start

# Using compiled binary
node dist/server.js
```

Then open in your browser:
- **HUD Frontend:** http://localhost:3000
- **Chat PWA:** http://localhost:3000/chat/
- **Settings:** http://localhost:3000/settings/
- **Mission Control:** http://localhost:3000/mission-control/
- **Memory Observatory:** http://localhost:3000/memory-obs/
- **MCP Manager:** http://localhost:3000/mcp-manager/
- **WebSocket:** ws://localhost:8080
- **API Status:** http://localhost:3000/api/status

### Verification & Diagnostics

Run the System Doctor to verify everything is working:

```bash
# CLI command
npm run cli -- doctor

# Or with JSON output
npm run cli -- doctor --json
```

The doctor checks:
- ✅ Runtime environment (Node version, paths)
- ✅ Configuration validity
- ✅ Provider connectivity
- ✅ Model availability
- ✅ Memory health
- ✅ Gateway channels
- ✅ MCP servers
- ✅ Browser control
- ✅ Email access
- ✅ Policy validity
- ✅ Security configuration

### First Steps

1. **Start M.A.I.** in server mode: `npm start`
2. **Open HUD:** Navigate to http://localhost:3000
3. **Configure Settings:** Go to Settings → Models to verify your LLM provider
4. **Test Chat:** Send a message like "What can you do?" or "Show me your tools"
5. **Explore UI:** Check Mission Control, Memory Observatory, and MCP Manager
6. **Run Diagnostics:** Use `mai doctor` to verify system health

### Next Steps

- **Read Documentation:**
  - [INSTALLATION.md](./INSTALLATION.md) — Complete installation guide
  - [QUICK_START.md](./QUICK_START.md) — Quick start tutorial
  - [DEVELOPMENT.md](./DEVELOPMENT.md) — Development setup and testing
  - [PHASE4_COMPLETE.md](./PHASE4_COMPLETE.md) — Production readiness report

- **Configure Advanced Features:**
  - MCP servers integration
  - Multi-channel gateway (Telegram, WhatsApp)
  - Browser automation
  - Email management
  - Custom macros and skills

- **Security & Policy:**
  - Review `agent/policy.md` for security rules
  - Configure approval requirements for dangerous actions
  - Set up secret management via SecretBroker

---

## Advanced Configuration

For detailed configuration of advanced features, see [INSTALLATION.md](./INSTALLATION.md):

### Browser Control (Chrome DevTools Protocol)

M.A.I. can control Chrome/Brave browsers via CDP for web automation, search, and content extraction.

**Setup:**
1. Launch browser with remote debugging: `google-chrome --remote-debugging-port=9222`
2. Configure in `harness.config.json`:
```json
{
  "browserControl": {
    "enabled": true,
    "autoDiscover": true,
    "defaultPorts": [9222, 9223, 9224, 9225],
    "screenshotDir": "./vault/browser-screenshots"
  }
}
```

**Capabilities:** Discover browsers, list/search tabs, navigate, Google search, screenshots, content extraction, JavaScript execution.

### Email Access (IMAP/SMTP)

Full email management with zero external dependencies using Node.js TLS sockets.

**Setup:** Add to `harness.config.json`:
```json
{
  "email": {
    "enabled": true,
    "accounts": [{
      "id": "gmail-primary",
      "label": "Gmail",
      "host": "imap.gmail.com",
      "port": 993,
      "smtpHost": "smtp.gmail.com",
      "smtpPort": 465,
      "username": "you@gmail.com",
      "password": "xxxx xxxx xxxx xxxx"
    }],
    "maxMessagesPerFetch": 20
  }
}
```

> **Note:** For Gmail, use an [App Password](https://myaccount.google.com/apppasswords) (16-character string).

### Gateway Channels (Multi-Device Access)

Access M.A.I. from Telegram, WhatsApp, SMS, SIP voice calls, and webhooks.

**Setup:** Add to `.env`:
```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TWILIO_ACCOUNT_SID=ACxxxxxx
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_SID=whatsapp-sid
SIP_SERVER=sip:provider.com
SIP_USER=username
SIP_PASS=password
```

### MCP Integration (Model Context Protocol)

Connect to external MCP servers for extended tools and capabilities.

**Setup:** Configure MCP servers in Settings → MCP or via `harness.config.json`.

### Cloud Tunnel (Remote Access)

Expose M.A.I. securely via Cloudflare Tunnel, Ngrok, or WireGuard.

**Setup:** Add to `.env`:
```bash
TUNNEL_METHOD=cloudflare
CLOUDFLARE_TUNNEL_TOKEN=your-token
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Start server mode (HTTP + WS + HUD) |
| `npm run cli` | Start CLI REPL mode |
| `npm run dev` | Watch mode (auto-recompile on changes) |
| `npx mai --help` | Show CLI help (if installed globally) |
| `npx mai doctor` | Run system diagnostics |
| `npx mai config get <path>` | Get configuration value |
| `npx mai config set <path> <value>` | Set configuration value |
| `npx mai policy check <action.json>` | Simulate policy decision |
| `npx mai task list` | List active tasks |
| `npx mai task cancel <id>` | Cancel a running task |
| `npx mai approvals list` | List pending approvals |
| `npx mai mcp list` | List MCP servers |
| `npx mai memory search <query>` | Search memory |
| `npx mai audit list` | View audit log |

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npx vitest tests/policy-engine.test.ts

# Run tests with coverage
npx vitest --coverage

# Run security tests
npx vitest tests/security.test.ts
```

## Customizing M.A.I.

### Change the Agent's Personality

Edit `agent/identity.md`. The system prompt is assembled from this file at runtime.

### Adjust Security Policy

Edit `agent/policy.md`. The YAML frontmatter controls:
- `deny_commands` — substring patterns blocked in terminal commands
- `allow_network` — hostname allowlist for HTTP requests (supports subdomains)
- `auto_approve` — actions that run without confirmation
- `require_approval` — actions that need user confirmation

### Add Custom Actions

1. Create `src/actions/primitives/my-action.ts`:
   ```typescript
   export async function myAction(action: Action, ctx: ActionContext): Promise<ActionResult>
   ```
2. Register it in `src/actions/index.ts`:
   ```typescript
   this.register("my-action", myAction);
   ```
3. Add the type to `ActionName` in `src/types/index.ts`
4. Document it in `agent/tools/catalog.md`

### Create Macros

Create a `.yml` file in the `macros/` directory:

```yaml
name: deploy
description: Run deployment pipeline
trigger: deploy
steps:
  - action: execute-terminal
    params:
      command: npm run test
  - action: execute-terminal
    params:
      command: npm run build
  - action: notification-send
    params:
      title: Deploy Complete
      body: "Build and tests passed"
variables:
  - name: env
    default: staging
```

Execute via: `run-macro` action, or type the trigger word in chat.

### Use the Chat PWA

1. Start M.A.I. in server mode
2. Open http://localhost:3000/chat/ on your phone or desktop browser
3. Click "Install" to add it as a native app (PWA)
4. Chat with M.A.I. from any device

## Project Structure

```
src/
  types/
    index.ts                    # Single source of truth for all interfaces
  core/
    constants.ts                 # Path constants & safety limits
    ContextAssembler.ts          # Reads MD brain files, builds system prompt
    ResponseParser.ts            # Extracts ```action blocks from LLM output
    AgentLoop.ts                # 7-phase loop (nervous system)
    AuditLogger.ts              # Audit trail logging
    SelfImprovementEngine.ts    # Self-evaluation, diagnosis, repair
    ProactiveEngine.ts          # Condition-based trigger system
    CircuitBreaker.ts           # Failure protection
    IntentClassifier.ts         # Intent classification
    ToneAdapter.ts              # Adaptive tone/responses
    UserModel.ts                # User preference learning
    MultiProvider.ts            # Multi-provider LLM routing
    ToolSchema.ts               # Tool schema generation for function calling
    orchestrator.ts             # Multi-step orchestration
    VisionAnalyzer.ts           # VLM image analysis
    LlmBudget.ts                # Token budget management
    eventBus.ts                 # Internal event bus
    agentState.ts               # Agent state machine
  actions/
    index.ts                    # ActionRegistry (49 primitives, 6 groups)
    primitives/
      # Core (12)
      read-file.ts, write-file.ts, append-file.ts
      list-directory.ts, watch-directory.ts
      get-system-info.ts, get-process-list.ts
      execute-terminal.ts, open-url.ts, http-request.ts
      emit-hud-update.ts, compact-memory.ts
      # Intelligence (20)
      self-modify.ts, self-evaluate.ts, self-diagnose.ts
      self-repair.ts, adaptive-config.ts
      remember.ts, recall.ts, forget.ts, profile-update.ts
      learn-pattern.ts, create-skill.ts, optimize-skill.ts
      rollback.ts, semantic-recall.ts, search-files.ts
      dry-run.ts, run-macro.ts, search-conversations.ts
      schedule-task.ts, run-skill.ts
      # Device Control (6)
      control-window.ts, input-inject.ts, system-setting.ts
      media-control.ts, screen-arrange.ts, notification-send.ts
      # Extended (6)
      screenshot-capture.ts, clipboard-read.ts, clipboard-write.ts
      open-application.ts, get-gpu-info.ts, get-network-info.ts
      # Integration (3)
      sandbox-execute.ts, device-control.ts, ui-adapt.ts
      # Web & Vision (2)
      web-search.ts, web-scrape.ts, analyze-image.ts
      # Browser Control (1 action, 15 operations)
      browser-control.ts
      # Email Access (1 action, 10 operations)
      email-access.ts
  security/
    PolicyEngine.ts             # YAML policy firewall
    SecurityMonitor.ts           # Threat monitoring
  ui/
    HudServer.ts                # WebSocket server (21 channels)
    gateway.ts                  # Embedded web console (UIGateway)
  server.ts                     # Server entry (HTTP + WS + all subsystems)
  index.ts                      # CLI entry (REPL with slash commands)
  cli.ts                        # CLI command handler
  startup.ts                    # Application bootstrap & subsystem init
  config.ts                     # Config types and defaults
  config/
    loader.ts                   # Config file CRUD
    env.ts                      # .env file handling
  gateway/                      # Multi-device gateway (5 channels)
    GatewayManager.ts
    channels/ SmsChannel.ts, TelegramChannel.ts,
              WhatsAppChannel.ts, SipChannel.ts, WebhookChannel.ts
  auth/                          # Authentication & access control
    AuthManager.ts, SessionManager.ts
    DevicePairing.ts, permissions.ts, middleware.ts
  events/                        # Event mesh pub/sub
    EventMesh.ts, DeviceEventSource.ts
  notifications/                 # Notification aggregator
    NotificationAggregator.ts
    sources/ GmailSource.ts, GitHubSource.ts,
             SlackSource.ts, CalendarSource.ts, RssSource.ts
  macros/                        # Macro engine
    MacroEngine.ts, MacroStore.ts
  memory/
    ConversationIndex.ts          # Full-text conversation search
    MiniObsidianMemory.ts        # Obsidian-style knowledge base
    EmbeddingStore.ts            # Vector embeddings
  network/
    TunnelManager.ts, RelayProxy.ts
  analytics/
    AnalyticsEngine.ts, AnalyticsApiRoutes.ts
  sandbox/
    SandboxRunner.ts, SideEffectAnalyzer.ts
  sandbox2/                      # Next-gen sandbox subsystem
    SandboxManager.ts            # Session-based sandbox orchestration
    DeviceControlManager.ts      # Device discovery and control
    BrowserControlManager.ts     # CDP-based browser automation
    EmailManager.ts              # IMAP/SMTP email access
  audio/                         # Voice pipeline
    AudioAdapter.ts              # Base adapter interfaces
    AudioRegistry.ts             # Backend registry
    KokoroTtsAdapter.ts          # Kokoro TTS (82M params, Apache 2.0)
    PiperTtsAdapter.ts           # Piper TTS (MIT)
    HttpTtsAdapter.ts            # HTTP TTS (remote endpoint)
    MoonshineSttAdapter.ts       # Moonshine STT (5x faster than Whisper)
    WhisperSttAdapter.ts         # Whisper STT (high accuracy)
    AmbientMode.ts               # Always-listening / wake word
    wakeWord.ts                  # Wake word detection
    audioLoader.ts               # Auto-configure voice pipeline
  onboarding/                    # Setup wizard
    onboarding.ts                # Main orchestrator (legacy)
    validation.ts                # Smoke tests
    sections/                    # Wizard sections
      welcome.ts, ollama.ts, obsidian.ts
      permissions.ts, startup.ts, wakeWord.ts
  watchers/                      # File/device/resource watchers
    fileWatcher.ts, deviceWatcher.ts, resourceWatcher.ts
  harness/                      # Model adapters
    ModelAdapter.ts              # Base interface
    OllamaAdapter.ts             # Ollama local
    OpenAiAdapter.ts             # OpenAI / compatible
    AnthropicAdapter.ts          # Anthropic Claude
    CloudModelAdapter.ts         # Cloud-hosted models
    OpenCodeAdapter.ts           # OpenCode models
    ModelAdapterFactory.ts       # Auto-select adapter
    SkillRunner.ts               # Skill execution
    ObsidianConnector.ts         # Vault integration
  skills/                        # Skill system
    SandboxedSkillRunner.ts      # Sandboxed skill execution
    skillAdaptationEngine.ts     # Skill optimization
    skillFeedback.ts             # Skill performance feedback
  workspace/
    WorkspaceAgent.ts            # Workspace management

agent/                           # Brain files (markdown-first)
  identity.md, instructions.md, memory.md, policy.md
  models.md, voice.md
  tools/ catalog.md, list.md
  workflows/ background.md

memory/                          # Persistent memory store
state/                           # Runtime state (JSON, JSONL, logs)
macros/                          # User-defined macro workflows
skills/                          # Skill definitions (.yml)
vault/                           # Knowledge vault
public/
  index.html                      # HUD frontend (Iron Man console)
  chat/                           # Chat PWA (mobile-first)
    index.html, app.js, styles.css
    manifest.json, sw.js

.env.example                     # Configuration template
harness.config.json               # Runtime config
tsconfig.json
package.json
```

## The 7-Phase Agent Loop

```
ASSEMBLE -> Build system prompt from identity.md + policy.md + catalog.md
INFER    -> Send messages to LLM via OpenAI SDK
PARSE    -> Extract ```action JSON blocks from response
ENFORCE  -> Validate each action against PolicyEngine (6 rules)
EXECUTE  -> Run approved actions via ActionRegistry (60s timeout)
STREAM   -> Send results to HUD via WebSocket channels
LOOP     -> Inject results back as context, repeat if actions were found

Safety: Max 20 iterations. Pending approval pauses loop.
```

## Policy Firewall (6 Rules)

1. **Auto-approved actions** — sandbox-execute, device-control, ui-adapt, dry-run, browser-control, email-access always pass
2. **Read-only always allowed** — read-file, list-directory, get-system-info, get-process-list
3. **Deny commands** — substring match against terminal command field
4. **Allow network** — hostname allowlist with subdomain support (includes Google, Gmail, Outlook)
5. **Require approval** — gates that pause the loop for WebSocket confirmation
6. **Known actions** — if registry recognizes it, allow
7. **Unknown blocked** — deny everything else

## Dependencies

M.A.I. has a minimal dependency footprint:

| Package | Purpose |
|---------|---------|
| `openai` | LLM SDK (OpenAI-compatible) |
| `ws` | WebSocket server + CDP client |
| `chalk` | Terminal colors |
| `dotenv` | .env file loading |
| `gray-matter` | YAML frontmatter parsing |
| `js-yaml` | YAML parsing |
| `zod` | Schema validation |

**Total: 7 runtime dependencies.** Browser control and email use zero additional packages — built on raw Node.js `tls`, `net`, and `child_process`.

## Troubleshooting

### Common Issues

**LLM Connection Failed:**
- Verify your LLM provider is running (e.g., `ollama serve` for local Ollama)
- Check `LLM_BASE_URL` and `LLM_API_KEY` in `.env`
- Test connectivity: `curl http://localhost:11434/api/tags` (for Ollama)

**Model Not Found:**
- Pull the model: `ollama pull llama3.2`
- Verify model name matches exactly in `.env`
- Check available models: `ollama list` or API endpoint

**Browser Control Not Working:**
- Launch Chrome/Brave with `--remote-debugging-port=9222`
- Verify port is open: `lsof -i :9222`
- Check `harness.config.json` has `browserControl.enabled: true`

**Email Access Failing:**
- Use App Password for Gmail (not regular password)
- Verify IMAP/SMTP host and port
- Check firewall allows outbound connections on ports 993 (IMAP) and 465 (SMTP)

**WebSocket Connection Lost:**
- Refresh the HUD page
- Check server is running: `npm start`
- Verify port 8080 is not blocked

**Policy Blocking Actions:**
- Review `agent/policy.md` for deny/approval rules
- Use `mai policy check action.json` to simulate
- Approve pending actions via HUD or CLI

**High Memory Usage:**
- Check background tasks: `mai task list`
- Cancel unnecessary tasks: `mai task cancel <id>`
- Reduce context size in config

### Getting Help

- **System Diagnostics:** Run `mai doctor` for comprehensive health check
- **Audit Logs:** View recent events with `mai audit list`
- **Documentation:** See [DEVELOPMENT.md](./DEVELOPMENT.md) for debugging guide
- **Issues:** Report bugs on GitHub

---

## License

MIT
