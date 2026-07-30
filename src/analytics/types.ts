// ─── M.A.I. Analytics Types ─────────────────────────────────────────────
// Type definitions for the interaction analytics system.
// Tracks user interactions, generates reports, and feeds insights
// back into the self-improvement loop.

// ─── Event Types ────────────────────────────────────────────────────────────

export type InteractionEventType =
  | "message_sent"
  | "action_executed"
  | "action_blocked"
  | "session_start"
  | "session_end"
  | "macro_run"
  | "device_connected"
  | "device_disconnected";

/**
 * A single interaction event recorded by the analytics engine.
 */
export interface InteractionEvent {
  id: string;
  type: InteractionEventType;
  userId?: string;
  sessionId: string;
  deviceId?: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── Time Series ────────────────────────────────────────────────────────────

/**
 * A single data point in a time series.
 */
export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

// ─── Report ─────────────────────────────────────────────────────────────────

/**
 * A comprehensive analytics report for a time period.
 */
export interface AnalyticsReport {
  period: { from: number; to: number };
  totalInteractions: number;
  messagesSent: number;
  actionsExecuted: number;
  actionsBlocked: number;
  macrosRun: number;
  topCommands: Array<{ command: string; count: number }>;
  topActions: Array<{ action: string; count: number; successRate: number }>;
  usageByHour: TimeSeriesPoint[];
  usageByDay: TimeSeriesPoint[];
  deviceUsage: Array<{ device: string; messageCount: number }>;
  averageResponseTime: number;
  errorRate: number;
  sessionDuration: { min: number; max: number; average: number };
}

// ─── Real-Time Stats ────────────────────────────────────────────────────────

/**
 * Real-time statistics for the current session.
 */
export interface RealtimeStats {
  currentSessionId: string;
  sessionStartTime: number;
  sessionDurationMs: number;
  messagesThisSession: number;
  actionsThisSession: number;
  blockedThisSession: number;
  activeDevices: number;
  messagesPerMinute: number;
}

// ─── Export Formats ─────────────────────────────────────────────────────────

export type ExportFormat = "json" | "csv";

// ─── Internal State ────────────────────────────────────────────────────────

/**
 * Session tracking data (internal use).
 */
export interface SessionRecord {
  sessionId: string;
  startTime: number;
  endTime?: number;
  userId?: string;
  deviceId?: string;
  messageCount: number;
  actionCount: number;
  blockedCount: number;
}

/**
 * Action execution record for success rate calculation.
 */
export interface ActionRecord {
  action: string;
  timestamp: number;
  success: boolean;
  durationMs?: number;
}
