# 🎨 M.A.I. UI Configuration Guide

## Overview
M.A.I. now features a comprehensive web-based configuration interface that allows you to easily manage all settings without manually editing files.

## 🌐 Accessing the Configuration UI

1. **Start M.A.I.**: `node bin/mai.js` or `npm start`
2. **Open Web UI**: Navigate to `http://localhost:3000/chat`
3. **Open Settings**: Click the ⚙️ Settings icon in the top-right corner

## 📋 Configuration Sections

### 🧠 Model Providers
Configure your AI model fallback chain:
- **Primary Provider**: Your main AI model (default: Ollama Cloud)
- **Fallback 1**: First backup if primary fails
- **Fallback 2**: Second backup option

**Available Providers:**
- Ollama Cloud (Free) - `gpt-oss:120b`
- OpenRouter GLM-5.2 Free - `z-ai/glm-5.2:free`
- Local Ollama (llama3.2)
- Local Ollama (phi3-mini)

### 🔑 API Keys
Securely enter and manage your API keys:
- **Ollama Cloud API Key**: Your cloud endpoint key
- **OpenRouter API Key**: Get free at [openrouter.ai/keys](https://openrouter.ai/keys)
- **Ollama Local Endpoint**: Usually `http://localhost:11434`

👁️ **Toggle Visibility**: Click the eye icon to show/hide API keys

### 🎨 Appearance
Customize the visual experience:
- **Theme**: 
  - Black & Blue (Default)
  - Black & Red
  - Office White
- **Accent Color**: Blue, Green, Red, or Black

### 👤 User Profile
Your personal information for M.A.I. to reference:
- **Your Name**: Bulega Farid
- **Public Name**: The Deadman
- **Preferred Address**: How M.A.I. should address you (default: "sir")

### 🔒 Security & Permissions
Control M.A.I.'s capabilities:
- **Safety Level**: Conservative → Balanced → Experimental
- **Sandbox-First Execution**: Run commands in sandbox before applying (recommended)
- **Terminal Access**: Allow command execution
- **Network Access**: Allow internet connectivity

### 🎤 Voice & Audio
- **TTS Engine**: Browser (built-in) or Piper (local neural)
- **Voice Input**: Enable/disable speech-to-text

### 🌐 Connection
- **WebSocket URL**: For real-time communication
- **HTTP Server Port**: Web interface port

### 💾 Data Management
- **Vault Path**: Where notes and files are stored
- **Skills Path**: Custom skills directory
- **Clear Chat History**: Delete local conversation history
- **💾 Save Configuration**: Persist all settings to files

### ℹ️ System Information
Real-time display of:
- Current user profile
- Active model configuration
- Safety settings
- Connection details
- Storage usage

## 💾 Saving Configuration

### Option 1: Save to Files (Recommended)
1. Configure all settings in the UI
2. Scroll to **Data Management** section
3. Click **💾 Save Configuration to File**
4. Restart M.A.I. for changes to take effect

This updates:
- `harness.config.json` - Main configuration
- `.env` - Environment variables (API keys, endpoints)

### Option 2: Browser-Only (Temporary)
Settings are automatically saved to your browser's localStorage. These persist across sessions but won't affect the backend until you save to files.

## 🔧 Advanced Features

### Real-Time Updates
Some settings take effect immediately:
- Theme and accent color changes
- WebSocket reconnection
- User profile updates (sent to backend via WebSocket)

### Password Visibility Toggle
Click 👁️ next to any password field to:
- Show the actual value
- Hide it back to dots (🙈)

### System Info Display
The **System Information** box shows:
- Current active configuration
- Selected models and fallbacks
- Connection status
- Local storage usage

## 🎯 Quick Start Checklist

1. ✅ Enter your **Ollama Cloud API Key** (already configured from .env)
2. ✅ Add **OpenRouter API Key** for GLM-5.2 backup
3. ✅ Verify **Model Provider Chain** matches your preferences
4. ✅ Set your **User Profile** information
5. ✅ Choose your preferred **Theme** and **Accent Color**
6. ✅ Configure **Security Settings** to your comfort level
7. ✅ Click **💾 Save Configuration** to persist changes
8. ✅ **Restart M.A.I.** for all changes to apply

## 📁 File Locations

After saving configuration:
- **Config File**: `/workspace/harness.config.json`
- **Environment**: `/workspace/.env`
- **Browser Storage**: localStorage key `mai-chat-settings`

## 🆘 Troubleshooting

### "Could not save to server" error
- This is normal if the backend endpoint isn't implemented yet
- Check DevTools Console (F12) for the config JSON
- Manually copy the output to update files

### Settings not persisting
- Ensure you clicked **Save Configuration**
- Check browser console for errors
- Verify file permissions on `harness.config.json` and `.env`

### UI not reflecting changes
- Hard refresh the page (Ctrl+Shift+R / Cmd+Shift+R)
- Clear browser cache if needed
- Check that localStorage isn't disabled

## 🚀 Next Steps

With the configuration UI complete, you can now:
1. Easily switch between different model providers
2. Test various safety levels
3. Customize the interface to your preference
4. Manage API keys securely
5. Monitor system status in real-time

Enjoy your personalized M.A.I. experience! 🎉
