---
deny_commands:
  - "rm -rf"
  - "rm -r /"
  - "mkfs"
  - "dd if="
  - "shutdown"
  - "reboot"
  - "format"
  - ":(){ :|:& };:"
  - "chmod -R 777 /"
  - "> /dev/sda"
  - "mv / /dev/null"
allow_network:
  - "github.com"
  - "api.github.com"
  - "ollama.ai"
  - "api.openai.com"
  - "localhost"
  - "127.0.0.1"
  - "integrate.api.nvidia.com"
require_approval:
  - "execute-terminal"
  - "write-file"
  - "http-request"
  - "manage-processes"
  - "screenshot-capture"
  - "clipboard-write"
  - "self-modify"
  - "self-repair"
  - "rollback"
  - "adaptive-config"
---

# M.A.I. Security Policy

## Objectives

1. Protect system integrity — prevent destructive operations
2. Control network access — only allow approved hosts
3. Require human confirmation for risky actions
4. Maintain audit trail via inbox and logs

## Rules

- **NEVER** execute commands matching deny_commands patterns
- **NEVER** access network hosts outside the allow_network list
- **ALWAYS** ask for approval before executing terminal commands
- **ALWAYS** ask for approval before writing files
- **ALWAYS** ask for approval before making HTTP requests

## Safety Levels

| Action | Safety | Notes |
|--------|--------|-------|
| read-file | Auto | Read-only |
| list-directory | Auto | Read-only |
| get-system-info | Auto | Read-only |
| get-process-list | Auto | Read-only |
| execute-terminal | Approval | Can run any command |
| write-file | Approval | Can modify filesystem |
| append-file | Auto | Generally safe |
| watch-directory | Auto | Read-only monitoring |
| open-url | Auto | User-facing |
| http-request | Approval | Network access |
| emit-hud-update | Auto | Display only |
| compact-memory | Auto | LLM-assisted |
| screenshot-capture | Approval | Can capture screen content |
| clipboard-read | Auto | Read-only |
| clipboard-write | Approval | Can modify clipboard |
| open-application | Auto | User-facing |
| search-files | Auto | Read-only |
| get-gpu-info | Auto | Read-only |
| get-network-info | Auto | Read-only |
| manage-processes | Approval | Can kill/restart processes |
| voice-call | Auto | HUD interaction only |
| list-files-detailed | Auto | Read-only |
| semantic-recall | Auto | Read-only memory search |
| self-modify | Approval | Can modify system files |
| self-evaluate | Auto | Read-only analysis |
| self-diagnose | Auto | Read-only diagnostics |
| self-repair | Approval | Can modify system state |
| adaptive-config | Approval | Can change runtime config |
| remember | Auto | Writes to memory only |
| recall | Auto | Read-only memory search |
| forget | Auto | Modifies memory only |
| profile-update | Auto | Updates learned profile |
| learn-pattern | Auto | Writes to patterns file |
| create-skill | Auto | Creates new skill file |
| optimize-skill | Auto | Modifies existing skill |
| rollback | Approval | Can revert system state |

## Self-Modification Safety

- **NEVER** modify deny_commands or security-critical policy rules
- **ALWAYS** create backups before self-modification
- **ALWAYS** require approval for rollback operations
- **ALWAYS** log every self-modification to the audit trail
