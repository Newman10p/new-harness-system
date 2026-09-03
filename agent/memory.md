# Memory System

## Obsidian Vault Integration
- Vault Path: Configured in `harness.config.json` as `vaultPath`
- Memory Folder: `AgentMemory/` inside vault
- All agent memory notes are stored here

## User Profile (Learned & Stored)
- **Name**: Bulega Farid
- **Public Name**: The Deadman
- **Preferred Address**: "sir"
- **Date of Birth**: November 25, 2007
- **Learning Enabled**: Yes - M.A.I. should learn patterns over time

## Memory Types
- **Session Summaries** - Daily summaries of agent activity
- **Decisions** - Important decisions made during operation
- **Plans** - Active and completed plans
- **Skill Evaluations** - Skill adaptation notes and evaluations
- **User Patterns** - Learned preferences and recurring behaviors
- **Preferences** - UI themes, color choices, workflow preferences
- **Context** - Short-term conversation and task context

## Memory Architecture
- **Short-term Memory**: Current session context, recent interactions
- **Long-term Memory**: Persisted user profile, learned patterns, historical data
- **Semantic Search**: Query-based retrieval of relevant memories
- **Pattern Learning**: Automatic detection of recurring behaviors

## Agent Usage
- Search vault before answering questions (`vault.search`)
- Read notes for context (`vault.read`)
- Write memories for persistence (`vault.write`)
- Use `writeMemory()` for automatic dated entries with tags
- Store user preferences in long-term memory
- Learn from interaction patterns over time
- Address user as "sir" unless otherwise specified
- Reference public name "The Deadman" in casual contexts