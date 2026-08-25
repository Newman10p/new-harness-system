# Installation Guide for M.A.I. Harness

Complete guide for installing, configuring, and running M.A.I. (Multiple Array Intelligence).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Methods](#installation-methods)
3. [Configuration](#configuration)
4. [Running M.A.I.](#running-mai)
5. [Voice Setup](#voice-setup)
6. [Browser Control Setup](#browser-control-setup)
7. [Email Setup](#email-setup)
8. [Gateway Channels](#gateway-channels)
9. [Cloud Tunnel](#cloud-tunnel)
10. [Uninstallation](#uninstallation)
11. [Troubleshooting](#troubleshooting)

## Prerequisites

- **Node.js** >= 18 (tested with 18.x, 20.x, 22.x, 24.x)
- **npm** (comes with Node.js)
- **An LLM endpoint** — at least one of:
  - [Ollama](https://ollama.ai/) (local, free, recommended for getting started)
  - OpenAI API key
  - Anthropic API key
  - NVIDIA NIM API key
  - Any OpenAI-compatible endpoint

## Installation Methods

### Method 1: Global Installation (Recommended for Users)

Install M.A.I. as a global CLI tool accessible from anywhere on your device.

#### From GitHub Source

```bash
# Clone the repository
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system

# Install dependencies
npm install

# Compile TypeScript
npm run build

# Install globally
npm install -g .

# Verify installation
npx mai --help
```

#### From npm Registry (When Published)

```bash
npm install -g mai-harness
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
npm run cli
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

# Now use the mai command, changes reflect after rebuild
npx mai --help

# Watch mode for automatic rebuilding (terminal 1)
npm run dev

# In another terminal, use mai commands (terminal 2)
npx mai --help
```

To unlink:
```bash
npm unlink -g mai-harness
```

## Configuration

### Step 1: LLM Provider

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your LLM settings. Choose **one** provider:

**Local Ollama (default, free):**
```
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.2
LLM_PROVIDER=ollama
```

**Ollama Cloud:**
```
LLM_BASE_URL=https://api.ollama.ai/v1
LLM_API_KEY=oll-cloud-xxxxxxxxxxxxxxxx
LLM_MODEL=llama3.2
LLM_PROVIDER=ollama-cloud
```

**OpenAI:**
```
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-your-key-here
LLM_MODEL=gpt-4o-mini
LLM_PROVIDER=openai
```

**Anthropic:**
```
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_API_KEY=sk-ant-your-key-here
LLM_MODEL=claude-3-haiku-20240307
LLM_PROVIDER=anthropic
```

**NVIDIA NIM:**
```
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_API_KEY=nvapi-your-key-here
LLM_MODEL=meta/llama3-70b-instruct
LLM_PROVIDER=nvidia
```

### Step 2: Runtime Config

Edit `harness.config.json` in the project root. Key sections:

```json
{
  "assistantName": "Mai",
  "model": "llama3.2",
  "ollama": {
    "endpoint": "http://127.0.0.1:11434",
    "model": "llama3.2"
  },
  "browserControl": {
    "enabled": true,
    "autoDiscover": true,
    "defaultPorts": [9222, 9223, 9224, 9225],
    "screenshotDir": "./vault/browser-screenshots"
  },
  "email": {
    "enabled": true,
    "accounts": [],
    "maxMessagesPerFetch": 20
  }
}
```

### Configuration Files Summary

| File | Purpose | Committed to Git? |
|------|---------|-------------------|
| `harness.config.json` | All runtime settings | Yes (exclude secrets) |
| `.env` | API keys and secrets | No (.gitignore) |
| `agent/policy.md` | Security policy (deny/allow/approval) | Yes |
| `agent/identity.md` | Agent personality and behavior | Yes |
| `agent/models.md` | Model routing config | Yes |

## Running M.A.I.

### Server Mode (Recommended)

Starts the full system with HUD, WebSocket, API routes, and Chat PWA:

```bash
# From source (dev)
npx tsx src/server.ts

# From compiled build
npm start
```

Then open:
- **HUD Frontend:** http://localhost:3000
- **Chat PWA:** http://localhost:3000/chat/
- **WebSocket:** ws://localhost:8080
- **API:** http://localhost:3000/api/status

### CLI Mode

Interactive terminal REPL with slash commands:

```bash
# From source (dev)
npx tsx src/index.ts

# From compiled build
npm run cli
```

## Voice Setup

M.A.I. supports multiple TTS and STT backends with automatic fallback.

### Text-to-Speech (TTS)

**Option A: Kokoro (Recommended, best quality)**

1. Install Kokoro binary or ONNX runtime
2. Download voice model (e.g., `kokoro-v0.5-en.onnx`)
3. Configure environment:
   ```
   KOKORO_BIN=/path/to/kokoro          # or "onnx"
   KOKORO_MODEL=/path/to/model.onnx
   KOKORO_CONFIG=/path/to/config.json
   ```
4. Set in `harness.config.json`: `audio.tts.backend: "kokoro"`

Falls back to Piper if unavailable.

**Option B: Piper (Good quality, lightweight)**

1. Install [Piper](https://github.com/rhasspy/piper)
2. Download a voice model
3. Set in `harness.config.json`: `audio.tts.backend: "piper"`

**Option C: HTTP TTS (Remote)**

1. Run a TTS server (Coqui, Bark, etc.)
2. Configure endpoint:
   ```json
   { "audio": { "tts": { "backend": "http", "endpoint": "http://localhost:5500/tts" } } }
   ```

### Speech-to-Text (STT)

**Option A: Moonshine (Recommended, 5x faster than Whisper)**

1. Download Moonshine ONNX models
2. Install `onnxruntime-node`
3. Configure:
   ```
   MOONSHINE_MODEL_DIR=/path/to/moonshine-models
   MOONSHINE_LANG=en
   ```
4. Set `audio.stt.backend: "moonshine"`

Falls back to Whisper if unavailable.

**Option B: Whisper (Highest accuracy)**

1. Run a Whisper server or install locally
2. Configure endpoint:
   ```json
   { "audio": { "stt": { "backend": "whisper", "endpoint": "http://localhost:8000/transcribe" } } }
   ```

### Wake Word

Enable always-listening mode with wake word detection:

```json
{
  "audio": {
    "wakeWord": {
      "enabled": true,
      "keyword": "mai"
    }
  }
}
```

## Browser Control Setup

M.A.I. can control Chrome and Brave browsers directly via CDP (no Puppeteer/Playwright needed).

### Step 1: Enable Remote Debugging

Launch your browser with remote debugging:

```bash
# Chrome
google-chrome --remote-debugging-port=9222

# Brave
brave-browser --remote-debugging-port=9223

# Both at once
google-chrome --remote-debugging-port=9222 &
brave-browser --remote-debugging-port=9223 &
```

### Step 2: Configure

`harness.config.json`:
```json
{
  "browserControl": {
    "enabled": true,
    "autoDiscover": true,
    "defaultPorts": [9222, 9223, 9224, 9225],
    "autoLaunchChrome": false,
    "autoLaunchBrave": false,
    "headless": false,
    "screenshotDir": "./vault/browser-screenshots"
  }
}
```

### Step 3: Use

M.A.I. can now browse autonomously. Ask things like:
- "Search Google for the latest Node.js release"
- "Open GitHub and check my notifications"
- "Take a screenshot of my current tab"
- "Find the tab with YouTube and close it"

## Email Setup

M.A.I. connects to email via IMAP/SMTP using zero external dependencies.

### Step 1: Get Credentials

**Gmail:** Create an [App Password](https://myaccount.google.com/apppasswords) (16 chars, spaces optional)

**Outlook:** Use your regular password or app-specific password

**Custom IMAP:** Any IMAP/SMTP server with TLS support

### Step 2: Configure

Add accounts to `harness.config.json`:

```json
{
  "email": {
    "enabled": true,
    "accounts": [
      {
        "id": "gmail-main",
        "label": "Gmail",
        "host": "imap.gmail.com",
        "port": 993,
        "smtpHost": "smtp.gmail.com",
        "smtpPort": 465,
        "username": "you@gmail.com",
        "password": "abcd efgh ijkl mnop",
        "tls": true
      }
    ],
    "maxMessagesPerFetch": 20
  }
}
```

### Step 3: Use

- "Check my unread emails"
- "Search my inbox for password reset emails"
- "Send an email to john@example.com saying the meeting is at 3pm"
- "Mark all emails from newsletter@example.com as read"

## Gateway Channels

Connect M.A.I. to external messaging platforms. Add to `.env`:

```bash
# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxx
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890

# WhatsApp (via Twilio)
TWILIO_WHATSAPP_SID=whatsapp-sid

# SIP / Voice
SIP_SERVER=sip:provider.com
SIP_USER=username
SIP_PASS=password

# GitHub Notifications
GITHUB_TOKEN=ghp_xxxxx

# Slack Notifications
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_SIGNING_SECRET=xxx

# Gmail Notifications (OAuth)
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=xxx
GMAIL_REFRESH_TOKEN=xxx

# RSS Feeds
RSS_FEEDS=https://hnrss.org/frontpage,https://blog.rust-lang.org/feed.xml
```

Gateway config is auto-loaded from `state/gateway-config.json` at startup. You can also configure channels dynamically via the HUD.

## Cloud Tunnel

Expose M.A.I. securely to the internet. Add to `.env`:

```bash
# Cloudflare Tunnel
TUNNEL_METHOD=cloudflare
CLOUDFLARE_TUNNEL_TOKEN=your-token

# Or Ngrok
TUNNEL_METHOD=ngrok
NGROK_AUTH_TOKEN=your-token

# Or WireGuard
TUNNEL_METHOD=wireguard
WIREGUARD_CONFIG_PATH=/path/to/wg0.conf
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Start server mode (HTTP + WS) |
| `npm run cli` | Start CLI REPL mode |
| `npm run dev` | Watch mode (auto-recompile) |

## Uninstallation

### Remove Global Installation

```bash
npm unlink -g mai-harness
# or
npm uninstall -g mai-harness
```

### Remove Configuration (Optional)

```bash
# Remove secrets
rm .env

# Remove auto-start scripts (if created)
rm -rf scripts/
```

**Note:** Keep `harness.config.json`, `agent/`, `memory/`, and `vault/` if you want to preserve your data.

## Troubleshooting

### "mai: command not found"

```bash
# Verify installation
npm list -g mai-harness

# Reinstall
npm install -g .
```

### "Error: Project not built"

```bash
npm run build
```

### "Cannot connect to LLM"

1. Verify your LLM is running: `curl http://localhost:11434/api/tags` (Ollama)
2. Check your `.env` has the correct `LLM_BASE_URL` and `LLM_API_KEY`
3. Try a different provider in `.env`

### Browser not discovered

1. Ensure browser is running with `--remote-debugging-port=9222`
2. Verify port is open: `curl http://localhost:9222/json/version`
3. Check `harness.config.json` has `browserControl.enabled: true`

### Email connection fails

1. For Gmail: ensure you're using an [App Password](https://myaccount.google.com/apppasswords), not your regular password
2. Verify IMAP is enabled in your email settings
3. Test connectivity: `openssl s_client -connect imap.gmail.com:993`

### Voice not working

1. Check audio config in `harness.config.json`
2. For Kokoro: verify `KOKORO_BIN` and `KOKORO_MODEL` env vars point to valid files
3. For Moonshine: verify `MOONSHINE_MODEL_DIR` contains the ONNX model files
4. Check that the TTS/STT endpoint is running (for HTTP backends)

### Type errors during build

M.A.I. uses `--noEmitOnError false` in tsconfig.json to allow builds with pre-existing type errors in non-critical files. This is intentional and does not affect runtime.

## Support

- **Repository:** https://github.com/Newman10p/new-harness-system
- **Issues:** https://github.com/Newman10p/new-harness-system/issues

## Next Steps

- [Development Guide](DEVELOPMENT.md) — Contributing and customizing
- [README.md](README.md) — Feature overview and architecture
- [Quick Start](QUICK_START.md) — 30-second setup
