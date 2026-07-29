# M.A.I. — Multiple Array Intelligence

**Markdown-First / Model-as-an-Engine** agentic AI harness. The system reads markdown files for identity, policy, and tools, calls an OpenAI-compatible LLM, parses fenced ` ```action ` JSON blocks from responses, validates them against a YAML policy firewall, executes 12 primitives, and streams results to a WebSocket-connected Iron Man-style HUD frontend.

## Architecture

```
User Input (CLI or WebSocket)
    │
    ▼
┌───────────────────────────────────────────┐
│              Agent Loop                   │
│  (7-Phase: Assemble → Infer → Parse →    │
│   Enforce → Execute → Stream → Loop)     │
│                                           │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  │
│  │ Context  │  │ Response │  │ Policy │  │
│  │Assembler │  │ Parser   │  │ Engine │  │
│  └────┬─────┘  └──────────┘  └───┬────┘  │
│       │                           │        │
│  ┌────▼───────────────────────────▼────┐  │
│  │         Action Registry             │  │
│  │  (12 primitives, 60s timeout)       │  │
│  └─────────────────────────────────────┘  │
└───────────────────┬───────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼                       ▼
   CLI Output          WebSocket (HUD)
   (terminal)         ws://localhost:8080
                            │
                            ▼
                     Frontend HUD
                  http://localhost:3000
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Markdown-First** | All business logic (identity, policy, tools) lives in `.md` files, not code. Edit behavior without recompiling. |
| **Action Protocol** | LLM communicates via ````action` fenced JSON blocks. Simple, debuggable, language-agnostic. |
| **Policy as Firewall** | YAML frontmatter in `policy.md` defines deny/allow/approval rules. Enforced before any execution. |
| **OpenAI SDK** | Compatible with OpenAI, Ollama, NVIDIA NIM, and any OpenAI-compatible endpoint. Single SDK, multiple providers. |
| **gray-matter** | Parses YAML frontmatter from markdown. Separates machine-readable config from human-readable prose. |
| **60s Hard Timeout** | Every action is race'd against a 60s timeout. The agent never hangs. |
| **Never-Throw Registry** | ActionRegistry.execute() always returns an ActionResult. No unhandled promise rejections. |

## Brain Files (Markdown-First Architecture)

```
agent/
  identity.md           # Who M.A.I. is, how to communicate
  policy.md             # YAML frontmatter: deny_commands, allow_network, require_approval
  tools/
    catalog.md          # Human-readable docs for all 12 actions

memory/
  context.md            # Accumulated long-term memory

state/
  inbox.md              # Event log (file watches, notifications)
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
  - "localhost"
  - "127.0.0.1"
require_approval:
  - "execute-terminal"
  - "write-file"
  - "http-request"
---
```

## 12 Action Primitives

| Action | Safety | Description |
|--------|--------|-------------|
| `read-file` | Auto | Read file contents |
| `list-directory` | Auto | List directory contents |
| `get-system-info` | Auto | Hostname, CPU, memory |
| `get-process-list` | Auto | Top 30 processes by memory |
| `append-file` | Auto | Append to a file |
| `watch-directory` | Auto | Monitor directory changes |
| `open-url` | Auto | Open URL in browser |
| `emit-hud-update` | Auto | Send data to HUD |
| `compact-memory` | Auto | LLM-assisted file summarization |
| `execute-terminal` | Approval | Run shell commands |
| `write-file` | Approval | Create/overwrite files |
| `http-request` | Approval | Make HTTP requests |

## HUD WebSocket Protocol

### Outbound Channels (Agent → HUD)

| Channel | Payload | Description |
|---------|---------|-------------|
| `jarvis_speech` | `{ text: string }` | Conversational output |
| `activity_log` | `{ message: string, level: "info"\|"warn"\|"error" }` | Activity feed |
| `system_metrics` | `{ cpu: number, memory: number, disk: number }` | System stats |
| `threat_level` | `{ level: "green"\|"yellow"\|"orange"\|"red", detail?: string }` | Security status |
| `reactor_pulse` | `{ power: number, status: string }` | Agent heartbeat |

### Inbound Messages (HUD → Agent)

```json
{ "type": "user_input", "text": "Hello M.A.I." }
{ "type": "approval_response", "approved": true }
```

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **npm** (comes with Node.js)
- **An LLM endpoint** — [Ollama](https://ollama.ai/) (local), OpenAI, or any OpenAI-compatible API

### 1. Clone & Install

```bash
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system
npm install
```

### 2. Configure LLM

Copy the example env file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your LLM settings:

**Local Ollama:**
```
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.2
LLM_PROVIDER=ollama
```

**OpenAI:**
```
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-your-key-here
LLM_MODEL=gpt-4o-mini
LLM_PROVIDER=openai
```

**NVIDIA NIM:**
```
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_API_KEY=nvapi-your-key-here
LLM_MODEL=meta/llama3-70b-instruct
LLM_PROVIDER=nvidia
```

### 3a. CLI Mode

```bash
npx tsx src/index.ts
# or after build:
npm run build && npm run cli
```

Type messages to chat. Use `/help` for commands.

### 3b. Server Mode (HUD + WebSocket)

```bash
npx tsx src/server.ts
# or after build:
npm run build && npm start
```

Then open:
- **HUD Frontend**: http://localhost:3000
- **WebSocket**: ws://localhost:8080

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Start server mode (HTTP + WS) |
| `npm run cli` | Start CLI REPL mode |
| `npm run dev` | Watch mode (auto-recompile) |

## Customizing M.A.I.

### Change the Agent's Personality

Edit `agent/identity.md`. The system prompt is assembled from this file at runtime.

### Adjust Security Policy

Edit `agent/policy.md`. The YAML frontmatter controls:
- `deny_commands` — substring patterns blocked in terminal commands
- `allow_network` — hostname allowlist for HTTP requests (supports subdomains)
- `require_approval` — actions that need user confirmation

### Add Custom Actions

1. Create `src/actions/primitives/my-action.ts` with the signature:
   ```typescript
   export async function myAction(action: Action, ctx: ActionContext): Promise<ActionResult>
   ```
2. Register it in `src/actions/index.ts`:
   ```typescript
   this.register("my-action", myAction);
   ```
3. Add the type to `ActionName` in `src/types/index.ts`
4. Document it in `agent/tools/catalog.md`

## Project Structure

```
src/
  types/
    index.ts               # Single source of truth for all interfaces
  core/
    constants.ts            # Path constants & safety limits
    ContextAssembler.ts     # Reads MD brain files, builds system prompt
    ResponseParser.ts       # Extracts ```action blocks from LLM output
    AgentLoop.ts           # 7-phase loop (nervous system)
  actions/
    index.ts               # ActionRegistry (Map-based, 12 primitives)
    primitives/
      execute-terminal.ts  # Shell command execution
      read-file.ts         # File reading
      write-file.ts        # File writing
      append-file.ts       # File appending
      list-directory.ts    # Directory listing
      watch-directory.ts   # Filesystem monitoring
      get-system-info.ts   # System info (os module)
      get-process-list.ts  # Process listing (ps aux)
      open-url.ts          # Browser URL opening
      http-request.ts      # HTTP requests (fetch)
      emit-hud-update.ts    # HUD broadcasting
      compact-memory.ts    # LLM-assisted memory compression
  security/
    PolicyEngine.ts        # YAML policy firewall (6 rules)
  ui/
    HudServer.ts           # WebSocket server (5 channels, approval flow)
  server.ts                # Server entry (HTTP + WS + AgentLoop)
  index.ts                 # CLI entry (REPL with slash commands)

agent/
  identity.md              # Agent identity & personality
  policy.md                # Security policy (YAML + markdown)
  tools/
    catalog.md             # Action documentation

memory/
  context.md               # Long-term accumulated memory

state/
  inbox.md                 # Event log

public/
  index.html               # HUD frontend (Iron Man console)

.env.example               # Configuration template
.gitignore
tsconfig.json
package.json
```

## The 7-Phase Agent Loop

```
ASSEMBLE → Build system prompt from identity.md + policy.md + catalog.md
INFER    → Send messages to LLM via OpenAI SDK
PARSE    → Extract ```action JSON blocks from response
ENFORCE  → Validate each action against PolicyEngine (6 rules)
EXECUTE  → Run approved actions via ActionRegistry (60s timeout)
STREAM   → Send results to HUD via WebSocket channels
LOOP     → Inject results back as context, repeat if actions were found

Safety: Max 20 iterations. Pending approval pauses loop.
```

## Policy Firewall (6 Rules)

1. **Read-only always allowed** — read-file, list-directory, get-system-info, get-process-list
2. **Deny commands** — substring match against terminal command field
3. **Allow network** — hostname allowlist with subdomain support
4. **Require approval** — gates that pause the loop for WebSocket confirmation
5. **Known actions** — if registry recognizes it, allow
6. **Unknown blocked** — deny everything else

## License

MIT
