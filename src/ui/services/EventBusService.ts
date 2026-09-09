/**
 * M.A.I. UI Event Bus Service
 * WebSocket-based real-time event streaming with deduplication and reconnection
 */

import { EventEmitter } from 'events';

export interface UiEvent {
  eventId: string;
  sequence: number;
  type: string;
  timestamp: string;
  source: string;
  payload: any;
}

export type ConnectionStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'RECONNECTING';

export const EVENT_TYPES = {
  RUNTIME_STATE: 'runtime_state',
  TASK_UPDATE: 'task_update',
  ACTION_START: 'action_start',
  ACTION_PROGRESS: 'action_progress',
  ACTION_COMPLETE: 'action_complete',
  APPROVAL_REQUEST: 'approval_request',
  APPROVAL_RESOLVED: 'approval_resolved',
  MEMORY_UPDATE: 'memory_update',
  PROVIDER_UPDATE: 'provider_update',
  MCP_UPDATE: 'mcp_update',
  GATEWAY_UPDATE: 'gateway_update',
  NOTIFICATION: 'notification',
  SECURITY_ALERT: 'security_alert',
  REACTOR_PULSE: 'reactor_pulse',
  VOICE_STATE: 'voice_state',
  CONFIG_CHANGED: 'config_changed',
} as const;

interface EventBusConfig {
  wsUrl?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  eventBufferSize?: number;
}

export class EventBusService extends EventEmitter {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'OFFLINE';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private lastSequence = 0;
  private eventBuffer: UiEvent[] = [];
  private config: Required<EventBusConfig>;
  private seenEventIds = new Set<string>();
  private maxSeenIds = 1000;

  constructor(config: EventBusConfig = {}) {
    super();
    this.config = {
      wsUrl: process.env.MAI_WS_URL || `ws://localhost:${process.env.PORT || 3000}/ws`,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      eventBufferSize: 100,
      ...config,
    } as Required<EventBusConfig>;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setStatus('RECONNECTING');
    
    try {
      this.ws = new WebSocket(this.config.wsUrl);
      
      this.ws.onopen = () => {
        console.log('[EventBus] Connected');
        this.setStatus('ONLINE');
        this.reconnectAttempts = 0;
        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const uiEvent = JSON.parse(event.data) as UiEvent;
          this.handleEvent(uiEvent);
        } catch (err) {
          console.error('[EventBus] Failed to parse event:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('[EventBus] Disconnected');
        this.setStatus('OFFLINE');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[EventBus] Error:', err);
        this.setStatus('DEGRADED');
      };
    } catch (err) {
      console.error('[EventBus] Connection failed:', err);
      this.setStatus('OFFLINE');
      this.scheduleReconnect();
    }
  }

  private handleEvent(event: UiEvent): void {
    // Deduplication
    if (this.seenEventIds.has(event.eventId)) {
      return;
    }

    // Sequence validation
    if (event.sequence <= this.lastSequence && event.type !== EVENT_TYPES.RUNTIME_STATE) {
      console.warn('[EventBus] Out-of-order event:', event.sequence);
      return;
    }

    this.lastSequence = event.sequence;
    this.addToSeen(event.eventId);
    this.eventBuffer.push(event);
    
    if (this.eventBuffer.length > this.config.eventBufferSize) {
      this.eventBuffer.shift();
    }

    this.emit(event.type, event.payload);
    this.emit('event', event);
  }

  private addToSeen(eventId: string): void {
    this.seenEventIds.add(eventId);
    if (this.seenEventIds.size > this.maxSeenIds) {
      const firstKey = this.seenEventIds.values().next().value;
      if (firstKey) {
        this.seenEventIds.delete(firstKey);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[EventBus] Max reconnect attempts reached');
      this.emit('max-reconnects-reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[EventBus] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.setStatus('OFFLINE');
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.emit('status-change', status);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  send(type: string, payload: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, payload });
      this.ws.send(message);
    } else {
      console.warn('[EventBus] Cannot send - not connected');
      this.emit('send-failed', { type, payload });
    }
  }

  getRecentEvents(count = 50): UiEvent[] {
    return this.eventBuffer.slice(-count);
  }

  clearBuffer(): void {
    this.eventBuffer = [];
    this.seenEventIds.clear();
    this.lastSequence = 0;
  }
}

export const eventBus = new EventBusService();
