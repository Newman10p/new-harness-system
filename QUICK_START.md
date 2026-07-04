# Quick Start: Installing Jarvis AI Harness

## 30-Second Install

```bash
# Clone the repo
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system

# Install globally
npm install && npm run build && npm install -g .

# Verify
jarvis --help
```

**Done!** You can now use `jarvis` from anywhere on your device.

## First-Time Setup

```bash
# Run the interactive setup wizard
jarvis init

# You'll be asked about:
# - Assistant name
# - Text or voice mode
# - Audio backends (optional)
# - Wake-word setup (optional)
# - Auto-start (optional)
# - Obsidian vault (optional)
# - Sandbox settings

# List available skills
jarvis list-skills

# Try running a skill
jarvis run-skill --skill ./skills/sample-note-skill.yml
```

## Common Commands

```bash
# Setup wizard (run anytime to reconfigure)
jarvis init

# List available skills
jarvis list-skills

# Run a skill with variables
jarvis run-skill --skill path/to/skill.yml --name "Value" --other-var "Another Value"

# Speech to text
jarvis listen --file input.wav --out transcript.txt

# Text to speech
jarvis speak --text "Hello world" --out output.wav

# View vault
jarvis inspect-vault

# Create a note
jarvis create-note --title "My Note" --filename note.md --content "Content here"

# Get help
jarvis --help
```

## Installation Options

### Option 1: Global Install (Recommended)

Install as a system-wide command:

```bash
# From source
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system
npm install && npm run build && npm install -g .

# From npm (when published)
npm install -g jarvis-harness
```

Use from anywhere:
```bash
jarvis init
jarvis list-skills
```

### Option 2: Local Development

Keep it in a folder for development:

```bash
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system
npm install && npm run build
```

Use with:
```bash
npm run cli -- init
npm run cli -- list-skills
```

### Option 3: Development Link

Install globally while editing source code:

```bash
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system
npm install && npm run build && npm link

# Edit code, rebuild, and changes are live:
npm run dev          # In terminal 1
jarvis command       # In terminal 2
```

## Configuration Files

After running `jarvis init`, you'll have:

- **`harness.config.json`** - Your settings (settings.json)
- **`.env`** - Your secrets (git-ignored)

### Example harness.config.json

```json
{
  "name": "Jarvis",
  "mode": "text+voice",
  "ollama": {
    "baseUrl": "http://localhost:11434"
  },
  "audio": {
    "stt": {"backend": "whisper", "endpoint": "..."},
    "tts": {"backend": "http", "endpoint": "..."},
    "wakeWord": {"enabled": false}
  },
  "vaultPath": "/path/to/your/vault",
  "permissions": {"sandboxByDefault": true}
}
```

### Example .env

```
PICOVOICE_ACCESS_KEY=your_key_here
```

## Troubleshooting

**"jarvis: command not found"**
```bash
# Make sure it's installed globally
npm install -g .
```

**"Error: Project not built"**
```bash
# Build the project
npm run build
```

**Need help?**
```bash
# See all commands
jarvis --help

# Reset configuration
rm harness.config.json .env
jarvis init
```

## Next Steps

1. **[Full Installation Guide](INSTALLATION.md)** - Detailed setup instructions
2. **[Development Guide](DEVELOPMENT.md)** - Contributing and customizing
3. **[Main README](README.md)** - Features and overview

## Support

- **GitHub Issues**: https://github.com/Newman10p/new-harness-system/issues
- **Documentation**: See README.md and other .md files

---

**Happy coding!** 🚀
