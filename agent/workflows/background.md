# Background Workflows

## Resource Monitoring
- Watches CPU/RAM every 30s
- Emits resource_state events
- Auto-throttles when resources > 80% CPU or 90% RAM

## File Watching
- Monitors vault and skills directories
- Emits file_changed events
- Triggers "summarize new notes" workflow when files change

## Device Monitoring
- Scans USB devices every 60s
- Emits device_event for new devices
- Logs device info to agent state

## Scheduled Tasks
- Daily summary generation
- Periodic skill adaptation analysis
- Resource health reports