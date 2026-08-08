# Voice Configuration

## Modes
- **builtIn** - Local STT (Whisper/Moonshine) + local TTS (Piper/Kokoro) or HTTP TTS
- **custom** - Configurable STT/TTS HTTP endpoints
- **disabled** - No voice support

## STT (Speech-to-Text) Backends

### Whisper (default)
- Backend: `whisper`
- Processes audio files for transcription
- Via `@pr0gramm/fluester` binding or CLI fallback
- Model sizes: tiny, base, small, medium, large
- Slower but more accurate for long audio

### Moonshine (recommended for real-time)
- Backend: `moonshine`
- **5x faster than Whisper** — optimized for real-time voice interaction
- Lower memory footprint (~200MB vs ~1GB)
- Better for short utterances (voice commands, conversation)
- MIT license, ONNX runtime compatible

```json
{
  "audio": {
    "stt": {
      "backend": "moonshine",
      "enabled": true,
      "modelPath": "~/.cache/moonshine/moonshine-tiny/encoder.onnx",
      "language": "en",
      "sampleRate": 16000,
      "maxDuration": 30
    }
  }
}
```

Environment variables:
- `MOONSHINE_MODEL_DIR` — model directory
- `MOONSHINE_MODEL` — encoder model path
- `MOONSHINE_LANG` — language code

## TTS (Text-to-Speech) Backends

### HTTP TTS
- Backend: `http`
- Sends text, receives audio buffer
- Configurable voice and rate
- Default endpoint: `http://localhost:5002/api/tts`

### Piper (local neural TTS)
- Backend: `piper`
- Local neural TTS via Piper binary
- Generates WAV audio locally — no network required
- Multiple voice models available

```json
{
  "audio": {
    "tts": {
      "backend": "piper",
      "enabled": true,
      "modelPath": "~/.local/share/piper-voices/en-us-lessac-medium.onnx"
    }
  }
}
```

### Kokoro (recommended for quality)
- Backend: `kokoro`
- **82M params, Apache 2.0** — higher naturalness than Piper
- Better prosody and intonation for conversational speech
- MOS ~4.2 vs Piper's ~3.8
- Supports ONNX runtime (in-process) or binary mode

```json
{
  "audio": {
    "tts": {
      "backend": "kokoro",
      "enabled": true,
      "modelPath": "~/.cache/kokoro/kokoro-v0.5-en.onnx",
      "bin": "onnx",
      "voice": "default",
      "speed": 1.0
    }
  }
}
```

Environment variables:
- `KOKORO_BIN` — path to binary or "onnx"
- `KOKORO_MODEL` — path to .onnx model
- `KOKORO_CONFIG` — path to model config JSON
- `KOKORO_VOICE` — voice pack name

## Recommended Voice Stack

For the best real-time voice experience:
1. **STT**: Moonshine (5x faster than Whisper)
2. **TTS**: Kokoro (higher quality, Apache 2.0)
3. **Transport**: WebSocket via HudServer (piper_audio channel for neural TTS)

### Free Alternative: LiveKit
- LiveKit Agents: free 1000 min/month
- Provides real-time audio transport with low latency
- Works with any STT/TTS backend

```json
{
  "audio": {
    "mode": "builtIn",
    "stt": {
      "backend": "moonshine",
      "enabled": true,
      "language": "en"
    },
    "tts": {
      "backend": "kokoro",
      "enabled": true,
      "voice": "default"
    }
  }
}
```

## Voice Pipeline Behavior

### Client-Side (Chat PWA)
- **Voice buffering**: When Mai is speaking or executing actions, voice input is buffered (not discarded)
- **Auto-restart**: Recognition auto-restarts when browser kills it during TTS playback
- **Continuous mode**: `recognition.continuous = true` keeps mic open across results
- **Buffer flush**: Buffered voice messages are automatically sent after Mai finishes

### Server-Side (AgentLoop)
- **Queue acknowledgment**: Queued messages get `silent_text` feedback
- **Action status**: `bg_activity` channel broadcasts started/completed/failed states
- **Intermediate TTS**: "Working on..." messages sent before action execution

## Switching
- Use `jarvis audio mode` to view current mode
- Edit `harness.config.json` audio section to change
- TTS engine can be switched at runtime via WebSocket `tts_switch` message
