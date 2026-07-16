# Voice Configuration

## Modes
- **builtIn** - Whisper STT + HTTP TTS
- **custom** - Configurable STT/TTS HTTP endpoints
- **disabled** - No voice support

## STT (Speech-to-Text)
- Backend: Whisper (via @pr0gramm/fluester or CLI)
- Processes audio files for transcription

## TTS (Text-to-Speech)
- Backend: HTTP endpoint
- Sends text, receives audio buffer
- Configurable voice and rate

## Switching
- Use `jarvis audio mode` to view current mode
- Edit `harness.config.json` audio section to change