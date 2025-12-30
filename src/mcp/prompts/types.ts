/**
 * MCP Prompts Type Definitions
 *
 * Defines types for MCP prompts in the Braiins OS server.
 *
 * @module mcp/prompts/types
 */

import type { BaseContext } from '../tools/types';

/**
 * Context passed to prompt handlers.
 * Extends BaseContext to include all services.
 */
export interface PromptContext extends BaseContext {
  // PromptContext inherits all services from BaseContext
}

/**
 * Prompt message role
 */
export type PromptMessageRole = 'user' | 'assistant';

/**
 * Prompt message content
 */
export interface PromptMessage {
  role: PromptMessageRole;
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  };
}

/**
 * Prompt argument definition
 */
export interface PromptArgument {
  /** Argument name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Whether this argument is required */
  required: boolean;
}

/**
 * Prompt handler function signature
 */
export type PromptHandler = (
  args: Record<string, string>,
  context: PromptContext
) => Promise<PromptMessage[]>;

/**
 * Complete MCP prompt definition
 */
export interface MCPPromptDefinition {
  /** Prompt name for invocation */
  name: string;
  /** Human-readable description */
  description: string;
  /** Argument definitions */
  arguments?: PromptArgument[];
  /** Handler function to generate prompt messages */
  handler: PromptHandler;
}
