# 🚀 How to Install & Use Jarvis AI Harness

## What You Asked For

You wanted to install Jarvis AI Harness like other CLI tools (Hermes, etc.) so you can run it globally on your device. **✓ Done!**

---

## 📥 Installation (Choose One Method)

### **Method 1: Global Install (RECOMMENDED)** ⭐

Install it globally so you can use `jarvis` from anywhere on your device:

```bash
# 1. Clone the repository
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system

# 2. Install globally
npm install && npm run build && npm install -g .

# 3. Verify it works
jarvis --help
```

**That's it!** Now you can use `jarvis` from any folder on your device.

---

## 💻 Using the CLI

Once installed, you have the `jarvis` command available globally:

### Setup (First Time)

```bash
# Run interactive setup wizard
jarvis init
```

This asks you about:
- Assistant name
- Text or voice mode
- Audio backends (Whisper STT, HTTP TTS)
- Wake-word activation (Picovoice)
- Auto-start on boot (Windows/Linux/macOS)
- Obsidian vault connection
- Sandbox settings
- **Gateway configuration** - Enable web console and set port
- **Provider API keys** - Configure OpenAI, Anthropic, Ollama Cloud

### Quick Configuration Commands

```bash
# Configure API keys for cloud providers (OpenAI, Anthropic)
jarvis provider setup

# Configure gateway settings (web console)
jarvis gateway setup

# Re-run full setup wizard
jarvis init
```

### Basic Commands

```bash
# List available skills
jarvis list-skills

# Run a skill
jarvis run-skill --skill ./skills/sample-note-skill.yml

# Run a skill with parameters
jarvis run-skill --skill ./skills/example.yml --name "John" --age 30

# View your Obsidian vault
jarvis inspect-vault

# Create a note
jarvis create-note --title "My Todo" --filename todos.md --content "- [ ] Task"

# Speech to text
jarvis listen --file audio.wav --out transcript.txt

# Text to speech
jarvis speak --text "Hello world" --out greeting.wav

# Run skill in sandbox
jarvis run-sandbox --skill ./skills/example.yml --timeout 5000

# Get help
jarvis --help
```

### Gateway Commands

```bash
# Start the web console
jarvis gateway start

# Check gateway status
jarvis gateway status

# Configure gateway settings
jarvis gateway setup
```

The UI Gateway provides:
- Chat interface with your assistant
- Provider switching (Ollama, OpenAI, Anthropic)
- System status monitoring
- Action execution interface
- Memory search

### Provider Commands

```bash
# List configured providers
jarvis provider list

# Switch default provider
jarvis provider use ollama_local

# Configure API keys interactively
jarvis provider setup
```

Supported providers:
- **Ollama Local** - Runs locally on your machine
- **Ollama Cloud** - Cloud-hosted Ollama instances
- **OpenAI** - GPT-4, GPT-3.5-turbo (requires API key)
- **Anthropic** - Claude models (requires API key)

---

## 🎯 Example Workflows

### Workflow 1: Fresh Install & Setup

```bash
# Step 1: Install globally
npm install -g .

# Step 2: Initialize (creates config)
jarvis init
# → Choose name: "Jarvis" (or custom)
# → Choose mode: "text+voice"
# → Configure audio backends (or skip)
# → Configure gateway (enable web console)
# → Configure API keys for providers (optional)
# → (other setup questions)

# Step 3: Verify installation
jarvis list-skills

# Step 4: Run a skill
jarvis run-skill --skill ./skills/sample-note-skill.yml
```

### Workflow 2: Add API Keys Later

```bash
# Want to use OpenAI or Anthropic?
jarvis provider setup

# Follow prompts to enter API keys
# Keys are saved securely to .env file
```

### Workflow 3: Enable Web Console

```bash
# Configure and enable the gateway
jarvis gateway setup

# Start the gateway
jarvis gateway start

# Access at http://localhost:3096
```

### Workflow 4: Use From Any Directory

```bash
# After global install, you can do this from ANYWHERE:

cd ~/Documents
jarvis list-skills

cd ~/Projects/MyGame
jarvis run-skill --skill ./skills/test.yml

cd /tmp
jarvis speak --text "I work from anywhere!"
```

### Workflow 5: Reconfigure Anytime

```bash
# Want to change settings? Just run init again:
jarvis init

# You'll be prompted to:
# - Continue with existing config
# - Reset config
# - Configure API keys only
# - Configure gateway only
# - Skip setup
```

---

## 📂 What Gets Created

After running `jarvis init`, in your working directory you'll have:

```
.
├── harness.config.json     # Your settings (all backends, vault path, etc.)
└── .env                    # Secrets (API keys, AccessKeys) - git-ignored
```

### Example `harness.config.json`

```json
{
  "name": "Jarvis",
  "mode": "text+voice",
  "ollama": { "baseUrl": "http://localhost:11434" },
  "openai": { 
    "apiKey": "sk-...",
    "model": "gpt-4o-mini",
    "baseUrl": "https://api.openai.com/v1"
  },
  "anthropic": {
    "apiKey": "sk-ant-...",
    "model": "claude-3-haiku-20240307",
    "baseUrl": "https://api.anthropic.com/v1"
  },
  "audio": {
    "stt": { "backend": "whisper", "endpoint": "http://localhost:8000" },
    "tts": { "backend": "http", "endpoint": "http://localhost:5500" },
    "wakeWord": { "enabled": true, "keyword": "jarvis" }
  },
  "gateway": {
    "enabled": true,
    "port": 3096
  },
  "vaultPath": "/Users/you/Obsidian/MyVault",
  "permissions": { "sandboxByDefault": true }
}
```

### Example `.env`

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
PICOVOICE_ACCESS_KEY=your_key_here
```

---

## 🔧 Installation Methods Reference

| Method | Install Command | Usage | Best For |
|--------|-----------------|-------|----------|
| **Global** | `npm install -g .` | `jarvis command` | Daily use, users |
| **Local** | `npm install` | `npm run cli -- command` | Development |
| **Link** | `npm link` | `jarvis command` | Development with live edits |

---

## 📚 Documentation Files

I've created several guides for you:

1. **[QUICK_START.md](QUICK_START.md)** - 30-second install guide
2. **[INSTALLATION.md](INSTALLATION.md)** - Complete installation & usage guide
3. **[DEVELOPMENT.md](DEVELOPMENT.md)** - Guide for developers
4. **[README.md](README.md)** - Feature overview

---

## ✅ Verification

### Check Installation

```bash
# Verify jarvis command exists
which jarvis
# Output: /path/to/nvm/versions/node/v24.14.0/bin/jarvis

# Check version
npm list -g jarvis-harness
# Output: jarvis-harness@0.1.0
```

### Test It Works

```bash
# From project directory
cd /workspaces/new-harness-system
jarvis --help

# From anywhere
cd ~
jarvis --help
```

---

## 🐛 Troubleshooting

### "jarvis: command not found"

```bash
# Make sure it's installed
npm install -g .

# Verify
which jarvis
```

### "Error: Project not built"

```bash
# Build the project
npm run build
```

### "Config not found" (first time)

```bash
# This is expected! Just run setup:
jarvis init
```

### Need to reconfigure API keys?

```bash
# Configure API keys only
jarvis provider setup
```

### Need to reconfigure gateway?

```bash
# Configure gateway only
jarvis gateway setup
```

### Need to reset everything?

```bash
# Delete config and start over
rm harness.config.json .env
jarvis init
```

---

## 🌍 Publishing to npm (Future)

When you're ready to publish to npm so others can install with `npm install -g jarvis-harness`:

```bash
# Update version
npm version patch

# Publish
npm publish

# Users can then install with:
npm install -g jarvis-harness
```

---

## 📋 What's Been Set Up For You

✓ **CLI Entry Point** - `bin/jarvis.js` with proper shebang  
✓ **Global Command** - `jarvis` available system-wide  
✓ **npm bin field** - Registered in package.json  
✓ **First-run Wizard** - Interactive onboarding  
✓ **Configuration System** - Saves to harness.config.json + .env  
✓ **Help Command** - `jarvis --help` shows all options  
✓ **Development Mode** - `npm link` for live editing  
✓ **Multiple Installation Methods** - Global, local, and linked  
✓ **Complete Documentation** - INSTALLATION.md, DEVELOPMENT.md, QUICK_START.md  
✓ **API Key Management** - `jarvis provider setup` for easy configuration  
✓ **Gateway Configuration** - `jarvis gateway setup` for web console  
✓ **Reflexive Model Routing** - Automatic fallback between providers  

---

## 🚀 Next Steps

1. **Install globally:**
   ```bash
   npm install -g .
   ```

2. **Run setup:**
   ```bash
   jarvis init
   ```

3. **Configure API keys (optional):**
   ```bash
   jarvis provider setup
   ```

4. **Enable web console (optional):**
   ```bash
   jarvis gateway setup
   jarvis gateway start
   ```

5. **Start using:**
   ```bash
   jarvis list-skills
   jarvis run-skill --skill ./skills/example.yml
   ```

6. **Explore:**
   - Read [INSTALLATION.md](INSTALLATION.md) for detailed options
   - Read [DEVELOPMENT.md](DEVELOPMENT.md) if you want to customize

---

## 💡 Tips

- **Backup your config:** Keep `harness.config.json` and `.env` safe
- **Secrets in .env:** Never commit `.env` to git
- **Update anytime:** Run `jarvis init` to reconfigure
- **Use from anywhere:** After global install, use `jarvis` in any folder
- **Live editing:** Use `npm link` + `npm run dev` during development
- **Quick API key setup:** Use `jarvis provider setup` instead of full init
- **Web console access:** Start gateway with `jarvis gateway start` and visit http://localhost:3096

---

**You're all set! 🎉 Start using `jarvis` from your terminal.**

For detailed information, see [INSTALLATION.md](INSTALLATION.md) or [README.md](README.md)
