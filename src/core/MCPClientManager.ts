/**
 * M.A.I. ENGINEERING - MCP Client Manager
 * Phase 2: MCP Integration
 * 
 * Manages connections to external MCP servers, discovers capabilities,
 * and executes MCP tools with policy enforcement.
 */

import { EventEmitter } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';
import { MCPServerConfig, MCPServerState } from './MCP.types';
import { MAIRuntime, getRuntime } from './MAIRuntime';
import { ActionRequest, ActionAuthorization } from '../actions/types';
import { TaskService } from './TaskService';

export interface MCPServerConnection {
  serverId: string;
  client: Client;
  transport: Transport;
  state: MCPServerState;
  connectedAt?: string;
  lastActivity?: string;
}

export class MCPClientManager extends EventEmitter {
  private runtime: MAIRuntime;
  private taskService: TaskService;
  private connections: Map<string, MCPServerConnection> = new Map();
  private serverConfigs: Map<string, MCPServerConfig> = new Map();

  constructor(runtime?: MAIRuntime, taskService?: TaskService) {
    super();
    this.runtime = runtime || getRuntime();
    this.taskService = taskService || new TaskService(this.runtime);
  }

  /**
   * Register an MCP server configuration
   */
  registerServer(config: MCPServerConfig): void {
    this.serverConfigs.set(config.serverId, config);
    
    const initialState: MCPServerState = {
      serverId: config.serverId,
      name: config.name,
      transport: config.transport,
      endpoint: config.endpoint,
      command: config.command,
      enabled: config.enabled !== false,
      status: 'disconnected',
      capabilities: {
        tools: false,
        resources: false,
        prompts: false
      },
      health: {
        consecutiveFailures: 0,
        uptime: 0
      },
      trustLevel: config.trustLevel || 'semi_trusted',
      allowedTools: config.allowedTools || [],
      allowedResources: config.allowedResources || [],
      allowedPrompts: config.allowedPrompts || [],
      policyTier: config.policyTier || 'moderate',
      authentication: config.authentication,
      lastSeen: undefined,
      latency: undefined
    };

    this.runtime.registerMCPServer(config.serverId, initialState);
    this.emit('server.registered', { serverId: config.serverId, config });
  }

  /**
   * Connect to an MCP server
   */
  async connect(serverId: string): Promise<void> {
    const config = this.serverConfigs.get(serverId);
    if (!config) {
      throw new Error(`MCP server ${serverId} not configured`);
    }

    const connection = await this.createConnection(config);
    this.connections.set(serverId, connection);

    // Discover capabilities
    await this.discoverCapabilities(serverId);

    // Update runtime state
    this.runtime.updateMCPServerState(serverId, {
      status: 'connected',
      lastSeen: new Date().toISOString()
    });

    this.emit('server.connected', { serverId, connection });
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return;
    }

    try {
      await connection.client.close();
      if (connection.transport && 'close' in connection.transport) {
        await (connection.transport as any).close();
      }
    } catch (error) {
      console.error(`Error disconnecting MCP server ${serverId}:`, error);
    }

    this.connections.delete(serverId);
    this.runtime.updateMCPServerState(serverId, {
      status: 'disconnected',
      lastSeen: new Date().toISOString()
    });

    this.emit('server.disconnected', { serverId });
  }

  /**
   * List available tools from an MCP server
   */
  async listTools(serverId: string): Promise<Tool[]> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const response = await connection.client.listTools();
    return response.tools;
  }

  /**
   * List available resources from an MCP server
   */
  async listResources(serverId: string): Promise<Resource[]> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const response = await connection.client.listResources();
    return response.resources;
  }

  /**
   * List available prompts from an MCP server
   */
  async listPrompts(serverId: string): Promise<Prompt[]> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const response = await connection.client.listPrompts();
    return response.prompts;
  }

  /**
   * Call an MCP tool with policy enforcement
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, any>,
    context?: { sessionId?: string; taskId?: string }
  ): Promise<any> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    // Check if tool is allowed
    const config = this.serverConfigs.get(serverId);
    if (config?.allowedTools && !config.allowedTools.includes(toolName)) {
      throw new Error(`Tool ${toolName} is not allowed on server ${serverId}`);
    }

    // Create action request for policy check
    const actionRequest: ActionRequest = {
      actionId: `mcp_${serverId}_${toolName}_${Date.now()}`,
      actionName: `mcp:${serverId}:${toolName}`,
      source: 'mcp-client',
      sessionId: context?.sessionId,
      taskId: context?.taskId,
      parameters: { serverId, toolName, args },
      parameterHash: this.hashParameters({ serverId, toolName, args }),
      risk: this.assessToolRisk(toolName, args),
      trustContext: {
        provenance: config?.trustLevel === 'trusted' ? 'trusted' : 'semi_trusted',
        sourceTrustLevel: config?.trustLevel === 'trusted' ? 0.9 : 0.5
      }
    };

    // Policy check would go here (integrate with PolicyService)
    // For now, we proceed with execution

    const startTime = Date.now();
    try {
      const result = await connection.client.callTool({
        name: toolName,
        arguments: args
      });

      const latency = Date.now() - startTime;
      this.runtime.updateMCPServerState(serverId, {
        lastSeen: new Date().toISOString(),
        latency
      });

      return result;
    } catch (error: any) {
      this.runtime.updateMCPServerState(serverId, {
        lastSeen: new Date().toISOString(),
        health: { ...connection.state.health, lastError: error.message }
      });
      throw error;
    }
  }

  /**
   * Read a resource from an MCP server
   */
  async readResource(serverId: string, uri: string): Promise<any> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    // Check if resource is allowed
    const config = this.serverConfigs.get(serverId);
    if (config?.allowedResources && !config.allowedResources.some(r => uri.startsWith(r))) {
      throw new Error(`Resource ${uri} is not allowed on server ${serverId}`);
    }

    const result = await connection.client.readResource({ uri });
    return result.contents;
  }

  /**
   * Invoke a prompt from an MCP server
   */
  async invokePrompt(
    serverId: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<any> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    // Check if prompt is allowed
    const config = this.serverConfigs.get(serverId);
    if (config?.allowedPrompts && !config.allowedPrompts.includes(promptName)) {
      throw new Error(`Prompt ${promptName} is not allowed on server ${serverId}`);
    }

    const result = await connection.client.getPrompt({
      name: promptName,
      arguments: args
    });

    return result.messages;
  }

  /**
   * Get server health status
   */
  getServerState(serverId: string): MCPServerState | undefined {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return undefined;
    }
    return connection.state;
  }

  /**
   * Get all connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get all server configurations
   */
  getAllServers(): Array<{ config: MCPServerConfig; state?: MCPServerState }> {
    return Array.from(this.serverConfigs.entries()).map(([id, config]) => ({
      config,
      state: this.connections.get(id)?.state
    }));
  }

  /**
   * Create a connection based on transport type
   */
  private async createConnection(config: MCPServerConfig): Promise<MCPServerConnection> {
    const client = new Client({
      name: 'mai-harness',
      version: '2.0.0'
    });

    let transport: Transport;

    if (config.transport === 'stdio') {
      transport = new StdioClientTransport({
        command: config.command!,
        args: config.args || []
      });
    } else if (config.transport === 'streamable-http') {
      transport = new StreamableHTTPClientTransport(new URL(config.endpoint!));
    } else {
      throw new Error(`Unsupported transport: ${config.transport}`);
    }

    await client.connect(transport);

    return {
      serverId: config.serverId,
      client,
      transport,
      state: {
        serverId: config.serverId,
        name: config.name,
        transport: config.transport,
        endpoint: config.endpoint,
        command: config.command,
        enabled: config.enabled !== false,
        status: 'connected',
        capabilities: { tools: false, resources: false, prompts: false },
        health: { consecutiveFailures: 0, uptime: 0 },
        trustLevel: config.trustLevel || 'semi_trusted',
        allowedTools: config.allowedTools || [],
        allowedResources: config.allowedResources || [],
        allowedPrompts: config.allowedPrompts || [],
        policyTier: config.policyTier || 'moderate',
        authentication: config.authentication,
        lastSeen: new Date().toISOString()
      },
      connectedAt: new Date().toISOString()
    };
  }

  /**
   * Discover server capabilities
   */
  private async discoverCapabilities(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) return;

    try {
      // Check tools
      try {
        const tools = await this.listTools(serverId);
        connection.state.capabilities.tools = true;
        connection.state.toolNames = tools.map(t => t.name);
      } catch {
        connection.state.capabilities.tools = false;
      }

      // Check resources
      try {
        const resources = await this.listResources(serverId);
        connection.state.capabilities.resources = true;
        connection.state.resourceUris = resources.map(r => r.uri);
      } catch {
        connection.state.capabilities.resources = false;
      }

      // Check prompts
      try {
        const prompts = await this.listPrompts(serverId);
        connection.state.capabilities.prompts = true;
        connection.state.promptNames = prompts.map(p => p.name);
      } catch {
        connection.state.capabilities.prompts = false;
      }

      connection.state.lastSeen = new Date().toISOString();
    } catch (error: any) {
      connection.state.health.lastError = error.message;
      connection.state.health.consecutiveFailures++;
    }
  }

  /**
   * Assess tool risk level
   */
  private assessToolRisk(toolName: string, args: Record<string, any>): 'low' | 'medium' | 'high' | 'critical' {
    const highRiskPatterns = ['execute', 'run', 'delete', 'write', 'modify', 'remove'];
    const mediumRiskPatterns = ['read', 'get', 'list', 'search', 'query'];

    const lowerName = toolName.toLowerCase();

    if (highRiskPatterns.some(p => lowerName.includes(p))) {
      return 'high';
    }

    if (mediumRiskPatterns.some(p => lowerName.includes(p))) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Hash parameters for audit trail
   */
  private hashParameters(params: any): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex').substr(0, 16);
  }
}

// Singleton instance
let mcpClientManagerInstance: MCPClientManager | null = null;

export function getMCPClientManager(runtime?: MAIRuntime, taskService?: TaskService): MCPClientManager {
  if (!mcpClientManagerInstance) {
    mcpClientManagerInstance = new MCPClientManager(runtime, taskService);
  }
  return mcpClientManagerInstance;
}

export function resetMCPClientManager(): void {
  mcpClientManagerInstance = null;
}
