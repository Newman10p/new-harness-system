# How to Install & Use M.A.I. Harness

Complete setup guide for M.A.I. (Multiple Array Intelligence).

---

## Installation (Choose One Method)

### Method 1: Global Install (Recommended)

```bash
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system
npm install && npm run build && npm install -g .
```

### Method 2: Local Development

```bash
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system
npm install && npm run build
```

Run with:
```bash
npm start       # Server mode
npm run cli      # CLI mode
```

### Method 3: Development Link

```bash
npm install && npm run build && npm link
npm run dev     # Terminal 1: watch mode
npx mai --help  # Terminal 2: test commands
```

---

## Configuration

### 1. LLM Provider

Create `.env` from the example:
```bash
cp .env.example .env
```

**Local Ollama (free):**
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

**Anthropic:**
```
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_API_KEY=sk-ant-your-key-here
LLM_MODEL=claude-3-haiku-20240307
LLM_PROVIDER=anthropic
```

### 2. Runtime Config (`harness.config.json`)

The main config file. Key sections:

```json
{
  "assistantName": "Mai",
  "model": "llama3.2",
  "browserControl": {
    "enabled": true,
    "autoDiscover": true,
    "defaultPorts": [9222, 9223, 9224, 9225]
  },
  "email": {
    "enabled": true,
    "accounts": []
  }
}
```

---

## Running M.A.I.

### Server Mode (Full System)

```bash
npx tsx src/server.ts
# Or: npm start
```

Opens:
- HUD: http://localhost:3000
- Chat PWA: http://localhost:3000/chat/
- API: http://localhost:3000/api/status
- WebSocket: ws://localhost:8080

### CLI Mode (Terminal REPL)

```bash
npx tsx src/index.ts
# Or: npm run cli
```

---

## Optional Features

### Browser Control

Launch Chrome/Brave with remote debugging:
```bash
google-chrome --remote-debugging-port=9222
```

M.A.I. auto-discovers and can browse autonomously.

### Email Access

Add accounts to `harness.config.json` under `email.accounts`:
- **Gmail:** Use an [App Password](https://myaccount.google.com/apppasswords)
- **Outlook:** Standard IMAP/SMTP credentials
- **Custom:** Any IMAP server with TLS

### Voice

Configure in `harness.config.json` under `audio`:
- **TTS:** kokoro (best), piper, or http endpoint
- **STT:** moonshine (fastest), whisper (most accurate), or http endpoint

### Gateway Channels

Add to `.env`:
```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TWILIO_ACCOUNT_SID=ACxxxxxx
GITHUB_TOKEN=ghp_xxxxx
SLACK_BOT_TOKEN=xoxb-xxx
```

### Cloud Tunnel

```bash
# Cloudflare
TUNNEL_METHOD=cloudflare
CLOUDFLARE_TUNNEL_TOKEN=your-token

# Ngrok
TUNNEL_METHOD=ngrok
NGROK_AUTH_TOKEN=your-token
```

---

## What You Get

- **49 action primitives** across 6 groups
- **Browser control** via CDP (Chrome/Brave)
- **Email** via IMAP/SMTP (zero deps)
- **Voice** with Kokoro TTS + Moonshine STT
- **Web search & scraping**
- **4-tier sandbox** isolation
- **Multi-channel gateway** (SMS, Telegram, WhatsApp, SIP)
- **Iron Man HUD** + Chat PWA
- **Markdown-first** config (no recompile needed)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Cannot connect to LLM | Verify Ollama is running: `curl http://localhost:11434/api/tags` |
| Browser not discovered | Launch with `--remote-debugging-port=9222` |
| Email auth fails | Use Gmail App Password, not regular password |
| Build errors | `npm run build` (pre-existing type errors are suppressed intentionally) |

---

## Documentation

| File | Description |
|------|-------------|
| [README.md](README.md) | Full architecture and feature overview |
| [INSTALLATION.md](INSTALLATION.md) | Detailed installation guide |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Developer guide |
| [QUICK_START.md](QUICK_START.md) | This file |
