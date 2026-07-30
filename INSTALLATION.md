# Installation Guide for Jarvis AI Harness

This guide covers how to install and use Jarvis AI Harness on your device.

## Table of Contents

1. [Installation Methods](#installation-methods)
2. [Quick Start](#quick-start)
3. [CLI Commands](#cli-commands)
4. [Configuration](#configuration)
5. [Uninstallation](#uninstallation)

## Installation Methods

### Method 1: Global Installation (Recommended for Users)

Install Jarvis as a global CLI tool accessible from anywhere on your device.

#### From GitHub Source

```bash
# Clone the repository
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system

# Build and install globally
npm install
npm run build
npm install -g .

# Verify installation
jarvis --help
```

#### From npm Registry (When Published)

```bash
npm install -g jarvis-harness
```

### Method 2: Local Development Setup

Perfect for development, testing, and contributing to the project.

```bash
# Clone the repository
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system

# Install dependencies
npm install

# Build the project
npm run build

# Use local CLI
npm run cli -- init
npm run cli -- list-skills
npm run cli -- run-skill --skill ./skills/example.yml
```

### Method 3: Development Link (Live Edits)

Install globally while maintaining live source code edits.

```bash
cd /path/to/new-harness-system

# Install dependencies and build once
npm install
npm run build

# Create global symlink
npm link

# Now use jarvis command, and changes reflect after rebuild
jarvis init

# Watch mode for automatic rebuilding
npm run dev
# In another terminal, run jarvis commands
```

To unlink:
```bash
npm unlink -g jarvis-harness
```

## Quick Start

### 1. Install Globally

```bash
npm install -g .
```

### 2. Initialize Configuration

Run the interactive onboarding wizard:

```bash
jarvis init
```

You'll be guided through:
- **Assistant name** - Default: "Jarvis"
- **Mode** - Text-only or text+voice
- **Audio backends** - Configure Whisper STT and HTTP TTS
- **Wake word** - Setup Picovoice (optional)
- **Auto-start** - Enable automatic startup (optional)
- **Obsidian vault** - Connect your vault (optional)
- **Sandbox settings** - Configure skill sandboxing

### 3. Verify Installation

Test that everything is working:

```bash
jarvis list-skills
```

You should see a rainbow banner and a list of available skills.

### 4. Run Your First Skill

```bash
jarvis run-skill --skill ./skills/sample-note-skill.yml
```

## CLI Commands

### Setup Commands

```bash
# Run onboarding wizard
jarvis init

# Configuration is auto-created in your working directory:
# - harness.config.json (settings)
# - .env (secrets like API keys)
```

### Skill Management

```bash
# List all available skills
jarvis list-skills

# Run a skill
jarvis run-skill --skill path/to/skill.yml

# Pass variables to a skill
jarvis run-skill --skill path/to/skill.yml --variable value --another-var another-value

# Run skill in sandbox (isolated execution)
jarvis run-sandbox --skill path/to/skill.yml

# Run with custom sandbox timeout
jarvis run-sandbox --skill path/to/skill.yml --timeout 5000 --sandboxRoot /tmp

# Promote a sandboxed skill to trusted
jarvis promote-skill --skill path/to/skill.yml
```

### Vault Operations

```bash
# View your Obsidian vault structure
jarvis inspect-vault

# Create a new note
jarvis create-note --title "My Note" --filename my-note.md --content "Note content here"
```

### Audio Commands

```bash
# Speech to Text (STT)
jarvis listen --file input.wav --out transcript.txt

# Text to Speech (TTS)
jarvis speak --text "Hello, I'm Jarvis" --out greeting.wav

# Both default to configured backends in harness.config.json
```

### Help

```bash
jarvis --help
```

## Configuration

### Configuration Files

After running `jarvis init`, two files are created in your working directory:

#### `harness.config.json` - Main Configuration

Contains all settings in JSON format:

```json
{
  "name": "Jarvis",
  "mode": "text+voice",
  "ollama": {
    "baseUrl": "http://localhost:11434"
  },
  "audio": {
    "stt": {
      "backend": "whisper",
      "endpoint": "http://localhost:8000/transcribe"
    },
    "tts": {
      "backend": "http",
      "endpoint": "http://localhost:5500/tts"
    },
    "wakeWord": {
      "enabled": true,
      "keyword": "jarvis",
      "accessKey": "loaded-from-env",
      "modelPath": "./models/jarvis.pv"
    }
  },
  "vaultPath": "/Users/you/Documents/MyVault",
  "projects": [
    {
      "name": "MyGame",
      "path": "./projects/my-game",
      "type": "game"
    }
  ],
  "startup": {
    "autoStart": true
  },
  "permissions": {
    "sandboxByDefault": true,
    "requireConfirmation": true
  }
}
```

#### `.env` - Secrets (Git-Ignored)

Contains sensitive information:

```
PICOVOICE_ACCESS_KEY=your_access_key_here
```

### Manual Configuration

You can edit these files directly:

```bash
# Edit settings
nano harness.config.json

# Edit secrets
nano .env

# Re-run wizard to reconfigure
jarvis init
# Select "Reset" when prompted
```

### Environment Variables

Some settings can be overridden via environment variables:

```bash
# Override Ollama base URL
OLLAMA_BASE_URL=http://custom-host:11434 jarvis list-skills

# Override assistant name
HARNESS_NAME=CustomBot jarvis --help
```

## Advanced Usage

### Creating Skills

Skills are YAML or JSON files that define how Jarvis should perform tasks.

**Example: `skills/greet-user.yml`**

```yaml
name: "Greet User"
description: "Greet the user with their name"
model: "neural-chat"
inputs:
  - name: "name"
    type: "string"
    prompt: "What's your name?"
template: |
  Greet {{name}} warmly and ask how their day is going.
expectedOutputType: "text"
```

Run it:

```bash
jarvis run-skill --skill skills/greet-user.yml --name "Alice"
```

### Obsidian Integration

Connect your Obsidian vault for note-based interactions:

```bash
# During setup
jarvis init
# Select "yes" for Obsidian vault
# Provide path to your vault

# List vault contents
jarvis inspect-vault

# Create notes from CLI
jarvis create-note --title "Task" --filename daily/2026-07-04.md --content "- [ ] Review PR"
```

### Audio Setup

Configure Speech-to-Text (STT) and Text-to-Speech (TTS):

1. **STT (Speech Recognition)**
   - Whisper-based transcription
   - Requires Whisper endpoint running
   - Example: `http://localhost:8000`

2. **TTS (Speech Synthesis)**
   - HTTP-based text-to-speech
   - Requires TTS server running
   - Example: `http://localhost:5500`

### Wake-Word Detection

Automatically trigger Jarvis by saying "Jarvis":

1. Get AccessKey from [Picovoice Console](https://console.picovoice.ai/)
2. Run `jarvis init` and select "yes" for wake word
3. Paste your AccessKey when prompted
4. Jarvis will auto-activate when it hears "Jarvis"

### Auto-Start Integration

Enable Jarvis to start automatically on system boot:

1. Run `jarvis init`
2. Select "yes" for auto-start
3. Follow platform-specific instructions:

**Windows:**
```bash
# Scripts/startHarness.bat will be created
# Copy to shell:startup folder for auto-run
```

**Linux (systemd):**
```bash
# Scripts/jarvis-harness.service will be created
systemctl --user enable jarvis-harness
systemctl --user start jarvis-harness
```

**macOS (launchd):**
```bash
# Scripts/com.jarvis.harness.plist will be created
# Copy to ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.jarvis.harness.plist
```

## Troubleshooting

### "jarvis: command not found"

**Solution:** Verify installation:

```bash
# Check if installed
npm list -g jarvis-harness

# Reinstall if needed
npm install -g .
```

### "Error: Project not built"

**Solution:** Build the project:

```bash
npm run build
```

### Configuration not found

**Solution:** Run setup wizard:

```bash
jarvis init
```

### Audio not working

**Solution:** Verify audio services are running:

```bash
# Check audio config
jarvis inspect-vault

# Test TTS endpoint
curl http://localhost:5500/health

# Test STT endpoint
curl http://localhost:8000/health
```

## Uninstallation

### Remove Global Installation

```bash
npm unlink -g jarvis-harness
# or
npm uninstall -g jarvis-harness
```

### Remove Configuration (Optional)

```bash
# Remove configuration and secrets
rm harness.config.json .env

# Remove auto-start scripts
rm -rf scripts/
```

## Support

For issues, questions, or feature requests:

- **Repository:** https://github.com/Newman10p/new-harness-system
- **Issues:** https://github.com/Newman10p/new-harness-system/issues

## Next Steps

- [Development Guide](DEVELOPMENT.md) - Contributing to Jarvis
- [README.md](README.md) - Feature overview
- [Picovoice Console](https://console.picovoice.ai/) - Get wake-word AccessKey
