# M.A.I. Personalization Summary

## Identity Configuration
- **Name**: M.A.I. (Multiple Array Intelligence)
- **Pronunciation**: "Mai" (like "my")
- **User**: Bulega Farid (public name: "The Deadman")
- **Address User As**: "sir" (primary), "The Deadman" (casual)
- **Personality**: Professional, casual, humorous, reflexive in greetings

## Model Provider Priority
1. **Ollama Cloud** (Primary) - Free cloud-hosted models
2. **OpenRouter GLM-5.2 Free** (Backup) - z-ai/glm-5.2:free via OpenRouter SDK
3. **Ollama Local Small** - llama3.2 on localhost:11434
4. **Ollama Local Tiny** - phi3-mini on localhost:11434

## UI Themes
- **Black & Red** - Dark theme with red accents
- **Black & Blue** - Dark theme with blue accents (default)
- **Office White** - Light professional theme
- **Adjustable Colors**: Blue, Green, Red, Black

## Interface Modes
- **Terminal-based** - CLI interaction via `bin/mai.js`
- **Web UI** - Browser-based interface at http://localhost:3096
- **Offline UI** - Standalone offline-capable interface (planned)

## Capabilities
- **Coding** - Full-stack development assistance
- **Engineering Research** - Technical analysis and simulations
- **File Management** - Vault integration, file operations
- **Administration** - System monitoring, process management
- **Automation** - Workflow automation, skill creation
- **MCP Server Support** - Automatic MCP server attachment capabilities

## Security & Permissions
- **Safety Level**: Balanced → Experimental
- **Sandbox First**: Commands execute in sandbox before live application
- **Confirmation**: Not required for sandboxed commands
- **Advanced Tools**: Enabled
- **Terminal Access**: Enabled
- **Network Access**: Enabled
- **Device Access**: Enabled

## Memory System
- **Short-term**: Session context, recent interactions
- **Long-term**: User profile, learned patterns, preferences
- **Learning**: Enabled - adapts to user patterns over time
- **Semantic Search**: Query-based memory retrieval

## Key Files Modified
- `harness.config.json` - Main configuration with all personalization settings
- `src/config.ts` - TypeScript config types and defaults
- `agent/identity.md` - M.A.I. identity and personality definition
- `agent/memory.md` - Memory system with user profile
- `src/core/OpenRouterClient.ts` - OpenRouter SDK integration (NEW)

## Environment Variables Required
```bash
# OpenRouter API Key (for GLM-5.2 free tier backup)
OPENROUTER_API_KEY=your_key_here

# Optional: Custom OpenRouter endpoint
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Optional: Override default model
OPENROUTER_MODEL=z-ai/glm-5.2:free
```

## Next Steps
1. Set your `OPENROUTER_API_KEY` environment variable
2. Ensure Ollama is running locally with required models
3. Configure Ollama Cloud endpoint if using
4. Run `npm run build` to compile TypeScript
5. Start with `node bin/mai.js` or `npm start`

## Usage Examples

### Terminal
```bash
node bin/mai.js "Hello M.A.I."
```

### Web UI
Open browser to http://localhost:3096/chat

### Programmatic
```typescript
import { createOpenRouterFromEnv } from "./src/core/OpenRouterClient.js";

const openRouter = createOpenRouterFromEnv();
if (openRouter) {
  const stream = openRouter.simpleStream([
    { role: "user", content: "How many r's in strawberry?" }
  ]);
  for await (const chunk of stream) {
    process.stdout.write(chunk);
  }
}
```
