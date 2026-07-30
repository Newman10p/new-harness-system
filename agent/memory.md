# Memory System

## Obsidian Vault Integration
- Vault Path: Configured in `harness.config.json` as `vaultPath`
- Memory Folder: `AgentMemory/` inside vault
- All agent memory notes are stored here

## Memory Types
- **Session Summaries** - Daily summaries of agent activity
- **Decisions** - Important decisions made during operation
- **Plans** - Active and completed plans
- **Skill Evaluations** - Skill adaptation notes and evaluations

## Agent Usage
- Search vault before answering questions (`vault.search`)
- Read notes for context (`vault.read`)
- Write memories for persistence (`vault.write`)
- Use `writeMemory()` for automatic dated entries with tags