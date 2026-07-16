# Model Providers

## Options
- **Local Ollama** - Default, runs models via `http://localhost:11434`
- **Ollama Cloud** - Remote Ollama-compatible endpoints
- **OpenAI-Style** - OpenAI, NVIDIA NIM, Lightning AI, NeMo Proxy
- **Anthropic** - Claude models via official API

## Provider Priority Chain
1. ollama-cloud (5 credits budget)
2. ollama (local fallback)
3. openai (10 credits budget, requires API key)
4. anthropic (10 credits budget, requires API key)

## Switching
- Use `jarvis provider list` to see configured providers
- Use `jarvis provider use <name>` to switch at runtime
- The autonomous agent uses the currently active provider