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
