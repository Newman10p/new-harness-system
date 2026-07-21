# Jarvis AI Harness

A living, agentic AI operator framework with event-driven workflows, multi-provider model support, agentic tool calling, autonomous natural language execution, Obsidian vault memory, audio (STT/TTS), wake-word detection, sandboxed skill execution, security monitoring, and policy enforcement.

## Features

### � Autonomous Natural Language Engine
- **`jarvis auto --goal "..."`** - Express goals in plain English
- Model decomposes goals into actionable steps using available tools
- Step-by-step execution with error handling and graceful fallback

### 🔄 Event-Driven Agent Loop
- **EventBus** - Global event system for user input, file changes, resource state, device events, scheduled tasks, workflow updates
- **AgentState** - Tracks workflows, goals, devices, resource history, preferences
- **WorkflowEngine** - Sequential and parallel step execution with pause/resume/cancel steering
- **Natural Language Steering** - "pause summarizer", "resume monitor", "cancel workflow"

### 👁️ Background Watchers
| Watcher | Interval | Events Emitted |
|---------|----------|----------------|
| **FileWatcher** | Realtime (fs.watch) | `file_changed` when vault/skills files change |
| **ResourceWatcher** | Every 30s | `resource_state` with CPU/RAM metrics, auto-throttle |
| **DeviceWatcher** | Every 60s | `device_event` when new USB devices detected |

### 🛠️ Agentic Tool System (19 Actions)
| Category | Actions |
|----------|---------|
| **Code** | `code.generate` |
| **File System** | `fs.create`, `fs.write`, `fs.append`, `fs.read`, `fs.list`, `fs.delete` |
| **Terminal** | `terminal.exec` - Safe execution with destructive pattern blocking |
| **PC Monitor** | `pc.monitor`, `pc.control` |
| **USB/Device** | `device.usb.list`, `device.usb.info`, `device.remote.call` |
| **3D Simulation** | `sim3d.run` |
| **Network** | `net.fetch` |
| **Security** | `code.securityAudit`, `security.diagnostics` |
| **Vault/Memory** | `vault.search`, `vault.read`, `vault.write` |

### � Filesystem-First MD Spec (`agent/`)
```
agent/
  instructions.md          # Core identity and role
  policy.md                # Objectives and rules
  models.md                # Model provider options
  voice.md                 # STT/TTS configuration
  memory.md                # Obsidian memory integration
  tools/list.md            # Catalog all actions with safety tags
  workflows/background.md  # Background watcher descriptions
  skills/                  # Skill diaries (auto-generated)
```

### 🧩 Self-Adapting Skills
- **SkillFeedbackStore** - Logs skill runs with outcomes, corrections, ratings
- **SkillAdaptationEngine** - Analyzes feedback, generates conversational proposals
- Agent says: *"I've noticed my code skill often needs manual fixes. Shall I update it?"*
- Sandboxed changes with approval workflow

### 📓 Mini Obsidian Memory
- **MiniObsidianMemory** - Full vault indexing, search, read/write
- **Memory Folder** - `AgentMemory/` subfolder for session summaries, decisions, plans
- **Vault Actions** - `vault.search`, `vault.read`, `vault.write` registered in action registry
- Agent uses memory for context before planning

### 🤖 Multi-Provider Model Support
- Ollama Local, Ollama Cloud, OpenAI, NVIDIA NIM, Lightning AI, NeMo Proxy, Anthropic
- **OpenCode.ai** - Connect to any OpenCode-compatible server
- Priority chain with credit budgeting and automatic fallback

### 🎤 Audio (STT/TTS)
- Built-in (Whisper + HTTP) or custom endpoints
- Modes: `builtIn`, `custom`, `disabled`

### 🔒 Security & Policy
- SecurityMonitor detects abnormal patterns
- PolicyEngine with objectives + rules, injectable as system prompts
- Destructive command blocking

### 📦 Skill System
- YAML/JSON skill definitions with sandboxed execution
- Self-improving skills with approval workflow

## Installation

### Prerequisites
- Node.js >= 18, npm

### Quick Start
```bash
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system
npm install
npm run build
npm run cli -- init  # Run setup wizard
```

### Global CLI
```bash
npm install -g .
jarvis init
```

## CLI Commands

### Setup
```bash
jarvis init              # Run onboarding wizard
jarvis provider setup    # Configure API keys for providers (OpenAI, Anthropic)
jarvis gateway setup     # Configure gateway settings
```

### Chat & Autonomous
```bash
jarvis chat --msg "Hello"                           # Direct chat
jarvis auto --goal "check system resources"         # Autonomous execution
jarvis run "create a note about AI safety"          # Shorthand for auto
jarvis work --task "Create a todo list in my vault" # Workspace agent
```

### Workflow Steering (Natural Language)
```bash
jarvis auto --goal "pause the background monitor"   # Pause workflow
jarvis auto --goal "resume summarizer"              # Resume workflow
jarvis auto --goal "cancel all workflows"           # Cancel workflows
```

### Skills
```bash
jarvis list-skills
jarvis run-skill --skill path/to/skill.yml
jarvis run-sandbox --skill path/to/skill.yml
jarvis promote-skill --skill path/to/skill.yml
```

### Tools / Actions
```bash
jarvis tools list                                   # List all 19 actions
jarvis tools run pc.monitor                         # Run an action
jarvis tools run vault.search --json '{"query":"AI"}'
```

### Providers
```bash
jarvis provider list                                # List providers
jarvis provider use ollama_local                    # Switch provider
jarvis provider setup                               # Configure API keys interactively
jarvis providers                                    # Show provider info
```

### Gateway
```bash
jarvis gateway start                                # Start web console
jarvis gateway status                               # Check gateway status
jarvis gateway setup                                # Configure gateway settings
```

### Audio
```bash
jarvis audio mode                                   # Show mode
jarvis listen --file input.wav                      # STT
jarvis speak --text "Hello" --out out.wav           # TTS
```

### Vault / Memory
```bash
jarvis inspect-vault                                # List notes
jarvis create-note --title "Note" --filename note.md
```

### System
```bash
jarvis pc monitor                                   # CPU/RAM/disk
jarvis security status                              # Alerts
```

## Configuration

### Model Providers (`harness.config.json`)
```json
{
  "modelSection": {
    "defaultProvider": "ollama_local",
    "providers": {
      "ollama_local": { "type": "ollamaLocal", "baseUrl": "http://localhost:11434", "model": "llama3.2" },
      "openai_compatible": { "type": "openaiStyle", "source": "openai", "baseUrl": "https://api.openai.com/v1", "model": "gpt-4o-mini", "apiKeyEnv": "OPENAI_API_KEY" },
      "nvidia_nim": { "type": "openaiStyle", "source": "nvidia_nim", "baseUrl": "https://integrate.api.nvidia.com/v1", "model": "meta/llama3-70b-instruct", "apiKeyEnv": "NVIDIA_NIM_API_KEY" },
      "anthropic": { "type": "anthropic", "model": "claude-3-haiku-20240307", "apiKeyEnv": "ANTHROPIC_API_KEY" }
    }
  }
}
```

### Audio
```json
{
  "audio": { "mode": "builtIn", "stt": { "backend": "whisper", "enabled": true }, "tts": { "backend": "http", "enabled": false, "endpoint": "http://localhost:5002/api/tts" } }
}
```

### Policy
```json
{
  "policy": {
    "objectives": ["Serve as a personal operator for code, files, tools, and automation.", "Preserve system stability, privacy, and resource health."],
    "rules": ["Do not execute destructive actions without explicit confirmation.", "Do not assist with unauthorized intrusion, exploitation, or attacks."]
  }
}
```

### Environment Variables (`.env`)
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
NVIDIA_NIM_API_KEY=nvapi-...
PICOVOICE_ACCESS_KEY=...
OLLAMA_CLOUD_API_KEY=...
```

## Project Structure

```
src/
  cli.ts                     # Main CLI entrypoint
  startup.ts                 # Wake-word startup wrapper
  config.ts                  # Configuration types + loader

  core/
    eventBus.ts              # Global event system
    agentState.ts            # Workflow/goal/device/resource tracking
    workflowEngine.ts        # Sequential/parallel workflows with steering
    agentLoop.ts             # Event-driven agent loop
    autonomous.ts            # Autonomous natural language engine
    orchestrator.ts          # Central orchestrator (actions + policy + security)
    interaction.ts           # Unified interaction pipeline

  actions/
    types.ts, index.ts       # Action interfaces + registration hub
    code.generate.ts         # Code generation
    fs.ts                    # File operations (6 actions)
    terminal.ts              # Safe terminal execution
    pc.ts                    # PC monitor + control
    device.ts                # USB + remote calls
    sim3d.ts                 # 3D simulation
    network.ts               # HTTP fetch
    security.ts              # Code audit + diagnostics
    vault.ts                 # Vault search/read/write

  watchers/
    fileWatcher.ts           # Real-time file monitoring
    resourceWatcher.ts       # Periodic CPU/RAM checks
    deviceWatcher.ts         # USB device scanning

  registry/
    actionsRegistry.ts       # Central action registry
    providersRegistry.ts     # Model provider registry

  security/
    SecurityMonitor.ts       # Security monitoring + alerts

  policy/
    PolicyEngine.ts          # Objectives + rules engine

  memory/
    MiniObsidianMemory.ts    # Obsidian-based memory layer

  harness/
    ModelAdapter.ts          # Model interface
    OllamaAdapter.ts         # Local Ollama
    CloudModelAdapter.ts     # Remote Ollama with credits
    OpenAiAdapter.ts         # OpenAI-compatible
    AnthropicAdapter.ts      # Anthropic Claude
    ModelAdapterFactory.ts   # Factory + priority chain
    SkillRunner.ts           # Skill execution
    ObsidianConnector.ts     # Vault I/O

  audio/
    AudioAdapter.ts          # STT/TTS interfaces
    AudioRegistry.ts         # Audio adapter registry
    WhisperSttAdapter.ts     # Whisper STT
    HttpTtsAdapter.ts        # HTTP TTS
    wakeWord.ts              # Wake-word detection

  skills/
    SandboxedSkillRunner.ts  # Sandbox execution
    skillFeedback.ts         # Skill run logging
    skillAdaptationEngine.ts # Self-adaptation analysis

  ui/
    banner.ts                # Rainbow banner
    workspace/
      WorkspaceAgent.ts      # Workspace automation

agent/
  instructions.md            # Core identity
  policy.md                  # Objectives + rules
  models.md                  # Provider docs
  voice.md                   # Audio docs
  memory.md                  # Memory docs
  tools/list.md              # Tool catalog
  workflows/background.md    # Background watchers

skills/                      # User skill definitions
vault/                       # Obsidian vault
harness.config.json          # Configuration
```

## Architecture Overview

```
User Input → CLI → Orchestrator → ActionRegistry → Execute Actions
                ↓                     ↓
           EventBus ←────────── Watchers (File, Resource, Device)
                ↓
           AgentLoop → WorkflowEngine → AgentState
                ↓
           AutonomousAgent → ModelAdapter → Plan & Execute
                ↓
           SkillAdaptationEngine → FeedbackStore → Sandboxed Proposals
```

## Development

```bash
npm run build    # Compile TypeScript
npm run dev      # Watch mode
npm run cli      # Run CLI
npm start        # Start with wake-word listener
```

## License

MIT