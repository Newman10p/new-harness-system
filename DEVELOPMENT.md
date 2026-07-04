# Development Guide for Jarvis AI Harness

Guide for developers who want to contribute to or customize Jarvis.

## Quick Start for Developers

```bash
# Clone and setup
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system
npm install

# Watch mode - auto-recompile on changes
npm run dev

# In another terminal, test commands
npm run cli -- list-skills
npm run cli -- init
```

Or use npm link for live testing:

```bash
npm install
npm run build
npm link

# Now jarvis command reflects changes after rebuild
jarvis list-skills
```

## Project Structure

```
new-harness-system/
├── bin/
│   └── jarvis.js                 # CLI entry point
├── src/
│   ├── audio/                    # Audio adapters (STT/TTS)
│   │   ├── AudioAdapter.ts
│   │   ├── WhisperSttAdapter.ts
│   │   ├── HttpTtsAdapter.ts
│   │   ├── audioLoader.ts
│   │   └── wakeWord.ts
│   ├── config/                   # Configuration management
│   │   ├── env.ts               # .env file handling
│   │   └── loader.ts            # Config file CRUD
│   ├── core/
│   │   └── interaction.ts        # Main interaction engine
│   ├── harness/                  # Core harness logic
│   │   ├── ModelAdapter.ts       # Model backend interface
│   │   ├── OllamaAdapter.ts      # Ollama implementation
│   │   ├── SkillRunner.ts        # Skill execution
│   │   └── ObsidianConnector.ts  # Vault integration
│   ├── skills/
│   │   └── SandboxedSkillRunner.ts # Sandboxed execution
│   ├── ui/                       # User interface
│   │   ├── banner.ts            # Rainbow banner
│   │   └── bannerCli.ts
│   ├── onboarding/              # Setup wizard
│   │   ├── onboarding.ts        # Main orchestrator
│   │   ├── validation.ts        # Smoke tests
│   │   └── sections/            # Wizard sections
│   │       ├── welcome.ts       # Identity & mode
│   │       ├── audio.ts         # Audio backends
│   │       ├── wakeWord.ts      # Picovoice setup
│   │       ├── startup.ts       # Boot integration
│   │       ├── obsidian.ts      # Vault setup
│   │       └── permissions.ts   # Sandbox rules
│   ├── cli.ts                   # CLI command handler
│   ├── config.ts                # Type definitions
│   └── startup.ts               # Application entry
├── dist/                        # Compiled JavaScript (auto-generated)
├── skills/                      # Example skills
├── package.json
├── tsconfig.json
├── harness.config.json          # Runtime config
├── .env                         # Secrets (git-ignored)
├── README.md
├── INSTALLATION.md
└── DEVELOPMENT.md               # This file
```

## Architecture Overview

### Core Flow

```
CLI Input (jarvis command)
  ↓
cli.ts (command routing)
  ↓
LoadConfig (harness.config.json + .env)
  ↓
First Run? → Onboarding Wizard
  ↓
InteractionEngine (unified interface)
  ↓
SkillRunner / AudioAdapter / ObsidianConnector / ModelAdapter
  ↓
Execute & Return Results
```

### Key Components

#### ModelAdapter Interface
```typescript
interface ModelAdapter {
  complete(prompt: string, context?: string): Promise<string>;
  batch(prompts: string[]): Promise<string[]>;
}
```

Current implementation: `OllamaAdapter` - connects to Ollama API

#### SkillRunner
Loads and executes skills defined in YAML/JSON:
```yaml
name: "Skill Name"
model: "neural-chat"
template: "Prompt with {{variables}}"
inputs:
  - name: "variable"
    prompt: "User prompt"
```

#### Onboarding System
Interactive setup wizard that:
1. Runs on first use
2. Creates `harness.config.json`
3. Saves secrets to `.env`
4. Validates environment
5. Generates platform-specific boot scripts

#### Audio Layer
- **STT**: Whisper-based speech recognition
- **TTS**: HTTP-based text-to-speech
- **Wake-word**: Picovoice Porcupine detection

#### Sandboxing
Skills can run isolated with:
- Separate process (spawn)
- Timeout control
- Output capture
- Approval workflow

## Adding Features

### 1. Add a New Model Backend

Create `src/harness/NewModelAdapter.ts`:

```typescript
import { ModelAdapter } from "./ModelAdapter";

export class NewModelAdapter implements ModelAdapter {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async complete(prompt: string, context?: string): Promise<string> {
    // Implementation here
    const response = await fetch(`${this.baseUrl}/complete`, {
      method: "POST",
      body: JSON.stringify({ prompt, context })
    });
    const data = await response.json();
    return data.result;
  }

  async batch(prompts: string[]): Promise<string[]> {
    return Promise.all(prompts.map(p => this.complete(p)));
  }
}
```

Register in `src/harness/OllamaAdapter.ts`:

```typescript
// In config loading
if (config.modelBackend === "newmodel") {
  modelAdapter = new NewModelAdapter(config.newmodelUrl);
}
```

### 2. Add a New CLI Command

Edit `src/cli.ts`:

```typescript
async function main(): Promise<void> {
  // ... existing code ...

  if (command === "my-new-command") {
    const result = await doSomething();
    console.log(result);
    return;
  }
}
```

Update help text:

```typescript
function printUsage(): void {
  console.log(`
    jarvis my-new-command [options]    # Description
  `);
}
```

### 3. Add a New Audio Backend

Create `src/audio/NewTtsAdapter.ts`:

```typescript
import { AudioTtsAdapter } from "./AudioAdapter";

export class NewTtsAdapter implements AudioTtsAdapter {
  constructor(private endpoint: string) {}

  async synthesize(text: string, outputPath: string): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      body: JSON.stringify({ text })
    });
    const buffer = await response.arrayBuffer();
    // Write to file
    writeFileSync(outputPath, Buffer.from(buffer));
  }
}
```

Register in `src/audio/audioLoader.ts`:

```typescript
if (config.audio.tts.backend === "newbackend") {
  tts = new NewTtsAdapter(config.audio.tts.endpoint);
}
```

### 4. Add Onboarding Section

Create `src/onboarding/sections/newSection.ts`:

```typescript
import inquirer from "inquirer";
import { HarnessConfig } from "../../config";

export async function onboardNewFeature(
  existing: Partial<HarnessConfig>
): Promise<Partial<HarnessConfig>> {
  console.log(chalk.cyan("\n=== New Feature Setup ===\n"));

  const answer = await inquirer.prompt([
    {
      type: "confirm",
      name: "enabled",
      message: "Enable new feature?",
      default: false
    }
  ]);

  if (!answer.enabled) {
    return {};
  }

  // More prompts...

  return {
    newFeature: {
      enabled: true,
      // ... settings
    }
  };
}
```

Register in `src/onboarding.ts`:

```typescript
import { onboardNewFeature } from "./sections/newSection";

// In runOnboarding():
const newFeatureConfig = await onboardNewFeature(config);
Object.assign(config, newFeatureConfig);
```

## Testing

### Manual Testing

```bash
# Build and test specific command
npm run build
npm run cli -- list-skills

# Test with specific config
cp harness.config.json harness.config.backup.json
# ... modify config or env ...
npm run cli -- run-skill --skill ./skills/example.yml
```

### Watch Mode Development

```bash
# Terminal 1: Watch for changes
npm run dev

# Terminal 2: Run commands
npm run cli -- list-skills
npm run cli -- init
```

### Testing Onboarding

```bash
# Test fresh setup
rm harness.config.json .env
npm run cli -- init

# Test resuming setup
npm run cli -- init
# Select "Continue" when prompted
```

## Building and Publishing

### Local Build

```bash
npm run build
```

Compiles TypeScript to JavaScript in `dist/` folder.

### Testing Global Installation

```bash
# Test locally
npm link

# Verify command works
jarvis --help

# Unlink when done
npm unlink -g jarvis-harness
```

### Publishing to npm (Admin Only)

```bash
# Bump version
npm version patch  # or minor, major

# Publish
npm publish
```

Users can then install with:
```bash
npm install -g jarvis-harness
```

## Code Standards

### TypeScript

- Use strict type checking
- Add type annotations to function parameters
- Use interfaces for config objects
- Avoid `any` type

### Error Handling

```typescript
try {
  const result = await operation();
  return result;
} catch (error) {
  console.error("Operation failed:", error instanceof Error ? error.message : error);
  throw error;  // or handle gracefully
}
```

### Logging

```typescript
import chalk from "chalk";

console.log(chalk.green("✓ Success"));     // Success
console.log(chalk.yellow("⚠ Warning"));    // Warning
console.log(chalk.red("✗ Error"));         // Error
console.log(chalk.cyan("→ Info"));         // Info
```

### Configuration

- Load from `harness.config.json`
- Read secrets from `.env` via `dotenv`
- Provide sensible defaults
- Validate user input in onboarding

## Debugging

### Enable Debug Logging

```bash
DEBUG=jarvis:* npm run cli -- command
```

### Inspect Config

```bash
cat harness.config.json | jq .
```

### Check Environment

```bash
cat .env
```

### Test Audio Endpoints

```bash
# Test TTS
curl http://localhost:5500/health

# Test STT
curl http://localhost:8000/health
```

## Common Tasks

### Update Dependencies

```bash
npm update
npm audit fix
npm run build
```

### Clean Build

```bash
rm -rf dist/ node_modules/
npm install
npm run build
```

### Format Code

```bash
# TypeScript will enforce styles
npm run build
```

## Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Commit** changes: `git commit -am "Add my feature"`
4. **Push** to branch: `git push origin feature/my-feature`
5. **Create** a Pull Request

## Resources

- **TypeScript Docs**: https://www.typescriptlang.org/docs/
- **npm Documentation**: https://docs.npmjs.com/
- **Ollama**: https://ollama.ai/
- **Picovoice**: https://picovoice.ai/
- **Obsidian API**: https://docs.obsidian.md/Home

## Questions?

Open an issue on [GitHub](https://github.com/Newman10p/new-harness-system/issues)
