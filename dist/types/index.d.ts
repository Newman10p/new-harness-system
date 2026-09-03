import type OpenAI from "openai";
export type ActionName = "execute-terminal" | "read-file" | "write-file" | "append-file" | "list-directory" | "watch-directory" | "get-system-info" | "get-process-list" | "open-url" | "http-request" | "emit-hud-update" | "compact-memory" | "run-skill" | "schedule-task" | "screenshot-capture" | "clipboard-read" | "clipboard-write" | "open-application" | "search-files" | "get-gpu-info" | "get-network-info" | "manage-processes" | "voice-call" | "list-files-detailed" | "semantic-recall" | "self-modify" | "self-evaluate" | "self-diagnose" | "self-repair" | "adaptive-config" | "remember" | "recall" | "forget" | "profile-update" | "learn-pattern" | "create-skill" | "optimize-skill" | "rollback" | "control-window" | "input-inject" | "system-setting" | "media-control" | "screen-arrange" | "notification-send" | "dry-run" | "run-macro" | "search-conversations";
export interface Action {
    action: ActionName;
    [key: string]: unknown;
}
export type ActionResult = {
    ok: boolean;
    data?: unknown;
    error?: string;
};
export type PrimitiveExecutor = (action: Action, ctx: ActionContext) => Promise<ActionResult>;
export interface PolicyConfig {
    deny_commands?: string[];
    allow_network?: string[];
    require_approval?: string[];
}
export type PolicyDecision = {
    allowed: true;
} | {
    allowed: false;
    reason: string;
};
export interface AgentState {
    messages: ChatMessage[];
    loopCount: number;
    isRunning: boolean;
    pendingApproval: PendingApproval | null;
}
export interface PendingApproval {
    action: Action;
    resolve: (approved: boolean) => void;
}
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface LLMConfig {
    baseURL: string;
    apiKey: string;
    model: string;
    provider: string;
}
export interface ProviderEntry {
    name: string;
    baseURL: string;
    apiKey: string;
    model: string;
    priority: number;
}
export interface ParsedResponse {
    text: string;
    actions: Action[];
    malformedCount?: number;
}
export type HudChannel = "jarvis_speech" | "activity_log" | "system_metrics" | "threat_level" | "reactor_pulse" | "file_list" | "voice_call_state" | "network_stats" | "gpu_stats" | "live_token" | "proactive_alert" | "user_profile_update" | "health_report" | "device_connected" | "device_disconnected" | "gateway_message" | "notification_incoming" | "ambient_listening" | "tunnel_status" | "analytics_snapshot";
export interface HudPayloads {
    jarvis_speech: {
        text: string;
    };
    activity_log: {
        message: string;
        level: "info" | "warn" | "error";
    };
    system_metrics: {
        cpu: number;
        memory: number;
        disk: number;
    };
    threat_level: {
        level: "green" | "yellow" | "orange" | "red";
        detail?: string;
    };
    reactor_pulse: {
        power: number;
        status: string;
    };
    file_list: {
        files: Array<{
            name: string;
            path: string;
            size: number;
            modified: string;
            type: "file" | "dir";
            extension: string;
        }>;
    };
    voice_call_state: {
        active: boolean;
        transcript: string;
    };
    network_stats: {
        upload_bps: number;
        download_bps: number;
    };
    gpu_stats: {
        temperature: number;
        utilization: number;
        memory_used: number;
        memory_total: number;
    };
    live_token: {
        token: string;
    };
    proactive_alert: {
        rule: string;
        action: string;
        detail: string;
    };
    user_profile_update: {
        field: string;
        value: string;
    };
    health_report: {
        subsystems: Array<{
            name: string;
            status: "ok" | "degraded" | "failed";
            detail: string;
        }>;
        overall: "healthy" | "degraded" | "critical";
    };
    device_connected: {
        deviceId: string;
        channel: string;
        deviceName: string;
    };
    device_disconnected: {
        deviceId: string;
        channel: string;
    };
    gateway_message: {
        channel: string;
        source: string;
        text: string;
        timestamp: number;
    };
    notification_incoming: {
        id: string;
        source: string;
        title: string;
        body: string;
        priority: string;
    };
    ambient_listening: {
        active: boolean;
        wakeWord: string;
        audioLevel: number;
    };
    tunnel_status: {
        active: boolean;
        method: string;
        publicUrl: string | null;
    };
    analytics_snapshot: {
        totalInteractions: number;
        messagesSent: number;
        actionsExecuted: number;
        errorRate: number;
        uptimeSeconds: number;
    };
}
export type HudMessage<C extends HudChannel> = {
    channel: C;
    payload: HudPayloads[C];
    timestamp: number;
};
export interface HudEmitter {
    (channel: HudChannel, payload: HudPayloads[HudChannel]): void;
}
export interface InboxEvent {
    type: string;
    source: string;
    detail: string;
    timestamp: string;
}
export type AuditEventType = "action_executed" | "action_blocked" | "action_approved" | "action_denied" | "action_timeout" | "llm_call" | "llm_error" | "policy_loaded";
export interface AuditEntry {
    timestamp?: string;
    type: AuditEventType;
    action?: string;
    detail: string;
    durationMs?: number;
    ok?: boolean;
}
export interface AuditLogger {
    (entry: AuditEntry): Promise<void>;
}
export interface SkillDefinition {
    name: string;
    description?: string;
    model?: string;
    template: string;
    inputs: SkillInput[];
    actions?: Action[];
}
export interface SkillInput {
    name: string;
    prompt: string;
    default?: string;
}
export interface ScheduledTask {
    id: string;
    name: string;
    command: string;
    intervalMs: number;
    enabled: boolean;
    lastRun?: string;
    nextRun: string;
    runCount: number;
}
export interface ActionContext {
    emitHud: HudEmitter;
    appendInbox: (event: InboxEvent) => Promise<void>;
    audit: AuditLogger;
    llm?: unknown;
    model?: string;
    state?: AgentState;
}
export interface FileEntry {
    name: string;
    path: string;
    size: number;
    modified: string;
    type: "file" | "dir";
    extension: string;
}
export type { OpenAI };
//# sourceMappingURL=index.d.ts.map