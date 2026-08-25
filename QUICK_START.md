# Quick Start: M.A.I. Harness

## 30-Second Install

```bash
# Clone the repo
git clone https://github.com/Newman10p/new-harness-system
cd new-harness-system

# Install and build
npm install && npm run build

# Verify
npm run cli -- --help
```

**Done!** You're ready to configure and run.

## First-Time Setup

### 1. Configure Your LLM

```bash
cp .env.example .env
```

Edit `.env` with your provider:

**Local Ollama (free, recommended):**
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

### 2. Run M.A.I.

**Server mode** (HUD + API + Chat PWA):
```bash
npx tsx src/server.ts
# Or after build:
npm start
```

**CLI mode** (terminal REPL):
```bash
npx tsx src/index.ts
# Or after build:
npm run cli
```

### 3. Open the HUD

- **HUD Console:** http://localhost:3000
- **Chat PWA:** http://localhost:3000/chat/
- **API Status:** http://localhost:3000/api/status

## Installation Options

| Method | Install | Run | Best For |
|--------|---------|-----|----------|
| **Source + tsx** | `npm install` | `npx tsx src/server.ts` | Development |
| **Built** | `npm install && npm run build` | `npm start` / `npm run cli` | Daily use |
| **Global** | `npm install -g .` | `npx mai --help` | System-wide access |
| **Dev link** | `npm link` | `npx mai --help` | Live editing |

## Common Commands

```bash
# Build
npm run build

# Server mode (HUD + WebSocket + API)
npm start

# CLI REPL mode
npm run cli

# Watch mode (auto-recompile on changes)
npm run dev
```

## What You Get Out of the Box

- **49 action primitives** across 6 groups (core, intelligence, device control, extended, integration, web/vision)
- **Browser control** — Chrome/Brave automation via CDP (no Puppeteer needed)
- **Email access** — IMAP/SMTP with zero external deps (Gmail, Outlook, custom)
- **Web search & scraping** — Live Google search, page content extraction
- **Voice pipeline** — Kokoro TTS, Piper TTS, Moonshine STT, Whisper STT with auto-fallback
- **4-tier sandbox** — native, process, docker, firejail isolation
- **Multi-device gateway** — SMS, Telegram, WhatsApp, SIP, Webhook
- **Iron Man HUD** — WebSocket-powered real-time dashboard
- **Chat PWA** — Installable progressive web app
- **Markdown-first config** — Edit personality, policy, tools without recompiling

## Enable Browser Control

```bash
# Launch Chrome with remote debugging
google-chrome --remote-debugging-port=9222
```

M.A.I. auto-discovers it. Then ask: "Search Google for the latest TypeScript release"

## Enable Email

Add to `harness.config.json`:
```json
{
  "email": {
    "enabled": true,
    "accounts": [{
      "label": "Gmail",
      "host": "imap.gmail.com",
      "port": 993,
      "smtpHost": "smtp.gmail.com",
      "smtpPort": 465,
      "username": "you@gmail.com",
      "password": "your-app-password"
    }]
  }
}
```

## Troubleshooting

**"Cannot connect to LLM"**
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags
```

**"Project not built"**
```bash
npm run build
```

## Next Steps

1. **[Full Installation Guide](INSTALLATION.md)** — Detailed setup including voice, browser, email, and gateway channels
2. **[README.md](README.md)** — Architecture, all 49 actions, and feature overview
3. **[Development Guide](DEVELOPMENT.md)** — Contributing and customizing

## Support

- **GitHub Issues:** https://github.com/Newman10p/new-harness-system/issues
