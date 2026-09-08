/**
 * M.A.I. ENGINEERING - MAIRuntime
 * Central Runtime Coordinator for Phase 2
 * 
 * Single source of truth for all runtime state.
 * All subsystems reference this runtime instead of maintaining disconnected copies.
 */

import { EventEmitter } from "node:events";
import { HarnessConfig } from "../config";
import { Task, TaskStatus, TaskType } from "./types";
import { ActionRequest, ActionAuthorization, ActionExecution } from "../actions/types";
import { MemoryEntry } from "../memory/types";
import { MCPServerState } from "./MCP.types";
import type { ProviderEntry } from "../types/index.js";
import { ChannelStatus } from "../gateway/types";

// ===== Runtime State Interfaces =====

export interface SessionState {
  sessionId: string;
  userId?: string;
  channelId: string;
  startedAt: string;
  lastActivityAt: string;
  context: Record<string, any>;
}

export interface TaskQueueState {
  queued: Task[];
  running: Task[];
  waitingApproval: Task[];
  paused: Task[];
}

export interface RunningAction {
  actionId: string;
  taskId: string;
  actionName: string;
  startedAt: string;
  status: 'starting' | 'running' | 'completing';
}

export interface PendingApproval {
  approvalId: string;
  taskId: string;
  actionId: string;
  requestedBy: string;
  action: string;
  parametersHash: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'revoked';
  decidedBy?: string;
  decidedAt?: string;
}

export interface ActiveModelState {
  providerId: string;
  modelId: string;
  contextLimit: number;
  tokensUsed: number;
  cost: number;
}

export interface RuntimeContext {
  session?: SessionState;
  currentTask?: Task;
  activeModel?: ActiveModelState;
  memoryState: {
    loaded: boolean;
    entryCount: number;
    lastCompaction?: string;
  };
  activeChannels: string[];
  deviceState: {
    online: boolean;
    platform: string;
    arch: string;
  };
  sandboxSessions: Map<string, any>;
  gatewayHealth: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    channels: Record<string, boolean>;
    lastCheck: string;
  };
  securityState: {
    policyLoaded: boolean;
    approvalsPending: number;
    threatsDetected: number;
  };
  proactiveState: {
    enabled: boolean;
    quietHours: boolean;
    backgroundTasks: number;
  };
  schedulerState: {
    scheduledTasks: number;
    nextTask?: string;
  };
  mcpState: {
    connected: number;
    total: number;
    servers: Record<string, MCPServerState>;
  };
  systemHealth: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    uptime: number;
  };
  theme: string;
  presence: 'active' | 'idle' | 'busy' | 'away';
}

export interface RuntimeEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  payload: any;
}

// ===== MAIRuntime Class =====

export class MAIRuntime {
  private config: HarnessConfig;
  private state: RuntimeContext;
  private emitter: EventEmitter = new EventEmitter();
  private taskQueue: TaskQueueState = {
    queued: [],
    running: [],
    waitingApproval: [],
    paused: []
  };
  private runningActions: Map<string, RunningAction> = new Map();
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private sessions: Map<string, SessionState> = new Map();
  private providers: Map<string, ProviderEntry> = new Map();
  private channels: Map<string, { channelId: string; status: ChannelStatus; type: string }> = new Map();
  private mcpServers: Map<string, MCPServerState> = new Map();
  
  constructor(config: HarnessConfig) {
    this.config = config;
    this.state = this.initializeState();
  }

  private initializeState(): RuntimeContext {
    return {
      session: undefined,
      currentTask: undefined,
      activeModel: undefined,
      memoryState: {
        loaded: false,
        entryCount: 0,
        lastCompaction: undefined
      },
      activeChannels: [],
      deviceState: {
        online: true,
        platform: process.platform,
        arch: process.arch
      },
      sandboxSessions: new Map(),
      gatewayHealth: {
        status: 'healthy',
        channels: {},
        lastCheck: new Date().toISOString()
      },
      securityState: {
        policyLoaded: false,
        approvalsPending: 0,
        threatsDetected: 0
      },
      proactiveState: {
        enabled: true,
        quietHours: false,
        backgroundTasks: 0
      },
      schedulerState: {
        scheduledTasks: 0,
        nextTask: undefined
      },
      mcpState: {
        connected: 0,
        total: 0,
        servers: {}
      },
      systemHealth: {
        status: 'healthy',
        uptime: process.uptime()
      },
      theme: 'default',
      presence: 'active'
    };
  }

  // ===== Session Management =====

  createSession(sessionId: string, channelId: string, userId?: string): SessionState {
    const session: SessionState = {
      sessionId,
      userId,
      channelId,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      context: {}
    };
    this.sessions.set(sessionId, session);
    this.state.session = session;
    this.emit('session.created', { session });
    return session;
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date().toISOString();
      this.emit('session.activity', { sessionId });
    }
  }

  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    if (this.state.session?.sessionId === sessionId) {
      this.state.session = undefined;
    }
    this.emit('session.ended', { sessionId });
  }

  // ===== Task Management =====

  addTask(task: Task): void {
    this.taskQueue.queued.push(task);
    this.emit('task.added', { task });
  }

  updateTask(taskId: string, updates: Partial<Task>): void {
    for (const queue of ['queued', 'running', 'waitingApproval', 'paused'] as const) {
      const taskIndex = this.taskQueue[queue].findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        const task = this.taskQueue[queue][taskIndex];
        Object.assign(task, updates);
        this.emit('task.updated', { task });
        return;
      }
    }
  }

  enqueueTask(task: Task): void {
    this.taskQueue.queued.push(task);
    this.emit('task.enqueued', { task });
  }

  startTask(task: Task): void {
    // Remove from queue if present
    this.taskQueue.queued = this.taskQueue.queued.filter(t => t.id !== task.id);
    this.taskQueue.running.push(task);
    this.state.currentTask = task;
    this.emit('task.started', { task });
  }

  pauseTask(taskId: string): void {
    const task = this.taskQueue.running.find(t => t.id === taskId);
    if (task) {
      this.taskQueue.running = this.taskQueue.running.filter(t => t.id !== taskId);
      this.taskQueue.paused.push(task);
      this.emit('task.paused', { taskId });
    }
  }

  resumeTask(taskId: string): void {
    const task = this.taskQueue.paused.find(t => t.id === taskId);
    if (task) {
      this.taskQueue.paused = this.taskQueue.paused.filter(t => t.id !== taskId);
      this.taskQueue.running.push(task);
      this.emit('task.resumed', { taskId });
    }
  }

  completeTask(taskId: string, result?: any): void {
    const taskIndex = this.taskQueue.running.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      const task = this.taskQueue.running[taskIndex];
      task.status = 'completed';
      task.result = result;
      task.updatedAt = new Date().toISOString();
      this.taskQueue.running.splice(taskIndex, 1);
      
      if (this.state.currentTask?.id === taskId) {
        this.state.currentTask = undefined;
      }
      
      this.emit('task.completed', { task, result });
    }
  }

  failTask(taskId: string, error: string): void {
    const taskIndex = this.taskQueue.running.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      const task = this.taskQueue.running[taskIndex];
      task.status = 'failed';
      task.result = { error };
      task.updatedAt = new Date().toISOString();
      this.taskQueue.running.splice(taskIndex, 1);
      
      if (this.state.currentTask?.id === taskId) {
        this.state.currentTask = undefined;
      }
      
      this.emit('task.failed', { task, error });
    }
  }

  cancelTask(taskId: string, reason?: string): boolean {
    // Check all queues
    for (const queue of ['queued', 'running', 'waitingApproval', 'paused'] as const) {
      const taskIndex = this.taskQueue[queue].findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        const task = this.taskQueue[queue][taskIndex];
        task.status = 'cancelled';
        task.result = { cancelled: true, reason };
        task.updatedAt = new Date().toISOString();
        this.taskQueue[queue].splice(taskIndex, 1);
        
        if (this.state.currentTask?.id === taskId) {
          this.state.currentTask = undefined;
        }
        
        this.emit('task.cancelled', { task, reason });
        return true;
      }
    }
    return false;
  }

  getTask(taskId: string): Task | undefined {
    for (const queue of Object.values(this.taskQueue)) {
      const task = queue.find((t: Task) => t.id === taskId);
      if (task) return task;
    }
    return undefined;
  }

  getTaskQueue(): TaskQueueState {
    return { ...this.taskQueue };
  }

  // ===== Action Management =====

  registerRunningAction(action: RunningAction): void {
    this.runningActions.set(action.actionId, action);
    this.emit('action.started', { action });
  }

  unregisterRunningAction(actionId: string): void {
    this.runningActions.delete(actionId);
    this.emit('action.ended', { actionId });
  }

  getRunningAction(actionId: string): RunningAction | undefined {
    return this.runningActions.get(actionId);
  }

  getRunningActions(): RunningAction[] {
    return Array.from(this.runningActions.values());
  }

  // ===== Approval Management =====

  addPendingApproval(approval: PendingApproval): void {
    this.pendingApprovals.set(approval.approvalId, approval);
    this.state.securityState.approvalsPending = this.pendingApprovals.size;
    this.emit('approval.requested', { approval });
  }

  resolveApproval(approvalId: string, decision: 'approved' | 'denied', decidedBy?: string): void {
    const approval = this.pendingApprovals.get(approvalId);
    if (approval) {
      approval.status = decision;
      approval.decidedBy = decidedBy;
      approval.decidedAt = new Date().toISOString();
      this.pendingApprovals.set(approvalId, approval);
      this.state.securityState.approvalsPending = this.pendingApprovals.size;
      this.emit('approval.resolved', { approval, decision });
    }
  }

  getPendingApproval(approvalId: string): PendingApproval | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values());
  }

  // ===== Model/Provider Management =====

  setActiveModel(providerId: string, modelId: string, contextLimit: number): void {
    this.state.activeModel = {
      providerId,
      modelId,
      contextLimit,
      tokensUsed: 0,
      cost: 0
    };
    this.emit('model.changed', { providerId, modelId });
  }

  updateModelUsage(tokensUsed: number, cost: number): void {
    if (this.state.activeModel) {
      this.state.activeModel.tokensUsed += tokensUsed;
      this.state.activeModel.cost += cost;
      this.emit('model.usage', { tokensUsed, cost });
    }
  }

  registerProvider(providerId: string, state: ProviderEntry): void {
    this.providers.set(providerId, state);
    this.emit('provider.registered', { providerId, state });
  }

  updateProviderState(providerId: string, updates: Partial<ProviderEntry>): void {
    const provider = this.providers.get(providerId);
    if (provider) {
      Object.assign(provider, updates);
      this.emit('provider.updated', { providerId, state: provider });
    }
  }

  // ===== Memory State =====

  updateMemoryState(loaded: boolean, entryCount: number, lastCompaction?: string): void {
    this.state.memoryState = { loaded, entryCount, lastCompaction };
    this.emit('memory.updated', { loaded, entryCount, lastCompaction });
  }

  // ===== Channel Management =====

  registerChannel(channelId: string, status: ChannelStatus, type: string): void {
    this.channels.set(channelId, { channelId, status, type });
    if (!this.state.activeChannels.includes(channelId)) {
      this.state.activeChannels.push(channelId);
    }
    this.state.gatewayHealth.channels[channelId] = status === 'connected';
    this.emit('channel.registered', { channelId, status, type });
  }

  updateChannelState(channelId: string, updates: { status?: ChannelStatus; type?: string }): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      Object.assign(channel, updates);
      this.state.gatewayHealth.channels[channelId] = updates.status === 'connected';
      this.emit('channel.updated', { channelId, state: channel });
    }
  }

  // ===== MCP Management =====

  registerMCPServer(serverId: string, state: MCPServerState): void {
    this.mcpServers.set(serverId, state);
    this.state.mcpState.servers[serverId] = state;
    this.state.mcpState.total++;
    if (state.status === 'connected') {
      this.state.mcpState.connected++;
    }
    this.emit('mcp.server.registered', { serverId, state });
  }

  updateMCPServerState(serverId: string, updates: Partial<MCPServerState>): void {
    const server = this.mcpServers.get(serverId);
    if (server) {
      const wasConnected = server.status === 'connected';
      Object.assign(server, updates);
      this.state.mcpState.servers[serverId] = server;
      
      if (!wasConnected && updates.status === 'connected') {
        this.state.mcpState.connected++;
      } else if (wasConnected && updates.status !== 'connected') {
        this.state.mcpState.connected--;
      }
      
      this.emit('mcp.server.updated', { serverId, state: server });
    }
  }

  // ===== System Health =====

  updateSystemHealth(updates: Partial<typeof this.state.systemHealth>): void {
    Object.assign(this.state.systemHealth, updates);
    this.emit('system.health', { health: this.state.systemHealth });
  }

  // ===== Presence & Theme =====

  setPresence(presence: 'active' | 'idle' | 'busy' | 'away'): void {
    this.state.presence = presence;
    this.emit('presence.changed', { presence });
  }

  setTheme(theme: string): void {
    this.state.theme = theme;
    this.emit('theme.changed', { theme });
  }

  // ===== State Access =====

  getState(): RuntimeContext {
    return { ...this.state };
  }

  getConfig(): HarnessConfig {
    return this.config;
  }

  // ===== Event System =====

  emit(type: string, payload: any): void {
    const event: RuntimeEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      source: 'runtime',
      timestamp: new Date().toISOString(),
      severity: 'info',
      payload
    };
    this.emitter.emit(type, event);
  }

  on(event: string, handler: (event: RuntimeEvent) => void): void {
    this.emitter.on(event, handler);
  }

  once(event: string, handler: (event: RuntimeEvent) => void): void {
    this.emitter.once(event, handler);
  }

  off(event: string, handler: (event: RuntimeEvent) => void): void {
    this.emitter.off(event, handler);
  }
}

// Singleton instance
let runtimeInstance: MAIRuntime | null = null;

export function getRuntime(): MAIRuntime {
  if (!runtimeInstance) {
    throw new Error('Runtime not initialized. Call initializeRuntime() first.');
  }
  return runtimeInstance;
}

export function initializeRuntime(config: HarnessConfig): MAIRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new MAIRuntime(config);
  }
  return runtimeInstance;
}

export function resetRuntime(): void {
  runtimeInstance = null;
}
