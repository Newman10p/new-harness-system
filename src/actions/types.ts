/**
 * Core Action interface for the harness tool plugin system.
 */
export interface HarnessAction {
  name: string;
  description: string;
  run(input: unknown): Promise<unknown>;
}

export interface ActionContext {
  allowlist: string[];
  safetyLevel: "conservative" | "balanced" | "experimental";
  requireConfirmation: boolean;
}

export interface ActionMeta {
  name: string;
  description: string;
  requiresConfirmation?: boolean;
  requiresAllowlist?: boolean;
  category: "code" | "fs" | "terminal" | "sim3d" | "pc" | "device" | "network" | "security";
}

// ===== Unified Action Execution Envelope (Phase 2) =====

export interface ActionRequest {
  actionId: string;
  actionName: string;
  source: string; // user, agent, mcp-server:id, scheduler, etc.
  agent?: string; // which agent is executing
  sessionId?: string;
  taskId?: string;
  parameters: Record<string, any>;
  parameterHash: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
  trustContext: {
    provenance: 'trusted' | 'semi_trusted' | 'untrusted';
    sourceTrustLevel: number; // 0-1
  };
}

export interface ActionAuthorization {
  policyDecision: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  approvalId?: string;
  reason?: string;
  matchedRules?: string[];
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ActionExecution {
  startedAt: string;
  endedAt?: string;
  duration?: number; // ms
  status: 'starting' | 'running' | 'completing' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
  artifacts?: Array<{ type: string; name: string; path?: string; url?: string }>;
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  execution?: ActionExecution;
  audit?: ActionAudit;
}

export interface ActionAudit {
  actionId: string;
  actionName: string;
  requestedBy: string;
  requestedAt: string;
  authorizedAt?: string;
  executedAt?: string;
  completedAt?: string;
  authorization: ActionAuthorization;
  execution: ActionExecution;
  securityChecks: Array<{ check: string; passed: boolean; detail?: string }>;
}