/**
 * Shared test utilities for MCP tool testing
 *
 * @module tests/unit/helpers/tool-test-utils
 */

import type { ToolContext, ToolResult } from '../../../src/mcp/tools/types';

/**
 * Extract text content from a tool result safely.
 * Handles type guards to ensure the result contains text content.
 *
 * @param result - The tool result to extract text from
 * @returns The text content of the first content item
 * @throws Error if result has no content or first item is not text
 */
export function getTextFromResult(result: ToolResult): string {
  if (!result.content || result.content.length === 0) {
    throw new Error('Result has no content');
  }

  const firstContent = result.content[0];
  if (!firstContent || firstContent.type !== 'text') {
    throw new Error('First content item is not text');
  }

  return firstContent.text;
}

/**
 * Parse JSON response from tool result.
 * Combines text extraction and JSON parsing with proper error handling.
 *
 * @param result - The tool result to parse
 * @returns Parsed JSON object
 * @throws Error if result is invalid or JSON parsing fails
 */
export function parseToolResponse<T = unknown>(result: ToolResult): T {
  const text = getTextFromResult(result);
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Failed to parse tool response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a mock ToolContext for testing.
 * Provides a reusable factory for creating mock contexts with common defaults.
 *
 * @param overrides - Optional overrides for specific context properties
 * @returns Mock ToolContext with jest.Mock functions
 */
export function createMockToolContext(
  overrides?: Partial<ToolContext>
): {
  context: Partial<ToolContext>;
  mocks: {
    getRegisteredMiners: jest.Mock;
    getMinerStatus: jest.Mock;
    refreshMinerStatus: jest.Mock;
    createJob?: jest.Mock;
    updateProgress?: jest.Mock;
    completeJob?: jest.Mock;
    getJob?: jest.Mock;
  };
} {
  // Create mocks
  const mockGetRegisteredMiners = jest.fn();
  const mockGetMinerStatus = jest.fn();
  const mockRefreshMinerStatus = jest.fn();
  const mockCreateJob = jest.fn();
  const mockUpdateProgress = jest.fn();
  const mockCompleteJob = jest.fn();
  const mockGetJob = jest.fn();

  // Set up default mock implementations
  mockGetRegisteredMiners.mockResolvedValue([
    { id: 'miner-1', host: '192.168.1.100', port: 50051 },
    { id: 'miner-2', host: '192.168.1.101', port: 50051 },
  ]);

  mockGetMinerStatus.mockResolvedValue({
    online: true,
    hashrate: 95.5,
    temperature: 65,
  });

  mockRefreshMinerStatus.mockResolvedValue(undefined);

  mockCreateJob.mockResolvedValue({
    jobId: 'job-123',
    type: 'test',
    status: 'pending',
    progress: { total: 0, completed: 0, failed: 0 },
  });

  mockUpdateProgress.mockResolvedValue(undefined);
  mockCompleteJob.mockResolvedValue(undefined);

  mockGetJob.mockResolvedValue({
    jobId: 'job-123',
    type: 'test',
    status: 'completed',
    progress: { total: 3, completed: 3, failed: 0 },
  });

  // Create base context
  const baseContext: Partial<ToolContext> = {
    minerService: {
      getRegisteredMiners: mockGetRegisteredMiners,
      getMinerStatus: mockGetMinerStatus,
      refreshMinerStatus: mockRefreshMinerStatus,
    } as unknown as ToolContext['minerService'],
    jobService: {
      createJob: mockCreateJob,
      updateProgress: mockUpdateProgress,
      completeJob: mockCompleteJob,
      getJob: mockGetJob,
    } as unknown as ToolContext['jobService'],
  };

  // Merge with overrides
  const context = { ...baseContext, ...overrides };

  return {
    context,
    mocks: {
      getRegisteredMiners: mockGetRegisteredMiners,
      getMinerStatus: mockGetMinerStatus,
      refreshMinerStatus: mockRefreshMinerStatus,
      createJob: mockCreateJob,
      updateProgress: mockUpdateProgress,
      completeJob: mockCompleteJob,
      getJob: mockGetJob,
    },
  };
}
