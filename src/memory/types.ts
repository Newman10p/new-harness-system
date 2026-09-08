/**
 * M.A.I. ENGINEERING - Memory System Types
 * Type definitions for the first-class memory system
 */

export type MemoryType = 
  | 'conversation'
  | 'fact'
  | 'skill'
  | 'pattern'
  | 'preference'
  | 'context'
  | 'profile'
  | 'task'
  | 'artifact';

export type MemorySource =
  | 'user_input'
  | 'agent_output'
  | 'action_result'
  | 'web_content'
  | 'file_content'
  | 'mcp_tool'
  | 'system_event'
  | 'proactive_discovery';

export type TrustLevel = 'trusted' | 'semi_trusted' | 'untrusted' | 'malicious';

export interface MemoryEntry {
  memoryId: string;
  type: MemoryType;
  source: MemorySource;
  content: string;
  metadata: {
    title?: string;
    summary?: string;
    keywords?: string[];
    tags?: string[];
    confidence: number; // 0-1 score
    importance: number; // 0-1 score
    trust: TrustLevel;
    embedding?: number[];
    vectorId?: string;
  };
  context: {
    sessionId?: string;
    taskId?: string;
    actionId?: string;
    channelId?: string;
  };
  timestamps: {
    createdAt: string;
    updatedAt: string;
    lastAccessedAt: string;
    expiresAt?: string;
  };
  accessCount: number;
  relatedMemoryIds?: string[];
}

export interface MemoryQuery {
  query?: string;
  embedding?: number[];
  types?: MemoryType[];
  sources?: MemorySource[];
  tags?: string[];
  timeRange?: {
    from: string;
    to: string;
  };
  minConfidence?: number;
  minImportance?: number;
  limit?: number;
  includeExplanation?: boolean;
}

export interface MemoryResult {
  entries: MemoryEntry[];
  scores?: number[];
  explanation?: {
    whyRecalled: string;
    matchedCriteria: string[];
    rankingFactors: Array<{ factor: string; weight: number }>;
  };
}

export interface MemoryCapture {
  content: string;
  type?: MemoryType;
  source: MemorySource;
  metadata?: Partial<MemoryEntry['metadata']>;
  context?: Partial<MemoryEntry['context']>;
  autoClassify?: boolean;
}

export interface MemoryCompaction {
  originalCount: number;
  compactedCount: number;
  tokensSaved: number;
  summary: string;
  preservedEntries: string[];
  mergedGroups: Array<{
    entryIds: string[];
    summary: string;
    rationale: string;
  }>;
}

export interface MemoryExpiration {
  expiredCount: number;
  expiredIds: string[];
  reason: 'expired' | 'low_importance' | 'low_confidence' | 'manual';
}

export interface MemoryAudit {
  totalEntries: number;
  byType: Record<MemoryType, number>;
  bySource: Record<MemorySource, number>;
  byTrust: Record<TrustLevel, number>;
  oldestEntry: string;
  newestEntry: string;
  averageConfidence: number;
  averageImportance: number;
  lastCompaction?: string;
  storageSizeBytes: number;
}

export interface MemoryService {
  capture(capture: MemoryCapture): Promise<MemoryEntry>;
  retrieve(query: MemoryQuery): Promise<MemoryResult>;
  update(memoryId: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry>;
  delete(memoryId: string): Promise<void>;
  compact(options?: { maxEntries?: number; targetTokens?: number }): Promise<MemoryCompaction>;
  expire(options?: { olderThan?: string; minImportance?: number }): Promise<MemoryExpiration>;
  audit(): Promise<MemoryAudit>;
  explain(memoryId: string): Promise<{ whyRemembered: string; source: string; reasoning: string }>;
  get(memoryId: string): Promise<MemoryEntry | undefined>;
  list(options?: { type?: MemoryType; limit?: number; offset?: number }): Promise<MemoryEntry[]>;
}
