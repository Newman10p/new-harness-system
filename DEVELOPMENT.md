# Development Guide for M.A.I. Harness

Guide for developers who want to contribute to or customize M.A.I. (Multiple Array Intelligence).

## Quick Start for Developers

```bash
# Clone and setup
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system
npm install

# Watch mode - auto-recompile on changes
npm run dev

# In another terminal, run server or CLI
npx tsx src/server.ts
# or
npx tsx src/index.ts
```

Or use npm link for live testing:

```bash
npm install
npm run build
npm link

# Commands reflect changes after rebuild
npm run dev    # Terminal 1: watch mode
npx tsx src/server.ts  # Terminal 2: run
```

## Project Structure

```
new-harness-system/
├── bin/
│   ├── mai.js                    # Primary CLI entry point
│   └── jarvis.js                 # Legacy alias
├── src/
│   ├── types/
│   │   └── index.ts               # Single source of truth for all interfaces
│   ├── core/                     # Agent nervous system
│   │   ├── AgentLoop.ts          # 7-phase loop
│   │   ├── ContextAssembler.ts   # Builds system prompt from MD files
│   │   ├── ResponseParser.ts     # Extracts ```action blocks from LLM
│   │   ├── IntentClassifier.ts   # Intent classification
│   │   ├── ToneAdapter.ts        # Adaptive tone
│   │   ├── UserModel.ts          # User preference learning
│   │   ├── MultiProvider.ts      # Multi-provider LLM routing
│   │   ├── ToolSchema.ts         # Tool schema for function calling
│   │   ├── orchestrator.ts       # Multi-step orchestration
│   │   ├── VisionAnalyzer.ts     # VLM image analysis
│   │   ├── SelfImprovementEngine.ts  # Self-eval/diagnose/repair
│   │   ├── ProactiveEngine.ts    # Condition-based triggers
│   │   ├── CircuitBreaker.ts     # Failure protection
│   │   ├── AuditLogger.ts        # Audit trail
│   │   ├── LlmBudget.ts          # Token budget management
│   │   ├── eventBus.ts           # Internal event bus
│   │   └── agentState.ts         # Agent state machine
│   ├── actions/
│   │   ├── index.ts              # ActionRegistry (49 primitives, 6 groups)
│   │   └── primitives/           # All action implementations
│   │       ├── # Core (12): read-file, write-file, append-file, list-directory,
│   │       #   watch-directory, get-system-info, get-process-list,
│   │       #   execute-terminal, open-url, http-request, emit-hud-update, compact-memory
│   │       ├── # Intelligence (20): self-modify, self-evaluate, self-diagnose,
│   │       #   self-repair, adaptive-config, remember, recall, forget,
│   │       #   profile-update, learn-pattern, create-skill, optimize-skill,
│   │       #   rollback, semantic-recall, search-files, dry-run, run-macro,
│   │       #   search-conversations, schedule-task, run-skill
│   │       ├── # Device Control (6): control-window, input-inject, system-setting,
│   │       #   media-control, screen-arrange, notification-send
│   │       ├── # Extended (6): screenshot-capture, clipboard-read, clipboard-write,
│   │       #   open-application, get-gpu-info, get-network-info
│   │       ├── # Integration (3): sandbox-execute, device-control, ui-adapt
│   │       ├── # Web & Vision (2): web-search, web-scrape, analyze-image
│   │       ├── browser-control.ts   # 15 operations via CDP
│   │       └── email-access.ts      # 10 operations via IMAP/SMTP
│   ├── security/
│   │   ├── PolicyEngine.ts       # YAML policy firewall (6 rules)
│   │   └── SecurityMonitor.ts    # Threat monitoring
│   ├── sandbox2/                 # Next-gen subsystems
│   │   ├── SandboxManager.ts     # 4-tier sandbox orchestration
│   │   ├── DeviceControlManager.ts  # Device discovery & control
│   │   ├── BrowserControlManager.ts # CDP browser automation
│   │   └── EmailManager.ts       # IMAP/SMTP email (zero deps)
│   ├── ui/
│   │   ├── HudServer.ts          # WebSocket server (21 channels)
│   │   ├── gateway.ts            # Embedded web console
│   │   ├── banner.ts             # ASCII banner
│   │   └── bannerCli.ts          # CLI banner
│   ├── audio/                    # Voice pipeline
│   │   ├── AudioAdapter.ts       # Base interfaces
│   │   ├── AudioRegistry.ts      # Backend registry
│   │   ├── KokoroTtsAdapter.ts   # Kokoro TTS (82M, Apache 2.0)
│   │   ├── PiperTtsAdapter.ts    # Piper TTS (MIT)
│   │   ├── HttpTtsAdapter.ts     # HTTP TTS (remote)
│   │   ├── MoonshineSttAdapter.ts # Moonshine STT (5x Whisper)
│   │   ├── WhisperSttAdapter.ts  # Whisper STT (high accuracy)
│   │   ├── AmbientMode.ts        # Always-listening mode
│   │   ├── wakeWord.ts           # Wake word detection
│   │   └── audioLoader.ts        # Auto-configure pipeline
│   ├── gateway/                  # Multi-device gateway
│   │   ├── GatewayManager.ts
│   │   └── channels/ SmsChannel.ts, TelegramChannel.ts,
│   │       WhatsAppChannel.ts, SipChannel.ts, WebhookChannel.ts
│   ├── auth/                     # Authentication & access control
│   │   ├── AuthManager.ts, SessionManager.ts,
│   │   ├── DevicePairing.ts, permissions.ts, middleware.ts
│   ├── events/                   # Event mesh pub/sub
│   │   ├── EventMesh.ts, DeviceEventSource.ts
│   ├── notifications/            # Notification aggregator
│   │   ├── NotificationAggregator.ts
│   │   └── sources/ GmailSource.ts, GitHubSource.ts,
│   │       SlackSource.ts, CalendarSource.ts, RssSource.ts
│   ├── macros/                   # Macro engine
│   │   ├── MacroEngine.ts, MacroStore.ts
│   ├── memory/                   # Memory subsystems
│   │   ├── MiniObsidianMemory.ts, ConversationIndex.ts, EmbeddingStore.ts
│   ├── network/                  # Tunneling
│   │   ├── TunnelManager.ts, RelayProxy.ts
│   ├── analytics/                # Analytics
│   │   ├── AnalyticsEngine.ts, AnalyticsApiRoutes.ts
│   ├── harness/                  # Model adapters
│   │   ├── ModelAdapter.ts, OllamaAdapter.ts, OpenAiAdapter.ts,
│   │   ├── AnthropicAdapter.ts, CloudModelAdapter.ts, OpenCodeAdapter.ts,
│   │   ├── ModelAdapterFactory.ts, SkillRunner.ts, ObsidianConnector.ts
│   ├── skills/                   # Skill system
│   │   ├── SandboxedSkillRunner.ts, skillAdaptationEngine.ts, skillFeedback.ts
│   ├── onboarding/               # Setup wizard
│   │   ├── validation.ts
│   │   └── sections/ welcome.ts, ollama.ts, obsidian.ts,
│   │       permissions.ts, startup.ts, wakeWord.ts
│   ├── watchers/                 # File/device/resource watchers
│   │   ├── fileWatcher.ts, deviceWatcher.ts, resourceWatcher.ts
│   ├── config/                   # Config management
│   │   ├── loader.ts, env.ts
│   ├── server.ts                 # Server entry point
│   ├── index.ts                  # CLI entry point
│   ├── cli.ts                    # CLI command handler
│   ├── startup.ts                # Bootstrap all subsystems
│   └── config.ts                 # Config types and defaults
├── agent/                        # Brain files (markdown-first)
│   ├── identity.md, instructions.md, memory.md, policy.md
│   ├── models.md, voice.md
│   └── tools/ catalog.md, list.md
│       workflows/ background.md
├── public/                       # Static web assets
│   ├── index.html                # HUD frontend
│   └── chat/                     # Chat PWA
│       ├── index.html, app.js, styles.css, manifest.json, sw.js
├── memory/                       # Persistent memory
├── state/                        # Runtime state
├── macros/                       # User macros
├── skills/                       # Skill definitions (.yml)
├── vault/                        # Knowledge vault
├── tests/                        # Test files
├── harness.config.json           # Runtime config
├── tsconfig.json
├── package.json
└── .env.example                  # Config template
```

## Architecture Overview

### The 7-Phase Agent Loop

```
ASSEMBLE -> Build system prompt from identity.md + policy.md + catalog.md
INFER    -> Send to LLM via OpenAI SDK (multi-provider)
PARSE    -> Extract ```action JSON blocks from response
ENFORCE  -> Validate against PolicyEngine (deny/allow/approve)
EXECUTE  -> Run via ActionRegistry (60s timeout per action)
STREAM   -> Send results to HUD via WebSocket
LOOP     -> Inject results as context, repeat if actions found

Max 20 iterations. Approval gates pause the loop.
```

### Key Subsystems

#### Action Registry
Central registry for all 49 primitives. Actions are grouped into:
- **Core** (12): File ops, terminal, system info
- **Intelligence** (20): Self-improvement, memory, skills, macros
- **Device Control** (6): Windows, input, settings, media
- **Extended** (6): Clipboard, GPU, network, screenshots
- **Integration** (3): Sandbox, device control, UI adapt
- **Web & Vision** (2): Web search/scrape, image analysis
- **Browser Control** (1 action, 15 operations): CDP automation
- **Email Access** (1 action, 10 operations): IMAP/SMTP

#### Policy Engine
YAML-frontmatter firewall in `agent/policy.md`:
1. Auto-approved actions pass immediately
2. Read-only actions always allowed
3. Deny commands blocked by substring match
4. Network allowlist enforced
5. Require-approval actions pause for confirmation
6. Unknown actions blocked

#### Browser Control (CDP)
Zero-dependency browser automation using raw WebSocket CDP protocol.
- `CdpClient` class handles command/response matching over WebSocket
- Auto-discovers browsers on ports 9222-9225
- Supports Chrome and Brave
- Operations: tab management, navigation, search, screenshots, JS eval, content extraction

#### Email Manager
Zero-dependency IMAP/SMTP using Node.js `tls` and `net` modules.
- IMAP client with UTF-7 decoding, SEARCH, FETCH
- SMTP client with BASE64 auth, multipart MIME
- Multi-account support
- Works with Gmail App Passwords

#### Voice Pipeline
Multi-backend TTS/STT with automatic fallback:
- **TTS:** Kokoro -> Piper -> HTTP TTS
- **STT:** Moonshine -> Whisper -> HTTP STT

#### Sandbox System
4 isolation tiers:
- `native`: Restricted environment, lightest
- `process`: Spawn with memory limits
- `docker`: Full container isolation
- `firejail`: Linux namespace isolation

#### Model Adapters
Pluggable LLM backends via `ModelAdapterFactory`:
- `OllamaAdapter`: Local Ollama
- `OpenAiAdapter`: OpenAI and compatible
- `AnthropicAdapter`: Claude models
- `CloudModelAdapter`: Cloud-hosted
- `OpenCodeAdapter`: OpenCode models

## Adding Features

### 1. Add a New Action Primitive

Create `src/actions/primitives/my-action.ts`:

```typescript
import { Action, ActionResult, ActionContext } from "../../types";

export async function myAction(
  action: Action,
  ctx: ActionContext
): Promise<ActionResult> {
  const { myParam } = action.params || {};

  // Your logic here

  return {
    success: true,
    output: `Result: ${myParam}`,
    data: { myParam }
  };
}
```

Register in `src/actions/index.ts`:
```typescript
import { myAction } from "./primitives/my-action";
// In constructor:
this.register("my-action", myAction);
```

Add to `ActionName` union in `src/types/index.ts`:
```typescript
export type ActionName = "..." | "my-action";
```

Document in `agent/tools/catalog.md`.

### 2. Add a Browser Control Operation

Edit `src/actions/primitives/browser-control.ts` and `src/sandbox2/BrowserControlManager.ts`.

### 3. Add an Email Operation

Edit `src/actions/primitives/email-access.ts` and `src/sandbox2/EmailManager.ts`.

### 4. Add a Model Adapter

Create `src/harness/NewModelAdapter.ts` implementing `ModelAdapter` interface.
Register in `src/harness/ModelAdapterFactory.ts`.

### 5. Add a Gateway Channel

Create `src/gateway/channels/NewChannel.ts`.
Register in `src/gateway/GatewayManager.ts`.

### 6. Add a Notification Source

Create `src/notifications/sources/NewSource.ts`.
Register in `src/notifications/NotificationAggregator.ts`.

### 7. Add an Audio Backend

Create `src/audio/NewTtsAdapter.ts` or `NewSttAdapter.ts`.
Register in `src/audio/audioLoader.ts`.

## Testing

### Manual Testing

```bash
# Build and test
npm run build
npm start

# Test CLI
npm run cli
```

### Watch Mode

```bash
# Terminal 1: Watch
npm run dev

# Terminal 2: Run
npx tsx src/server.ts
```

## Building

```bash
npm run build    # Compile TypeScript to dist/
npm start       # Run server mode
npm run cli      # Run CLI mode
```

Note: `tsconfig.json` uses `--noEmitOnError false` to allow builds with pre-existing type errors in non-critical files. This is intentional.

## Publishing

```bash
npm version patch   # or minor, major
npm publish
```

## Code Standards

- CommonJS module system (`"type": "commonjs"`)
- TypeScript strict mode
- Actions must always return `ActionResult`, never throw
- All subsystems loaded via try/catch — graceful degradation
- Zero external dependencies for browser and email features

## Debugging

```bash
# Inspect config
cat harness.config.json | jq .

# Check env
cat .env

# Test LLM connectivity
curl http://localhost:11434/api/tags

# Test browser CDP
curl http://localhost:9222/json/version

# Test IMAP
openssl s_client -connect imap.gmail.com:993
```

## Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Commit** changes: `git commit -am "Add my feature"`
4. **Push** to branch: `git push origin feature/my-feature`
5. **Create** a Pull Request

## Resources

- **Repository:** https://github.com/Newman10p/new-harness-system
- **Ollama:** https://ollama.ai/
- **Kokoro TTS:** Apache 2.0, 82M params
- **Moonshine STT:** MIT, 5x faster than Whisper
