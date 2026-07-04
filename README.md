# new-harness-system (Jarvis AI Harness)

A comprehensive AI harness framework with Ollama model integration, Obsidian vault support, audio capabilities (STT/TTS), wake-word detection, and sandboxed skill execution.

## Features

- **Model Adapter Interface**: Pluggable model backends (Ollama, extensible to others)
- **Skill System**: External skill definitions (YAML/JSON) with templating and sandboxing
- **Obsidian Integration**: Read/write notes from an Obsidian vault
- **Audio Layer**: Speech-to-Text (Whisper) and Text-to-Speech (HTTP)
- **Wake Word Detection**: Automatic activation on "Jarvis" keyword (Picovoice Porcupine)
- **Interactive Pipeline**: Unified entry point for CLI, audio, and note-driven interactions
- **Rainbow Banner**: Colorful terminal greeting with configurable name
- **Sandboxed Skills**: Isolated execution with approval workflow for self-improving skills
- **Permissions Model**: Control over external commands and sandboxed operations

## Installation

### Prerequisites

- Node.js >= 18
- npm

### Option 1: Local Development Setup

Perfect for development and testing.

```bash
# Clone the repository
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system

# Install dependencies
npm install

# Build the project
npm run build

# Run the CLI
npm run cli -- init  # Setup wizard
npm run cli -- list-skills  # List available skills
```

### Option 2: Global CLI Installation (Recommended for Users)

Install as a global CLI tool accessible from anywhere on your device.

**From source:**
```bash
# Clone the repository
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system

# Install globally from local source
npm install -g .

# Now use jarvis from anywhere
jarvis init
jarvis list-skills
jarvis run-skill --skill path/to/skill.yml
```

**Update to latest:**
```bash
npm install -g new-harness-system@latest
```

### Option 3: Local Link (Development)

Install globally while maintaining live source code edits.

```bash
cd /path/to/new-harness-system
npm install  # Install dependencies
npm run build  # Build once
npm link  # Create global symlink

# Now use jarvis command, and changes reflect after rebuild
jarvis init
```

To unlink:
```bash
npm unlink -g jarvis-harness
```

## CLI Commands

Once installed, use the `jarvis` command:

```bash
# Setup and configuration
jarvis init                                        # Run onboarding wizard (or first time auto-runs)

# Skill management
jarvis list-skills                                 # List all available skills
jarvis run-skill --skill path/to/skill.yml         # Execute a skill
  # Optional: Add variables with --key value ...

# Vault operations
jarvis inspect-vault                               # Show vault contents
jarvis create-note --title "My Note" --filename my-note.md --content "Content here"

# Audio
jarvis listen --file input.wav --out output.txt    # Speech-to-text
jarvis speak --text "Hello world" --out output.wav # Text-to-speech

# Sandbox & skills
jarvis run-sandbox --skill path/to/skill.yml       # Run skill in sandbox
  # Optional: --sandboxRoot /path --timeout 5000
jarvis promote-skill --skill path/to/skill.yml     # Promote sandboxed skill

# Info
jarvis --help                                      # Show all commands
```

## Usage Examples

### First-Time Setup

```bash
# Install globally
npm install -g .

# Setup on your device
jarvis init
# → You'll be guided through:
#   - Assistant name
#   - Audio backend (Whisper STT, HTTP TTS)
#   - Wake word (Picovoice AccessKey)
#   - Auto-start integration
#   - Obsidian vault connection
#   - Sandbox settings
```

### Run a Skill

```bash
jarvis run-skill --skill ./skills/sample-note-skill.yml
# Skill executes with configured models and backends
```

### Listen and Speak

```bash
# Record audio and transcribe
jarvis listen --file ~/myvoice.wav --out ~/transcript.txt

# Generate speech
jarvis speak --text "Thanks for using Jarvis!" --out ~/greeting.wav
```

### Configuration File

After running `jarvis init`, configuration is stored in your working directory:

```json
// harness.config.json
{
  "name": "Jarvis",
  "mode": "text+voice",
  "ollama": { "baseUrl": "http://localhost:11434" },
  "audio": {
    "stt": { "backend": "whisper", "endpoint": "..." },
    "tts": { "backend": "http", "endpoint": "..." },
    "wakeWord": { "enabled": true, "keyword": "jarvis" }
  },
  "vaultPath": "/path/to/vault",
  "projects": [...],
  "permissions": { "sandboxByDefault": true }
}
```

Secrets (API keys, AccessKeys) are stored in `.env`:
```
PICOVOICE_ACCESS_KEY=your_key_here
```

## Onboarding Wizard

The onboarding wizard guides you through setup interactively and saves all configuration automatically.

### Running the Wizard

**First time setup:**
```bash
jarvis init
```
(Or just run any command - if config doesn't exist, the wizard launches automatically)

**Reset configuration:**
```bash
rm harness.config.json .env
jarvis init
```

### What the Wizard Covers

1. **Identity**: Choose your assistant name (default: "Jarvis")
2. **Mode**: Select text-only or text+voice
3. **Audio Setup**: 
   - Configure STT (Whisper, or skip)
   - Configure TTS (HTTP endpoint, or skip)
4. **Wake Word** (optional):
   - Guide to Picovoice console
   - Securely enter AccessKey (hidden input)
   - Configure model paths
5. **Auto-Start** (optional):
   - Platform detection (Windows/Linux/macOS)
   - Generate startup scripts
   - Instructions for each platform
6. **Obsidian Vault** (optional):
   - Connect vault path
   - Register project folders
7. **Sandbox & Permissions**:
   - Default sandbox behavior
   - Confirmation requirements

### Secret Handling

Sensitive values (API keys, AccessKeys) are:
- **Never printed to terminal**
- **Saved to `.env` file** (excluded from git)
- **Loaded at runtime** via `dotenv`

### Smoke Tests

After setup, the wizard runs validation:
- Config file loads successfully
- Vault path is accessible
- Audio endpoints are valid
- Skills directory exists

## Configuration

Edit `harness.config.json` to customize (or use the wizard):

- **assistantName**: Name displayed in the banner (default: "Jarvis")
- **model**: Default model name
- **ollama**: Ollama endpoint and model configuration
- **audio**: STT/TTS settings (Whisper for STT, HTTP endpoint for TTS)
- **vaultPath**: Path to Obsidian vault directory
- **skillsPath**: Directory containing skill definitions
- **permissions**: Sandboxing and command execution rules

Example:
```json
{
  "assistantName": "Jarvis",
  "model": "llama2",
  "ollama": {
    "endpoint": "http://127.0.0.1:11434",
    "model": "llama2"
  },
  "audio": {
    "stt": {
      "backend": "whisper",
      "enabled": true,
      "modelPath": "base"
    },
    "tts": {
      "backend": "http",
      "enabled": false,
      "endpoint": "http://localhost:5002/api/tts"
    }
  },
  "vaultPath": "./vault",
  "skillsPath": "./skills",
  "permissions": {
    "allowSandboxedSkills": true,
    "allowedExternalCommands": []
  }
}
```

## Usage

### CLI Commands

#### Run a Skill
```bash
npm run cli -- run-skill --skill skills/sample-note-skill.yml --idea "Your idea here"
```

#### Inspect Obsidian Vault
```bash
npm run cli -- inspect-vault
```

#### Create a Note
```bash
npm run cli -- create-note --title "My Note" --filename "my-note.md" --content "Note content"
```

#### Listen & Respond via Audio
```bash
npm run cli -- listen --file audio-input.wav --out response.wav
```
(Transcribe audio, process through model, synthesize response)

#### Text-to-Speech
```bash
npm run cli -- speak --text "Hello, this is Jarvis" --out message.wav
```

#### List Available Skills
```bash
npm run cli -- list-skills
```

#### Run Sandboxed Skill
```bash
npm run cli -- run-sandbox --skill skills/self-improving-skill.yml --timeout 30000
```

#### Promote Sandboxed Changes
```bash
npm run cli -- promote-skill --skill skills/self-improving-skill.yml
```

### Start with Wake Word Detection
```bash
npm start
```
This starts the harness in "always listening" mode. Say "Jarvis" to trigger the listen flow.

### Banner CLI
Print the rainbow banner in any terminal:
```bash
npm run banner
```

Or add to your shell profile for a greeting:
```bash
# In ~/.bashrc, ~/.zshrc, or PowerShell $PROFILE:
node /path/to/new-harness-system/dist/ui/bannerCli.js
```

## Skill Definition Format

Skills are YAML or JSON files that define reusable AI workflows:

```yaml
name: sample-note-skill
description: Generate an Obsidian note from a user idea.
noteTitle: "AI note: {{idea}}"
outputNote: "generated-ideas/ai-note.md"
prompt: |
  You are an AI assistant that helps generate a useful Obsidian note.
  Based on this idea, write a markdown note with a title, summary, and action items.
  
  Idea: {{idea}}
inputs:
  idea: "A short description of the note idea."
```

Skill fields:
- **name**: Unique skill identifier
- **description**: What the skill does
- **prompt**: Template prompt (supports `{{variable}}` substitution)
- **inputs**: Input variables with descriptions
- **outputNote**: (Optional) Save result to this Obsidian note file
- **noteTitle**: (Optional) Title for generated note
- **script**: (Optional) Path to external Node.js or shell script to run instead of using the model
- **sandbox**: (Optional) If true, run in isolated sandbox
- **sandbox_root**: (Optional) Override sandbox directory
- **self_improvement**: (Optional) If true, skill can modify itself within sandbox

## Audio Integration

### STT (Speech-to-Text)

Currently supports **Whisper** via `@pr0gramm/fluester` or CLI:
- Converts audio files to transcribed text
- Enables voice command workflows

### TTS (Text-to-Speech)

HTTP endpoint adapter for TTS services:
- Sends text to a TTS endpoint
- Returns audio buffer for playback or saving
- Requires external TTS service (e.g., local TTS server or cloud API)

## Wake Word Detection

Uses **Picovoice Porcupine** to detect the "Jarvis" keyword:
- Runs locally on device (no cloud required)
- Triggers `npm run cli -- listen` automatically
- Gracefully falls back if Porcupine unavailable

## Sandboxing

Sandboxed skills run in isolated directories with optional self-improvement:

1. Define a skill with `sandbox: true`
2. Run via `npm run cli -- run-sandbox --skill <skill-file>`
3. Skill executes in `./sandbox/<skill-name>/` directory
4. Review changes: `npm run cli -- promote-skill --skill <skill-file>`
5. Approve to merge back into main skills directory

## Auto-Start on Boot

### Windows
1. Open `shell:startup` (press Windows+R, type `shell:startup`)
2. Copy `startHarness.bat` to the startup folder
3. Restart your computer; the harness will start on boot

### Linux (systemd)
1. Edit `jarvis-harness.service`: Replace `/path/to/new-harness-system` with the actual path
2. Copy to systemd user directory:
   ```bash
   cp jarvis-harness.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable jarvis-harness
   systemctl --user start jarvis-harness
   ```

### macOS (launchd)
1. Edit `com.jarvis.harness.plist`: Replace `/path/to/new-harness-system` with the actual path
2. Copy to LaunchAgents:
   ```bash
   cp com.jarvis.harness.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.jarvis.harness.plist
   ```

## Project Structure

```
src/
  cli.ts                     # Main CLI entrypoint
  startup.ts                 # Wake-word startup wrapper
  config.ts                  # Configuration loading
  core/
    interaction.ts           # Unified interaction pipeline
  harness/
    ModelAdapter.ts          # Model interface
    OllamaAdapter.ts         # Ollama implementation
    SkillRunner.ts           # Skill execution engine
    ObsidianConnector.ts     # Obsidian vault I/O
  audio/
    AudioAdapter.ts          # STT/TTS interfaces
    WhisperSttAdapter.ts     # Whisper-based transcription
    HttpTtsAdapter.ts        # HTTP TTS client
    audioLoader.ts           # Audio adapter factory
    wakeWord.ts              # Wake-word detection
  skills/
    SandboxedSkillRunner.ts   # Sandbox execution engine
  ui/
    banner.ts                # Rainbow banner printer
    bannerCli.ts             # Standalone banner command

skills/                      # User-defined skills directory
vault/                       # Obsidian vault directory
harness.config.json         # Configuration file
```

## Extending the System

### Add a New Model Adapter

1. Create `src/harness/YourModelAdapter.ts` implementing `ModelAdapter`
2. Update `src/config.ts` with your model config
3. Update `audioLoader.ts` or create a model factory

### Add Custom Skills

1. Create a YAML/JSON file in `skills/` directory
2. Define prompt, inputs, and optional outputs
3. Run with: `npm run cli -- run-skill --skill skills/your-skill.yml --param value`

### Add a Custom TTS Backend

1. Create a new class implementing `TextToSpeechAdapter`
2. Update `audioLoader.ts` to load it based on config
3. Set `audio.tts.backend` in config

## Development

Watch TypeScript compilation:
```bash
npm run dev
```

## Next Steps

- Integrate more STT/TTS backends
- Add persistent conversation memory
- Extend sandboxing with more granular permissions
- Build Obsidian plugin UI for direct vault interaction
- Add multi-model orchestration

## License

See LICENSE file for details.
