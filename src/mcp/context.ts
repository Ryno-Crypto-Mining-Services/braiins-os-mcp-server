/**
 * MCP Context Factory
 *
 * Provides factory function for creating standardized BaseContext objects.
 * Used in both production (server.ts) and test environments.
 *
 * @module mcp/context
 */

import type { BraiinsClient } from '../api/braiins';
import type { JobService } from '../services/job.service';
import type { MinerService } from '../services/miner.service';
import type { BaseContext } from './tools/types';

/**
 * Creates a standardized BaseContext for all MCP handlers.
 *
 * This factory ensures consistent context creation across production
 * and test environments. All MCP handlers (tools, resources, prompts)
 * receive this context object.
 *
 * @param minerService - Miner management service
 * @param braiinsClient - Braiins OS API client
 * @param jobService - Background job tracking service
 * @returns BaseContext object with all required services
 *
 * @example
 * // Production usage (in server.ts)
 * const baseContext = createBaseContext(minerService, braiinsClient, jobService);
 *
 * @example
 * // Test usage
 * const mockContext = createBaseContext(
 *   mockMinerService as MinerService,
 *   {} as BraiinsClient,
 *   mockJobService as JobService
 * );
 */
export function createBaseContext(
  minerService: MinerService,
  braiinsClient: BraiinsClient,
  jobService: JobService
): BaseContext {
  return {
    minerService,
    braiinsClient,
    jobService,
  };
}
