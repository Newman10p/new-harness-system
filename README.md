# M.A.I. — Multiple Array Intelligence

Professional AI assistant interface with configurable model providers and clean, minimal design.

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server (web UI + API)
npm start

# Or use CLI only
npm run cli
```

## Access Points

- **Web UI**: http://localhost:3000/chat
- **CLI**: `node bin/mai.js` or `./bin/mai.js` after `npm link`

## Configuration

All settings are configurable through the web interface:

1. Click the ⚙️ icon in the top-right
2. Configure models, API keys, appearance, security
3. Click "Save Configuration" to download `harness.config.json`

### Model Providers

- **Primary**: Ollama Cloud (free tier)
- **Fallback 1**: OpenRouter GLM-5.2 Free
- **Fallback 2**: Local Ollama (llama3.2, phi3-mini)

### Required Environment Variables

Create a `.env` file:

```bash
# Ollama Cloud (primary)
LLM_BASE_URL=https://api.ollama.com
LLM_API_KEY=your-ollama-cloud-key
LLM_MODEL=gpt-oss:120b
LLM_PROVIDER=ollama-cloud

# OpenRouter (backup)
OPENROUTER_API_KEY=your-openrouter-key

# Local paths
VAULT_PATH=./vault
SKILLS_PATH=./skills
SANDBOX_PATH=./sandbox
```

## Features

- **Clean UI**: Professional, minimal design following human-centered principles
- **Multi-Model Support**: Automatic fallback chain
- **Configurable**: All settings via web interface
- **Secure**: Sandbox-first execution, configurable safety levels
- **Themes**: Black & Blue, Black & Red, Office White
- **Accent Colors**: Blue, Green, Red, Black

## File Structure

```
/workspace
├── bin/mai.js          # CLI entry point
├── public/chat/        # Web UI
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/                # TypeScript source
├── dist/               # Compiled JavaScript
├── .env                # Environment variables
├── harness.config.json # Application config
└── package.json
```

## User Profile

- **Name**: Bulega Farid
- **Public Name**: The Deadman
- **Addressed As**: sir
- **DOB**: November 25, 2007

---

Built with restraint and intention. No unnecessary decorations.
