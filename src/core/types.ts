/**
 * M.A.I. ENGINEERING - Task System Types
 * First-class task model for Phase 2
 */

export type TaskStatus = 
  | 'queued'
  | 'planning'
  | 'running'
  | 'waiting_approval'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskType =
  | 'foreground'
  | 'background'
  | 'scheduled'
  | 'proactive'
  | 'macro'
  | 'mcp_driven';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface TaskAction {
  actionId: string;
  actionName: string;
  parameters: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskApproval {
  approvalId: string;
  actionId: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface TaskDependency {
  taskId: string;
  type: 'blocks' | 'requires' | 'parallel';
}

export interface Task {
  id: string;
  parentId?: string;
  type: TaskType;
  priority: TaskPriority;
  
  // Identification
  title: string;
  description?: string;
  initiator: string; // user, system, mcp-server:id, scheduler, proactive
  trigger: string; // what triggered this task
  
  // Timing
  createdAt: string;
  updatedAt: string;
  deadline?: string;
  startedAt?: string;
  completedAt?: string;
  
  // Status
  status: TaskStatus;
  progress: number; // 0-100
  
  // Execution
  actions: TaskAction[];
  dependencies: TaskDependency[];
  
  // Governance
  risk: RiskLevel;
  requiredApprovals: TaskApproval[];
  
  // Results
  artifacts?: Array<{
    type: string;
    name: string;
    path?: string;
    url?: string;
    size?: number;
  }>;
  result?: any;
  error?: string;
  
  // Context
  sessionId?: string;
  channelId?: string;
  metadata?: Record<string, any>;
}

export interface TaskCreateOptions {
  title: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  parentId?: string;
  deadline?: string;
  actions?: TaskAction[];
  dependencies?: TaskDependency[];
  metadata?: Record<string, any>;
}

export interface TaskUpdateOptions {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  deadline?: string;
  progress?: number;
  status?: TaskStatus;
  metadata?: Record<string, any>;
  result?: any;
  error?: string;
}

export interface TaskService {
  create(options: TaskCreateOptions): Promise<Task>;
  get(taskId: string): Promise<Task | undefined>;
  update(taskId: string, options: TaskUpdateOptions): Promise<Task>;
  cancel(taskId: string, reason?: string): Promise<void>;
  pause(taskId: string): Promise<void>;
  resume(taskId: string): Promise<void>;
  list(options?: { status?: TaskStatus; type?: TaskType; limit?: number }): Promise<Task[]>;
  getCurrent(): Promise<Task | undefined>;
  getHistory(limit?: number): Promise<Task[]>;
}
