# Jarvis AI Harness

A comprehensive, modular AI operator framework with multi-provider model support, agentic tool calling, autonomous natural language execution, Obsidian vault integration, audio (STT/TTS), wake-word detection, sandboxed skill execution, security monitoring, and policy enforcement.

## Features

### 🤖 Multi-Provider Model Support
- **Ollama Local** - Run models locally via `http://localhost:11434`
- **Ollama Cloud** - Remote Ollama-compatible endpoints with credit budgeting
- **OpenAI-Compatible** - OpenAI, NVIDIA NIM, Lightning AI, NeMo Proxy
- **Anthropic** - Claude models via official API
- **Mock Provider** - Canned responses for testing
- **Priority Chain** - Automatic fallback when credits exhausted or providers fail

### 🧠 Autonomous Natural Language Engine
- **`jarvis auto --goal "..."`** - Express goals in plain English
- Model decomposes goals into actionable steps using available tools
- Executes steps through the orchestrator with full policy/security awareness
- Step-by-step execution with error handling and graceful fallback

### 🛠️ Agentic Tool System (16+ Actions)
| Category | Actions |
|----------|---------|
| **Code** | `code.generate` - Generate code via model |
| **File System** | `fs.create`, `fs.write`, `fs.append`, `fs.read`, `fs.list`, `fs.delete` |
| **Terminal** | `terminal.exec` - Safe command execution with destructive pattern blocking |
| **PC Monitor** | `pc.monitor` - CPU/RAM/disk, `pc.control` - throttle/pause/resume |
| **USB/Device** | `device.usb.list`, `device.usb.info`, `device.remote.call` |
| **3D Simulation** | `sim3d.run` - Conditional on external simulators (blender, godot, webots) |
| **Network** | `net.fetch` - HTTP with domain allowlist |
| **Security** | `code.securityAudit`, `security.diagnostics` |

### 🔒 Security & Policy
- **SecurityMonitor** - Detects abnormal patterns (frequent terminal, high resource usage)
- **PolicyEngine** - Objectives + Rules system, injectable as model system prompts
- **Action logging** - All tool calls logged with timestamps
- **Safety levels** - Conservative / Balanced / Experimental
- **Destructive command blocking** - `rm -rf /`, `mkfs`, `dd` blocked by default

### 🎤 Audio (STT/TTS)
- **Built-in** - Whisper STT, HTTP TTS
- **Custom** - Configurable STT/TTS HTTP endpoints
- **Modes** - `builtIn`, `custom`, `disabled`
- **Wake Word** - Picovoice Porcupine integration

### 📓 Obsidian Vault Integration
- Read/write notes with YAML frontmatter
- List vault contents
- Create notes with metadata

### 📦 Skill System
- YAML/JSON skill definitions with `{{variable}}` templating
- Sandboxed execution with approval workflow
- Self-improving skills (sandboxed, requires user approval to promote)

### 🖥️ Workspace Automation
- `jarvis work --task "..."` - Let AI create/edit files in configured folders
- Path-safety: only operates within allowlisted directories
- Supports: create, read, edit, append, search, list, run commands

## Installation

### Prerequisites
- Node.js >= 18
- npm

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
jarvis --help
```

## CLI Commands

### Setup
```bash
jarvis init              # Run onboarding wizard
```

### Chat & Autonomous
```bash
jarvis chat --msg "Hello"                    # Direct chat with model
jarvis auto --goal "check system resources"  # Autonomous: plans & executes steps
jarvis run "create a note about AI safety"   # Shorthand for auto
```

### Skills
```bash
jarvis list-skills                           # List all skills
jarvis run-skill --skill path/to/skill.yml   # Execute a skill
jarvis run-sandbox --skill path/to/skill.yml # Run in sandbox
jarvis promote-skill --skill path/to/skill.yml  # Promote sandboxed changes
```

### Tools / Actions
```bash
jarvis tools list                            # List all registered actions
jarvis tools run pc.monitor                  # Run a specific action
jarvis tools run code.generate --json '{"language":"python","brief":"hello world"}'
```

### Providers
```bash
jarvis provider list                         # List configured providers
jarvis provider use ollama_local             # Switch default provider
jarvis providers                             # Show provider info
```

### Audio
```bash
jarvis audio mode                            # Show current audio mode
jarvis listen --file input.wav               # Speech-to-text
jarvis speak --text "Hello" --out out.wav    # Text-to-speech
```

### Vault
```bash
jarvis inspect-vault                         # List vault notes
jarvis create-note --title "My Note" --filename note.md --content "..."
```

### Workspace
```bash
jarvis work --task "Create a todo list in my vault"
```

### System
```bash
jarvis pc monitor                            # CPU/RAM/disk stats
jarvis security status                       # Security alerts and status
```

## Configuration

Configuration is stored in `harness.config.json`. Secrets (API keys) go in `.env`.

### Model Providers
```json
{
  "modelSection": {
    "defaultProvider": "ollama_local",
    "providers": {
      "ollama_local": {
        "type": "ollamaLocal",
        "baseUrl": "http://localhost:11434",
        "model": "llama3.2",
        "enabled": true
      },
      "openai_compatible": {
        "type": "openaiStyle",
        "source": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "apiKeyEnv": "OPENAI_API_KEY",
        "enabled": false
      },
      "nvidia_nim": {
        "type": "openaiStyle",
        "source": "nvidia_nim",
        "baseUrl": "https://integrate.api.nvidia.com/v1",
        "model": "meta/llama3-70b-instruct",
        "apiKeyEnv": "NVIDIA_NIM_API_KEY"
      },
      "anthropic": {
        "type": "anthropic",
        "model": "claude-3-haiku-20240307",
        "apiKeyEnv": "ANTHROPIC_API_KEY"
      }
    }
  }
}
```

### Audio
```json
{
  "audio": {
    "mode": "builtIn",
    "stt": { "backend": "whisper", "enabled": true },
    "tts": { "backend": "http", "enabled": false, "endpoint": "http://localhost:5002/api/tts" },
    "custom": { "sttEndpoint": "", "ttsEndpoint": "" }
  }
}
```

### Tools & Safety
```json
{
  "tools": {
    "enabled": true,
    "safetyLevel": "balanced",
    "allowedDirectories": ["./vault", "./skills", "./sandbox"],
    "sim3dEnabled": false,
    "deviceAccess": false,
    "networkAccess": false
  },
  "permissions": {
    "allowSandboxedSkills": true,
    "requireConfirmation": true,
    "safetyLevel": "balanced"
  }
}
```

### Policy
```json
{
  "policy": {
    "objectives": [
      "Serve as a personal operator for code, files, tools, and automation.",
      "Preserve system stability, privacy, and resource health."
    ],
    "rules": [
      "Do not execute destructive actions without explicit confirmation.",
      "Respect resource limits and avoid heavy tasks when constrained.",
      "Do not assist with unauthorized intrusion, exploitation, or attacks."
    ]
  }
}
```

### Security
```json
{
  "security": {
    "monitorEnabled": true,
    "alertOnHighResourceUsage": true,
    "alertOnFrequentTerminal": true,
    "logActions": true
  }
}
```

### Environment Variables (.env)
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
    interaction.ts           # Unified interaction pipeline
    orchestrator.ts          # Central orchestrator (actions + policy + security + providers)
    autonomous.ts            # Autonomous natural language engine

  actions/
    types.ts                 # HarnessAction interface
    index.ts                 # Action registration hub
    code.generate.ts         # Code generation action
    fs.ts                    # File operations (6 actions)
    terminal.ts              # Safe terminal execution
    pc.ts                    # PC resource monitor + control
    device.ts                # USB enumeration + remote call
    sim3d.ts                 # 3D simulation hook
    network.ts               # HTTP fetch with allowlist
    security.ts              # Code audit + diagnostics

  registry/
    actionsRegistry.ts       # Central action registry
    providersRegistry.ts     # Model provider registry

  security/
    SecurityMonitor.ts       # Security monitoring + alerts

  policy/
    PolicyEngine.ts          # Objectives + rules engine

  harness/
    ModelAdapter.ts          # Model interface
    OllamaAdapter.ts         # Local Ollama
    CloudModelAdapter.ts     # Remote Ollama with credit tracking
    OpenAiAdapter.ts         # OpenAI-compatible
    AnthropicAdapter.ts      # Anthropic Claude
    ModelAdapterFactory.ts   # Factory + priority chain
    SkillRunner.ts           # Skill execution engine
    ObsidianConnector.ts     # Obsidian vault I/O

  audio/
    AudioAdapter.ts          # STT/TTS interfaces
    AudioRegistry.ts         # Audio adapter registry
    WhisperSttAdapter.ts     # Whisper STT
    HttpTtsAdapter.ts        # HTTP TTS
    audioLoader.ts           # Legacy adapter factory
    wakeWord.ts              # Wake-word detection

  skills/
    SandboxedSkillRunner.ts  # Sandbox execution engine

  ui/
    banner.ts                # Rainbow banner printer
    bannerCli.ts             # Standalone banner command

  workspace/
    WorkspaceAgent.ts        # Workspace automation agent

  onboarding/
    onboarding.ts            # Wizard orchestrator
    validation.ts            # Smoke tests
    sections/                # Onboarding sections

skills/                      # User-defined skills directory
vault/                       # Obsidian vault directory
harness.config.json          # Configuration file
```

## Extending the System

### Add a New Action
1. Create `src/actions/your-action.ts` implementing `HarnessAction`
2. Register it in `src/actions/index.ts`
3. It's immediately available via `jarvis tools run` and the autonomous engine

### Add a New Model Provider
1. Create `src/harness/YourProvider.ts` implementing `ModelAdapter`
2. Add config type in `src/config.ts`
3. Add to `ProviderRegistry` in `src/registry/providersRegistry.ts`

### Add Custom Skills
1. Create a YAML/JSON file in `skills/` directory
2. Define prompt, inputs, and optional outputs
3. Run with: `jarvis run-skill --skill skills/your-skill.yml`

## Development

```bash
npm run build    # Compile TypeScript
npm run dev      # Watch mode
npm run cli      # Run CLI
npm start        # Start with wake-word listener
```

## License

MIT