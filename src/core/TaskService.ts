/**
 * M.A.I. ENGINEERING - TaskService
 * First-class task management for Phase 2
 * 
 * Handles task lifecycle: queued → planning → running → waiting_approval → paused → completed/failed/cancelled
 */

import { EventEmitter } from 'node:events';
import {
  Task,
  TaskStatus,
  TaskType,
  TaskPriority,
  RiskLevel,
  TaskAction,
  TaskApproval,
  TaskDependency,
  TaskCreateOptions,
  TaskUpdateOptions
} from './types';
import { MAIRuntime, getRuntime } from './MAIRuntime';

export class TaskService extends EventEmitter {
  private runtime: MAIRuntime;
  private tasks: Map<string, Task> = new Map();

  constructor(runtime?: MAIRuntime) {
    super();
    this.runtime = runtime || getRuntime();
  }

  /**
   * Create a new task
   */
  async create(options: TaskCreateOptions): Promise<Task> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const task: Task = {
      id: taskId,
      type: options.type || 'foreground',
      priority: options.priority || 'normal',
      title: options.title,
      description: options.description,
      initiator: 'user',
      trigger: 'manual',
      createdAt: now,
      updatedAt: now,
      deadline: options.deadline,
      status: 'queued',
      progress: 0,
      actions: options.actions || [],
      dependencies: options.dependencies || [],
      risk: this.calculateRisk(options),
      requiredApprovals: [],
      metadata: options.metadata || {}
    };

    this.tasks.set(taskId, task);
    this.runtime.addTask(task);

    this.emit('task:created', { task });
    return task;
  }

  /**
   * Get a task by ID
   */
  async get(taskId: string): Promise<Task | undefined> {
    // Check in-memory cache first
    const cached = this.tasks.get(taskId);
    if (cached) return cached;

    // Check runtime state
    return this.runtime.getTask(taskId);
  }

  /**
   * Update a task
   */
  async update(taskId: string, options: TaskUpdateOptions): Promise<Task> {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const updatedTask: Task = {
      ...task,
      ...options,
      updatedAt: new Date().toISOString()
    };

    this.tasks.set(taskId, updatedTask);
    this.runtime.updateTask(taskId, updatedTask);

    this.emit('task:updated', { task: updatedTask });
    return updatedTask;
  }

  /**
   * Start executing a task
   */
  async start(taskId: string): Promise<void> {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    await this.update(taskId, {
      status: 'running',
      progress: task.progress > 0 ? task.progress : 1
    });

    this.runtime.startTask(task);
    this.emit('task:started', { task });
  }

  /**
   * Pause a running task
   */
  async pause(taskId: string): Promise<void> {
    const task = await this.get(taskId);
    if (!task || task.status !== 'running') {
      throw new Error(`Task ${taskId} is not running`);
    }

    await this.update(taskId, { status: 'paused' });
    this.runtime.pauseTask(taskId);
    this.emit('task:paused', { task });
  }

  /**
   * Resume a paused task
   */
  async resume(taskId: string): Promise<void> {
    const task = await this.get(taskId);
    if (!task || task.status !== 'paused') {
      throw new Error(`Task ${taskId} is not paused`);
    }

    await this.update(taskId, { status: 'running' });
    this.runtime.resumeTask(taskId);
    this.emit('task:resumed', { task });
  }

  /**
   * Cancel a task with reason
   */
  async cancel(taskId: string, reason?: string): Promise<void> {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    await this.update(taskId, {
      status: 'cancelled',
      result: { cancelled: true, reason }
    });

    this.runtime.cancelTask(taskId, reason);
    this.emit('task:cancelled', { task, reason });
  }

  /**
   * Mark task as completed
   */
  async complete(taskId: string, result?: any): Promise<void> {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    await this.update(taskId, {
      status: 'completed',
      progress: 100,
      result
    });

    this.runtime.completeTask(taskId, result);
    this.emit('task:completed', { task, result });
  }

  /**
   * Mark task as failed
   */
  async fail(taskId: string, error: string): Promise<void> {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    await this.update(taskId, {
      status: 'failed',
      error
    });

    this.runtime.failTask(taskId, error);
    this.emit('task:failed', { task, error });
  }

  /**
   * Add an action to a task
   */
  async addAction(taskId: string, action: TaskAction): Promise<Task> {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.actions.push(action);
    return this.update(taskId, { metadata: { ...task.metadata, actionsUpdated: true } });
  }

  /**
   * Update action status
   */
  async updateActionStatus(
    taskId: string,
    actionId: string,
    status: TaskAction['status'],
    result?: any,
    error?: string
  ): Promise<Task> {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const action = task.actions.find(a => a.actionId === actionId);
    if (!action) {
      throw new Error(`Action ${actionId} not found in task ${taskId}`);
    }

    action.status = status;
    if (result !== undefined) action.result = result;
    if (error) action.error = error;
    if (status === 'running') action.startedAt = new Date().toISOString();
    if (status === 'completed' || status === 'failed') action.completedAt = new Date().toISOString();

    return this.update(taskId, { metadata: { ...task.metadata, actionStatusUpdated: true } });
  }

  /**
   * Add required approval to a task
   */
  async addRequiredApproval(
    taskId: string,
    approval: TaskApproval
  ): Promise<Task> {
    const task = await this.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    task.requiredApprovals.push(approval);
    
    if (approval.status === 'pending') {
      await this.update(taskId, { status: 'waiting_approval' });
    }

    return this.update(taskId, { metadata: { ...task.metadata, approvalsUpdated: true } });
  }

  /**
   * List tasks with optional filtering
   */
  async list(options?: {
    status?: TaskStatus;
    type?: TaskType;
    limit?: number;
  }): Promise<Task[]> {
    let allTasks = Array.from(this.tasks.values());

    if (options?.status) {
      allTasks = allTasks.filter(t => t.status === options.status);
    }

    if (options?.type) {
      allTasks = allTasks.filter(t => t.type === options.type);
    }

    const limit = options?.limit || 100;
    return allTasks.slice(0, limit);
  }

  /**
   * Get current active task
   */
  async getCurrent(): Promise<Task | undefined> {
    const state = this.runtime.getState();
    return state.currentTask;
  }

  /**
   * Get task history (completed/failed/cancelled)
   */
  async getHistory(limit: number = 50): Promise<Task[]> {
    const historicalTasks = Array.from(this.tasks.values())
      .filter(t => ['completed', 'failed', 'cancelled'].includes(t.status))
      .sort((a, b) => {
        const timeA = a.completedAt || a.updatedAt;
        const timeB = b.completedAt || b.updatedAt;
        return timeB.localeCompare(timeA);
      });

    return historicalTasks.slice(0, limit);
  }

  /**
   * Get tasks by status
   */
  async getByStatus(status: TaskStatus): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(t => t.status === status);
  }

  /**
   * Calculate risk level based on actions and metadata
   */
  private calculateRisk(options: TaskCreateOptions): RiskLevel {
    // Simple heuristic - can be enhanced with policy integration
    if (!options.actions || options.actions.length === 0) {
      return 'low';
    }

    const highRiskActions = ['execute_command', 'write_file', 'delete_file', 'network_request'];
    const hasHighRisk = options.actions.some(a =>
      highRiskActions.includes(a.actionName.toLowerCase())
    );

    if (hasHighRisk) {
      return options.priority === 'urgent' ? 'high' : 'medium';
    }

    return 'low';
  }

  /**
   * Propagate cancellation to child tasks
   */
  async cancelWithChildren(taskId: string, reason?: string): Promise<void> {
    const task = await this.get(taskId);
    if (!task) return;

    // Find and cancel all child tasks
    const childTasks = Array.from(this.tasks.values()).filter(
      t => t.parentId === taskId && t.status !== 'completed'
    );

    for (const child of childTasks) {
      await this.cancel(child.id, `Parent task cancelled: ${reason}`);
    }

    await this.cancel(taskId, reason);
  }

  /**
   * Check if task dependencies are satisfied
   */
  async checkDependencies(taskId: string): Promise<{ satisfied: boolean; pending: string[] }> {
    const task = await this.get(taskId);
    if (!task || !task.dependencies.length) {
      return { satisfied: true, pending: [] };
    }

    const pending: string[] = [];

    for (const dep of task.dependencies) {
      if (dep.type === 'blocks' || dep.type === 'requires') {
        const depTask = await this.get(dep.taskId);
        if (!depTask || depTask.status !== 'completed') {
          pending.push(dep.taskId);
        }
      }
    }

    return { satisfied: pending.length === 0, pending };
  }
}

// Singleton instance
let taskServiceInstance: TaskService | null = null;

export function getTaskService(runtime?: MAIRuntime): TaskService {
  if (!taskServiceInstance) {
    taskServiceInstance = new TaskService(runtime);
  }
  return taskServiceInstance;
}

export function resetTaskService(): void {
  taskServiceInstance = null;
}
