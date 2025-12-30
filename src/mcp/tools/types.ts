/**
 * MCP Tool Type Definitions
 *
 * Common types and interfaces for MCP tools.
 *
 * @module mcp/tools/types
 */

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { BraiinsClient } from '../../api/braiins';
import type { JobService } from '../../services/job.service';
import type { MinerService } from '../../services/miner.service';

/**
 * Arguments passed to tool handlers.
 */
export type ToolArguments = Record<string, unknown>;

/**
 * Result of a tool execution (from MCP SDK).
 */
export type ToolResult = CallToolResult;

/**
 * Base context shared across all MCP handlers (tools, resources, prompts).
 * Contains all services available to handlers.
 */
export interface BaseContext {
  /** Miner management service */
  minerService: MinerService;
  /** Braiins OS API client */
  braiinsClient: BraiinsClient;
  /** Background job tracking service */
  jobService: JobService;
}

/**
 * Context available to all tool handlers.
 * Extends BaseContext for consistency.
 */
export interface ToolContext extends BaseContext {
  // ToolContext inherits all services from BaseContext
}

/**
 * Handler function for a tool.
 */
export type ToolHandler = (args: ToolArguments, context: ToolContext) => Promise<ToolResult>;

/**
 * Complete tool definition with schema and handler.
 */
export interface MCPToolDefinition {
  /** Tool metadata and input schema */
  schema: Tool;
  /** Tool execution handler */
  handler: ToolHandler;
}
