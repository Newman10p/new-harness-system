# ✅ M.A.I. Configuration Complete

## Personalized for Bulega Farid (The Deadman)

All configuration files have been properly set up with your credentials, preferences, and directory paths.

---

## 📁 Files Created/Updated

### 1. `.env` - Environment Variables
**Location:** `/workspace/.env`

Contains:
- **Ollama Cloud credentials** (primary provider)
  - Base URL: `https://api.ollama.com`
  - API Key: `39f0a0760f774b229aff43338d93c300.wwfgYsH7lggEs7uaRZyBU2g3`
  - Model: `gpt-oss:120b`
  
- **OpenRouter backup** (GLM-5.2 Free)
  - Placeholder: `<OPENROUTER_API_KEY>` - **You need to add this**
  
- **Directory paths:**
  - Vault: `./vault`
  - Skills: `./skills`
  - Sandbox: `./sandbox`
  - Browser screenshots: `./vault/browser-screenshots`

- **Audio paths:**
  - STT (Moonshine): `/home/deadman/models/moonshine/base/onnx/`
  - TTS (Piper): `/home/deadman/piper-models/en_US-lessac-medium.onnx`

- **Email placeholders:**
  - `GMAIL_USERNAME` and `GMAIL_PASSWORD` - Add your Gmail credentials

- **Server ports:**
  - HTTP: 3000
  - WebSocket: 8080
  - Gateway: 3096

### 2. `harness.config.json` - Main Configuration
**Location:** `/workspace/harness.config.json`

Complete JSON configuration including:
- **Model providers** (priority order):
  1. Ollama Cloud (`gpt-oss:120b`)
  2. OpenRouter GLM-5.2 Free (`z-ai/glm-5.2:free`)
  3. Local Ollama (`llama3.2`)
  4. Local Ollama Tiny (`phi3-mini`)

- **User profile:**
  - Name: Bulega Farid
  - Public name: The Deadman
  - Preferred address: sir
  - DOB: 2007-11-25
  - Learning enabled: true

- **UI themes:**
  - Black & Red
  - Black & Blue (default)
  - Office White
  - Adjustable colors: Blue, Green, Red, Black

- **Permissions:**
  - Safety level: Balanced → Experimental
  - Sandbox-first execution: Enabled
  - Confirmation required: Disabled (sandbox first)
  - MCP server support: Enabled

- **Browser control:**
  - Auto-discover: Enabled
  - Ports: 9222, 9223, 9224
  - Auto-launch Chrome & Brave: Enabled

- **Email integration:**
  - Gmail IMAP/SMTP configured
  - Max messages per fetch: 200

- **Search:**
  - Engine: DuckDuckGo (free, no API key)
  - Max results: 8

- **Router:**
  - Auto-detect local models: Enabled
  - Minimum confidence: 0.6

---

## 🔐 Action Required

### 1. Add OpenRouter API Key
Edit `.env` and replace `<OPENROUTER_API_KEY>` with your actual key:
```bash
OPENROUTER_API_KEY=your_actual_key_here
```

Get a free key from: https://openrouter.ai/keys

### 2. Add Gmail Credentials (Optional)
If you want email functionality, edit `.env`:
```bash
GMAIL_USERNAME=your.email@gmail.com
GMAIL_PASSWORD=your_app_password
```

**Note:** Use an [App Password](https://support.google.com/accounts/answer/185833), not your regular password.

---

## 🚀 Quick Start

### 1. Ensure Ollama is Running Locally (for fallback models)
```bash
ollama serve
```

### 2. Pull Required Local Models
```bash
ollama pull llama3.2
ollama pull phi3-mini
```

### 3. Start M.A.I.
```bash
# Terminal mode
node bin/mai.js

# Or start the web gateway
npm start
```

### 4. Access Interfaces
- **Web UI:** http://localhost:3000
- **Gateway/Chat:** http://localhost:3096/chat
- **WebSocket HUD:** ws://localhost:8080

---

## 🎯 System Capabilities

### Primary Use Cases
✅ Coding & Engineering Research  
✅ Simulations (3D ready, disabled by default)  
✅ File Management & Administration  
✅ Automation & MCP Server Integration  
✅ System Resource Monitoring  

### Security Model
- **Sandbox-first:** All commands run in sandbox before live application
- **No confirmations needed** for sandboxed operations
- **Balanced → Experimental** safety progression
- Full terminal, network, and device access enabled

### Memory & Learning
- Short-term + Long-term memory active
- Learns from your patterns over time
- Remembers: Name, public name, preferred address, DOB

---

## 📊 Model Fallback Chain

```
┌─────────────────────────────────────┐
│  1. Ollama Cloud (Primary)          │
│     gpt-oss:120b                    │
│     https://api.ollama.com          │
└──────────────┬──────────────────────┘
               │ If unavailable
               ▼
┌─────────────────────────────────────┐
│  2. OpenRouter GLM-5.2 (Backup)     │
│     z-ai/glm-5.2:free               │
│     Requires: OPENROUTER_API_KEY    │
└──────────────┬──────────────────────┘
               │ If unavailable
               ▼
┌─────────────────────────────────────┐
│  3. Local Ollama (Fallback 1)       │
│     llama3.2                        │
│     localhost:11434                 │
└──────────────┬──────────────────────┘
               │ If unavailable
               ▼
┌─────────────────────────────────────┐
│  4. Local Ollama Tiny (Fallback 2)  │
│     phi3-mini                       │
│     localhost:11434                 │
└─────────────────────────────────────┘
```

---

## 🛠️ Next Steps

1. **Add your OpenRouter API key** to `.env`
2. **Test the connection:**
   ```bash
   node bin/mai.js
   ```
3. **Say hello to M.A.I.** - She'll greet you as "sir" or "The Deadman" based on context!

---

**System Status:** ✅ Ready for deployment  
**Configuration:** ✅ Personalized  
**Backend:** ✅ Multi-provider failover configured  
**OpenRouter Integration:** ✅ SDK-ready (awaiting API key)
