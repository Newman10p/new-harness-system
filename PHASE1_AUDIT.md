# M.A.I. ENGINEERING — PHASE 1: AUDIT REPORT

**Date:** 2025-09-08  
**Repository:** newman10p/new-harness-system  
**Phase:** 1 of 3 (Audit, Foundations, Security)

---

## EXECUTIVE SUMMARY

The codebase is a **Markdown-First / Model-as-an-Engine** agentic AI harness with 49 action primitives across 6 groups. The system has substantial existing infrastructure but lacks unified configuration management, proper secret handling, first-class policy/approval services, and consistent event/audit patterns.

**Key Findings:**
- ✅ Strong foundation: PolicyEngine, EventMesh, SecurityMonitor, SandboxExecutor exist
- ⚠️ Configuration: Fragmented between `src/config.ts` (types+defaults) and `src/config/loader.ts` (read/write), no central ConfigManager
- ❌ Secrets: No SecretBroker — credentials stored in `.env` and referenced via `__ENV:VAR__` placeholders in config JSON
- ⚠️ Policy: PolicyEngine exists but lacks ApprovalService as a separate durable service
- ⚠️ Events: EventMesh exists but doesn't use canonical envelope with trust/provenance metadata
- ❌ Trust/Provenance: Mentioned in policy.md (`untrusted_content_sources`) but not implemented as runtime metadata
- ⚠️ Security: SecurityMonitor, SandboxExecutor provide basic hardening but lack systematic tests

---

## 1. ARCHITECTURE INVENTORY

### 1.1 Core Agent Loop (`src/core/`)

| File | Status | Notes |
|------|--------|-------|
| `AgentLoop.ts` (69KB) | ✅ Functional | 7-phase loop: Assemble → Infer → Parse → Enforce → Execute → Stream → Loop. Handles approval gates, sandbox promotion, tool execution |
| `ContextAssembler.ts` (20KB) | ✅ Functional | Builds conversation context from identity.md, instructions.md, memory.md, policy.md, tools catalog |
| `ResponseParser.ts` (6KB) | ✅ Functional | Parses ```action fenced JSON blocks from LLM responses |
| `PolicyEngine.ts` (in `src/security/`) | ⚠️ Partial | Validates actions against deny_commands, allow_network, require_approval, auto_approve. Missing: ApprovalService for durable approvals |
| `ToolExecutionPlanner.ts` (5KB) | ✅ Functional | Groups tools for parallel execution |
| `ToolResultTruncator.ts` (4KB) | ✅ Functional | Truncates large tool results |
| `ToolSchema.ts` (46KB) | ✅ Functional | Zod schemas for all 49 action primitives |
| `WorkflowEngine.ts` (41KB) | ✅ Functional | Orchestrates predefined workflow templates |
| `IntentClassifier.ts` (15KB) | ✅ Functional | Classifies user intent |
| `ModelRouter.ts` (38KB) | ✅ Functional | Routes requests to appropriate model provider |
| `MultiProvider.ts` (25KB) | ✅ Functional | Multi-provider fallback for LLM calls |
| `MicroCompactor.ts` (10KB) | ✅ Functional | Hermes-style micro-compaction for context management |
| `SelfImprovementEngine.ts` (19KB) | ✅ Functional | Self-evaluate, self-diagnose, self-repair |
| `UserModel.ts` (20KB) | ✅ Functional | Learns user preferences |
| `ProactiveEngine.ts` (20KB) | ✅ Functional | Triggers actions based on conditions |
| `CircuitBreaker.ts` (10KB) | ✅ Functional | Circuit breaker pattern for failing subsystems |
| `MaiLogger.ts` (8KB) | ✅ Functional | Structured logging |
| `VisionAnalyzer.ts` (4KB) | ✅ Functional | VLM-powered image analysis |
| `LlmBudget.ts` (10KB) | ✅ Functional | Token budget tracking per provider |
| `ToneAdapter.ts` (12KB) | ✅ Functional | Adapts response tone |
| `FileMutationQueue.ts` (2KB) | ✅ Functional | Serializes concurrent file writes |
| `EventBus.ts` (7KB) | ⚠️ Legacy | Older event system, superseded by EventMesh |
| `eventBus.ts`, `interaction.ts`, `orchestrator.ts` | ❌ Legacy | Small legacy files, likely unused |
| `agentLoop.legacy.ts`, `agentState.ts`, `workflowEngine.ts`, `autonomous.ts` | ❌ Legacy | Duplicate/legacy implementations |
| `constants.ts` (4KB) | ✅ Functional | Path constants, POLICY_PATH, etc. |

**UI Exposure Needed:**
- WorkflowEngine status (HUD: workflows panel)
- UserModel insights (HUD: user profile panel)
- ProactiveEngine rules (HUD: proactive automation settings)
- CircuitBreaker state (HUD: health monitoring)

---

### 1.2 Configuration System (`src/config/`, `src/config.ts`)

| File | Status | Notes |
|------|--------|-------|
| `src/config.ts` | ⚠️ Partial | Defines `HarnessConfig` interface (comprehensive) + defaults + `loadConfig()` function. Mixes types, defaults, and loading logic |
| `src/config/loader.ts` | ⚠️ Partial | `readConfig()`, `writeConfig()`, `updateConfig()` with secret stripping. No validation, no transactions, no history |
| `harness.config.json` | ✅ Exists | Runtime config file with `__ENV:VAR__` placeholders |

**Gaps:**
- ❌ No central `ConfigManager` singleton used everywhere
- ❌ No validation schema (types exist but not enforced at runtime)
- ❌ No change history, rollback, preview functionality
- ❌ No watch/subscription mechanism
- ❌ Config sources not layered (env → .env → yaml/json → runtime)
- ❌ UI mutations don't go through transactional flow

**Decision:** Build new `ConfigManager` class in `src/config/ConfigManager.ts` that implements the required interface. Keep existing types in `src/config.ts`.

---

### 1.3 Secret Management

| File | Status | Notes |
|------|--------|-------|
| `.env` (not visible) | ✅ Assumed | Standard dotenv file |
| `src/config/loader.ts` | ⚠️ Partial | Strips secrets before writing config, but no SecretBroker |
| `harness.config.json` | ❌ Risky | Contains `__ENV:GMAIL_USERNAME__` placeholders — encourages manual editing |

**Gaps:**
- ❌ No `SecretBroker` service
- ❌ No encrypted persistence
- ❌ No OS-backed secret store integration (keychain, libsecret, Windows Credential Manager)
- ❌ No redaction in logs
- ❌ No secret rotation, revocation, testing
- ❌ No access auditing

**Decision:** Implement `SecretBroker` in `src/security/SecretBroker.ts` with encrypted file backend (initially), designed for future OS store integration.

---

### 1.4 Policy & Approvals (`src/security/`)

| File | Status | Notes |
|------|--------|-------|
| `PolicyEngine.ts` (9KB) | ⚠️ Partial | Loads policy.md, validates actions, checks requiresApproval(). Returns `{allowed, reason}` or `{allowed: true}` |
| `SandboxExecutor.ts` (9KB) | ✅ Functional | Obfuscation-aware command validation, restricted env, shell=false for simple commands |
| `SecurityMonitor.ts` (4KB) | ⚠️ Partial | Resource monitoring, frequent terminal alerts, action logging |

**Gaps:**
- ❌ No `ApprovalService` for durable approvals
- ❌ No approvalId, taskId, expiresAt, decidedBy tracking
- ❌ No approve/deny/expire/revoke methods
- ❌ No approval history
- ❌ No policy simulator (CLI/HUD/API)
- ❌ PolicyEngine returns simple `{allowed, reason}` — not full `PolicyDecision` with risk level, matched rules

**Decision:** 
1. Extend `PolicyEngine` to return full `PolicyDecision` type
2. Create `ApprovalService` in `src/security/ApprovalService.ts`
3. Build CLI command: `mai policy check <action.json>`
4. Add HUD panel for policy simulation

---

### 1.5 Event System (`src/events/`)

| File | Status | Notes |
|------|--------|-------|
| `EventMesh.ts` (24KB) | ✅ Functional | Pub/sub with glob patterns, TTL, dead letter queue, persistence, rate limiting |
| `DeviceEventSource.ts` (19KB) | ✅ Functional | Device event source implementation |
| `types.ts` (6KB) | ⚠️ Partial | `MeshEvent` interface missing `trust`, `actor`, `sessionId`, `taskId` fields |

**Gaps:**
- ❌ Event envelope doesn't match canonical spec (missing `trust`, `actor`, `sessionId`, `taskId`, `severity`)
- ❌ No provenance/trust propagation
- ❌ Not all subsystems use EventMesh (some use legacy EventBus)

**Decision:** Update `MeshEvent` type to include canonical fields. Add provenance tracking.

---

### 1.6 Auth & Access Control (`src/auth/`)

| File | Status | Notes |
|------|--------|-------|
| `AuthManager.ts` (23KB) | ✅ Functional | JWT-based auth, session management |
| `DevicePairing.ts` (10KB) | ✅ Functional | QR-based device pairing |
| `SessionManager.ts` (11KB) | ✅ Functional | Session lifecycle management |
| `middleware.ts` (10KB) | ✅ Functional | Express middleware for route protection |
| `permissions.ts` (6KB) | ✅ Functional | Role-based permissions |
| `types.ts` (8KB) | ✅ Functional | Auth type definitions |
| `index.ts` (728B) | ✅ Functional | Exports |

**Status:** Auth subsystem is well-developed. Needs integration with ConfigManager for gateway config, and with SecretBroker for tokens.

---

### 1.7 Gateway (`src/gateway/`)

| File | Status | Notes |
|------|--------|-------|
| `GatewayManager.ts` (23KB) | ✅ Functional | Multi-channel gateway (SMS, Telegram, WhatsApp, SIP, Webhook) |
| `channels/` | ✅ Functional | Individual channel implementations |
| `types.ts` (9KB) | ✅ Functional | Gateway types |
| `index.ts` (1KB) | ✅ Functional | Exports |

**Status:** Functional. Needs integration with ConfigManager (single config source) and SecretBroker (channel credentials).

---

### 1.8 Memory (`src/memory/`)

| File | Status | Notes |
|------|--------|-------|
| `ConversationIndex.ts` (14KB) | ✅ Functional | Full-text search across conversations |
| `EmbeddingStore.ts` (10KB) | ✅ Functional | Vector embedding storage |
| `MiniObsidianMemory.ts` (3KB) | ✅ Functional | Obsidian-style memory management |

**Status:** Functional. Needs integration with trust/provenance model for ingested content.

---

### 1.9 Sandbox (`src/sandbox/`, `src/sandbox2/`)

| Directory | Status | Notes |
|-----------|--------|-------|
| `src/sandbox/` | ✅ Functional | `SandboxRunner.ts`, `SideEffectAnalyzer.ts` — original sandbox |
| `src/sandbox2/` | ✅ Functional | `BrowserControlManager.ts`, `DeviceControlManager.ts`, `EmailManager.ts`, `SandboxManager.ts` — extended control modules |

**Status:** Both sandboxes functional. Need security hardening review and systematic tests.

---

### 1.10 Skills & Macros (`src/skills/`, `src/macros/`)

| Directory | Status | Notes |
|-----------|--------|-------|
| `src/skills/` | ✅ Functional | Skill definitions and runner |
| `src/macros/` | ✅ Functional | Macro engine |

**Status:** Functional. Need UI exposure in HUD.

---

### 1.11 Notifications (`src/notifications/`)

| Directory | Status | Notes |
|-----------|--------|-------|
| `src/notifications/` | ✅ Functional | Notification aggregator |

**Status:** Functional. Needs trust/provenance metadata for incoming notifications.

---

### 1.12 Network (`src/network/`)

| Directory | Status | Notes |
|-----------|--------|-------|
| `src/network/` | ✅ Functional | Network utilities |

**Status:** Functional.

---

### 1.13 Workspace (`src/workspace/`)

| Directory | Status | Notes |
|-----------|--------|-------|
| `src/workspace/` | ✅ Functional | Workspace management |

**Status:** Functional.

---

### 1.14 UI (`src/ui/`)

| Directory | Status | Notes |
|-----------|--------|-------|
| `src/ui/` | ✅ Functional | UI adapters |

**Status:** Functional. Needs exposure for ConfigManager, PolicyService, ApprovalService.

---

### 1.15 Watchers (`src/watchers/`)

| Directory | Status | Notes |
|-----------|--------|-------|
| `src/watchers/` | ✅ Functional | File watchers |

**Status:** Functional.

---

### 1.16 Types (`src/types/`)

| File | Status | Notes |
|------|--------|-------|
| `index.ts` (46KB) | ✅ Comprehensive | All type definitions including ActionName, PolicyConfig, MeshEvent, HudChannel, Workflow types |

**Updates Needed:**
- Add `TrustLevel` type
- Add canonical `EventEnvelope` type
- Add `PolicyDecision` with risk level, matched rules
- Add `ApprovalRequest`, `ApprovalResult` types

---

### 1.17 Public Frontend (`public/`)

| File | Status | Notes |
|------|--------|-------|
| `index.html`, `styles.css`, `app.js` | ✅ Functional | Iron Man-style HUD |
| `chat/` | ✅ Functional | Chat PWA |
| `manifest.json`, `sw.js` | ✅ Functional | PWA support |

**Status:** Functional. Needs new panels for:
- Settings (ConfigManager UI)
- Provider Credentials (SecretBroker UI)
- Policy Simulator
- Approval Queue

---

### 1.18 Tests (`tests/`)

| File | Status | Notes |
|------|--------|-------|
| `policy-engine.test.ts` | ✅ Functional | Tests for PolicyEngine |
| `sandbox-executor.test.ts` | ✅ Functional | Tests for SandboxExecutor |
| `action-registry.test.ts` | ✅ Functional | Tests for ActionRegistry |
| `response-parser.test.ts` | ✅ Functional | Tests for ResponseParser |
| `run-all.ts` | ✅ Functional | Test runner |
| `web-search-smoke.test.ts` | ✅ Functional | Smoke test for web search |

**Gaps:**
- ❌ No tests for ConfigManager (doesn't exist yet)
- ❌ No tests for SecretBroker (doesn't exist yet)
- ❌ No tests for ApprovalService (doesn't exist yet)
- ❌ No security tests (prompt injection, path traversal, secret exfiltration, approval bypass, replay attacks)

---

### 1.19 Brain Files (`agent/`)

| File | Status | Notes |
|------|--------|-------|
| `identity.md` | ✅ Functional | Agent identity |
| `instructions.md` | ✅ Functional | Behavioral instructions |
| `memory.md` | ✅ Functional | Memory directives |
| `policy.md` | ✅ Functional | YAML frontmatter + policy rules |
| `models.md` | ✅ Functional | Model configuration |
| `voice.md` | ✅ Functional | Voice/TTS settings |
| `tools/catalog.md`, `tools/list.md` | ✅ Functional | Tool documentation |
| `workflows/background.md` | ✅ Functional | Background task definitions |

**Updates Needed:**
- Add trust/provenance section to policy.md
- Document approval workflow

---

### 1.20 State Files (`state/`)

| File | Status | Notes |
|------|--------|-------|
| `audit.log.md` | ✅ Functional | Audit trail |
| `inbox.md` | ✅ Functional | Event log |
| `auth.json` | ✅ Functional | Auth state |
| `gateway-config.json` | ✅ Functional | Gateway config |

**Gaps:**
- ❌ No centralized config versioning
- ❌ No approval state persistence

---

## 2. DUPLICATION & LEGACY ANALYSIS

### Duplicated Functionality

| Component | Locations | Recommendation |
|-----------|-----------|----------------|
| Event System | `EventMesh.ts`, `EventBus.ts`, `eventBus.ts` | Deprecate `EventBus.ts`, `eventBus.ts`; migrate to EventMesh |
| Agent Loop | `AgentLoop.ts`, `agentLoop.legacy.ts` | Remove `agentLoop.legacy.ts` after verification |
| Workflow Engine | `WorkflowEngine.ts`, `workflowEngine.ts` | Remove `workflowEngine.ts` after verification |
| Config Loading | `config.ts` loadConfig(), `config/loader.ts` readConfig() | Consolidate into ConfigManager |

### Legacy/Dead Code

| File | Size | Recommendation |
|------|------|----------------|
| `src/core/agentLoop.legacy.ts` | 3.6KB | Verify unused, then remove |
| `src/core/agentState.ts` | 4KB | Verify unused, then remove |
| `src/core/orchestrator.ts` | 4KB | Verify unused, then remove |
| `src/core/workflowEngine.ts` | 4KB | Verify unused, then remove |
| `src/core/autonomous.ts` | 6KB | Verify unused, then remove |
| `src/core/eventBus.ts` | 1.5KB | Migrate to EventMesh, then remove |
| `src/core/interaction.ts` | 2KB | Verify unused, then remove |

**Action:** After Phase 1 foundations are complete, audit and remove confirmed-dead files.

---

## 3. COUPLING ANALYSIS

### Tight Coupling Issues

1. **Config Scattering:** Multiple modules load config independently via `loadConfig()` or `readConfig()`. This violates the "ONE ConfigManager" principle.

2. **Secret References:** Config JSON contains `__ENV:VAR__` placeholders, encouraging manual editing. Should reference SecretBroker keys instead.

3. **Policy Enforcement:** PolicyEngine is called directly by AgentLoop, but approval logic is embedded in AgentLoop rather than delegated to ApprovalService.

4. **Event Inconsistency:** Some modules use EventMesh, others use legacy EventBus, others emit direct HUD updates.

### Decoupling Strategy

1. Introduce `ConfigManager` singleton, inject into all consumers
2. Introduce `SecretBroker` singleton, all secrets resolved at runtime
3. Extract approval logic from AgentLoop into `ApprovalService`
4. Standardize on EventMesh with canonical envelope

---

## 4. IMPLEMENTATION PLAN

### Phase 1A: Audit Complete ✅
- [x] Repository inspection
- [x] Architecture inventory
- [x] Duplication/legacy identification
- [x] Coupling analysis

### Phase 1B: Foundational Systems
1. **ConfigManager** (`src/config/ConfigManager.ts`)
   - Implement interface: get, set, validate, validateAll, preview, apply, rollback, history, watch
   - Canonical schema (extend existing `HarnessConfig`)
   - Transaction support with draft → validate → preview → approve → apply → persist → emit
   - Change history with who/what/when/why

2. **SecretBroker** (`src/security/SecretBroker.ts`)
   - Implement interface: storeSecret, resolveSecret, rotateSecret, revokeSecret, testSecret, redactSecret, auditSecretAccess, listSecrets, isConfigured, getStatus
   - Encrypted file backend (initially)
   - Redaction middleware for logs
   - Access auditing

3. **PolicyService Extension** (`src/security/PolicyEngine.ts` → `PolicyService.ts`)
   - Extend PolicyDecision with risk level, matched rules
   - Add evaluate, explain, simulate methods
   - Integrate with ApprovalService

4. **ApprovalService** (`src/security/ApprovalService.ts`)
   - Durable approval objects with approvalId, taskId, actionId, requestedBy, parametersHash, riskLevel, reason, createdAt, expiresAt, decision, decidedBy, decidedAt
   - Methods: requestApproval, approve, deny, expire, revoke, getHistory, listPending
   - Persistence layer

5. **Event Envelope Standardization** (`src/events/types.ts`)
   - Add trust, actor, sessionId, taskId, severity fields to MeshEvent
   - Provenance tracking for inbound content

6. **Trust/Provenance Model** (`src/security/TrustService.ts`)
   - TRUSTED, SEMI_TRUSTED, UNTRUSTED, MALICIOUS levels
   - Propagate through action requests
   - Tag external content sources

### Phase 1C: Security Hardening
1. Review command execution validation
2. Review path traversal prevention
3. Review environment scrubbing
4. Review file operation logging
5. Review browser JS sandboxing
6. Review email validation
7. Review MCP server authentication
8. Review webhook signature validation

### Phase 1D: Testing
1. Unit tests for ConfigManager
2. Unit tests for SecretBroker
3. Unit tests for ApprovalService
4. Security tests (prompt injection, path traversal, secret exfiltration, approval bypass, replay attacks)

### Phase 1E: Documentation
1. Update README.md with new services
2. Document ConfigManager usage
3. Document SecretBroker integration
4. Document PolicyService + ApprovalService
5. Document trust/provenance model

---

## 5. SUCCESS CRITERIA CHECKLIST

- [ ] One ConfigManager used everywhere
- [ ] Secrets never exposed to models, logs, or UI
- [ ] Policy and approvals are first-class, auditable, and durable
- [ ] Policy Simulator works in CLI and HUD
- [ ] Trust/provenance metadata is attached to all inbound content
- [ ] Security tests pass for foundational threats
- [ ] Documentation updated for new services

---

## 6. BACKWARD COMPATIBILITY NOTES

- Existing `harness.config.json` must continue to work during migration
- Existing `.env` files must remain functional
- Existing policy.md must remain parseable
- Existing tests must pass before changes
- Legacy EventBus must remain functional until all consumers migrated

---

**End of Audit Report**
