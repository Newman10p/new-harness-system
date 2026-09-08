/**
 * M.A.I. ENGINEERING - MCP Types
 * Type definitions for Model Context Protocol integration
 */

import type { Tool, Resource, Prompt } from "@modelcontextprotocol/sdk/types.js";

export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'disabled';

export type MCPTransportType = 'stdio' | 'http' | 'websocket' | 'streamable-http';

export type MCPTrustLevel = 'trusted' | 'semi_trusted' | 'untrusted';

export interface MCPServerConfig {
  serverId: string;
  name: string;
  transport: MCPTransportType;
  endpoint?: string; // for http/websocket
  command?: string; // for stdio
  args?: string[];
  enabled: boolean;
  trustLevel?: MCPTrustLevel;
  allowedTools?: string[];
  allowedResources?: string[];
  allowedPrompts?: string[];
  policyTier?: 'strict' | 'moderate' | 'permissive';
  authentication?: {
    type: 'none' | 'bearer' | 'api_key' | 'oauth';
    token?: string;
    apiKey?: string;
  };
  timeout?: number;
  retryCount?: number;
}

export interface MCPServerState extends MCPServerConfig {
  status: MCPServerStatus;
  lastSeen?: string;
  latency?: number;
  capabilities: {
    tools: boolean;
    resources: boolean;
    prompts: boolean;
  };
  toolNames?: string[];
  resourceUris?: string[];
  promptNames?: string[];
  health: {
    lastError?: string;
    consecutiveFailures: number;
    uptime: number;
  };
}

export interface MCPServerHealth {
  serverId: string;
  status: MCPServerStatus;
  latency?: number;
  lastError?: string;
  timestamp: string;
}

export interface MCPToolCall {
  serverId: string;
  toolName: string;
  arguments: Record<string, any>;
  sessionId?: string;
  taskId?: string;
}

export interface MCPResourceRead {
  serverId: string;
  resourceUri: string;
}

export interface MCPPromptInvoke {
  serverId: string;
  promptName: string;
  arguments: Record<string, any>;
}

export interface MCPClientManager {
  discoverServers(): Promise<MCPServerConfig[]>;
  connect(serverId: string): Promise<void>;
  disconnect(serverId: string): Promise<void>;
  getServer(serverId: string): Promise<MCPServerState | undefined>;
  listServers(): Promise<MCPServerState[]>;
  listTools(serverId?: string): Promise<Tool[]>;
  callTool(call: MCPToolCall): Promise<any>;
  readResource(read: MCPResourceRead): Promise<any>;
  invokePrompt(invoke: MCPPromptInvoke): Promise<any>;
  getServerHealth(serverId: string): Promise<MCPServerHealth>;
  checkServerHealth(serverId: string): Promise<void>;
}

export interface MCPServerRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  registerTool(tool: Tool, handler: (args: any) => Promise<any>): void;
  registerResource(resource: Resource, handler: (uri: string) => Promise<any>): void;
  registerPrompt(prompt: Prompt, handler: (args: any) => Promise<any>): void;
  unregisterTool(toolName: string): void;
  unregisterResource(uri: string): void;
  unregisterPrompt(name: string): void;
}

export interface MCPRegistryEntry {
  serverId: string;
  name: string;
  description?: string;
  version?: string;
  homepage?: string;
  repository?: string;
  transport: MCPTransportType;
  capabilities: {
    toolsCount: number;
    resourcesCount: number;
    promptsCount: number;
  };
  trustLevel: MCPTrustLevel;
  tags?: string[];
}

export interface MCPRegistryService {
  listEntries(): Promise<MCPRegistryEntry[]>;
  getEntry(serverId: string): Promise<MCPRegistryEntry | undefined>;
  addEntry(entry: MCPRegistryEntry): Promise<void>;
  removeEntry(serverId: string): Promise<void>;
  updateEntry(serverId: string, updates: Partial<MCPRegistryEntry>): Promise<void>;
}
