/**
 * Configure Fan Control Tool
 *
 * Configure fan speed and mode (auto or manual) for Braiins OS miners.
 * Includes safety validation to prevent overheating.
 *
 * @module mcp/tools/configure-fan-control
 */

import { z } from 'zod';
import { createGrpcClient, type CoolingModeConfig } from '../../api/grpc/client';
import { GRPC_CONFIG } from '../../config/constants';
import { createChildLogger } from '../../utils/logger';
import type { MCPToolDefinition, ToolArguments, ToolContext } from './types';
import { validateFanSpeed, validateFanSpeedRange } from './validators';

const logger = createChildLogger({ module: 'configure-fan-control' });

/**
 * Fan control mode schema.
 */
const FanModeSchema = z.enum(['auto', 'manual'], {
  errorMap: () => ({
    message: 'Fan mode must be either "auto" or "manual"',
  }),
});

/**
 * Fan speed percentage schema (0-100).
 */
const FanSpeedSchema = z.number().int().min(0).max(100);

/**
 * Miner IDs schema - supports batch operations with reasonable limits.
 */
const MinerIdsSchema = z.array(z.string().min(1)).min(1, 'At least one miner ID required').max(100, 'Maximum 100 miners per batch');

/**
 * Input schema for configure fan control tool.
 */
const ConfigureFanControlArgsSchema = z
  .object({
    minerIds: MinerIdsSchema,
    mode: FanModeSchema,
    fanSpeed: FanSpeedSchema.optional().describe('Fan speed percentage (0-100) for manual mode'),
    minFanSpeed: FanSpeedSchema.optional().describe('Minimum fan speed for auto mode'),
    maxFanSpeed: FanSpeedSchema.optional().describe('Maximum fan speed for auto mode'),
    validate: z.boolean().optional().default(true).describe('Enable safety validation'),
    detailLevel: z.enum(['concise', 'verbose']).optional().default('concise').describe('Output detail level'),
  })
  .strict();

/**
 * Individual miner configuration result.
 */
interface MinerConfigResult {
  minerId: string;
  status: 'success' | 'failed';
  error?: string;
  warning?: string;
}

/**
 * Configures fan control for a single miner.
 *
 * @param minerId - Miner ID to configure
 * @param mode - Fan control mode
 * @param fanSpeed - Manual fan speed (if manual mode)
 * @param minFanSpeed - Minimum fan speed (if auto mode)
 * @param maxFanSpeed - Maximum fan speed (if auto mode)
 * @param validate - Enable safety validation
 * @param context - Tool context with services
 * @returns Configuration result
 */
async function configureSingleMiner(
  minerId: string,
  mode: 'auto' | 'manual',
  fanSpeed: number | undefined,
  minFanSpeed: number | undefined,
  maxFanSpeed: number | undefined,
  validate: boolean,
  context: ToolContext
): Promise<MinerConfigResult> {
  try {
    // Validate safety if enabled
    if (validate) {
      let safetyCheck;

      if (mode === 'manual') {
        if (fanSpeed === undefined) {
          return {
            minerId,
            status: 'failed',
            error: 'fanSpeed is required for manual mode',
          };
        }
        safetyCheck = validateFanSpeed(fanSpeed, false);
      } else {
        // Auto mode
        if (minFanSpeed === undefined || maxFanSpeed === undefined) {
          return {
            minerId,
            status: 'failed',
            error: 'minFanSpeed and maxFanSpeed are required for auto mode',
          };
        }
        safetyCheck = validateFanSpeedRange(minFanSpeed, maxFanSpeed, false);
      }

      if (!safetyCheck.valid) {
        return {
          minerId,
          status: 'failed',
          error: safetyCheck.error,
        };
      }
      if (safetyCheck.warning) {
        logger.warn('Safety warning for fan control', {
          minerId,
          warning: safetyCheck.warning,
        });
      }
    }

    // Check if miner exists
    const registration = (await context.minerService.getRegisteredMiners()).find((m) => m.id === minerId);

    if (!registration) {
      return {
        minerId,
        status: 'failed',
        error: `Miner ${minerId} not found in registry`,
      };
    }

    // Get current miner status
    const status = await context.minerService.getMinerStatus(minerId);

    if (!status.online) {
      return {
        minerId,
        status: 'failed',
        error: `Miner ${minerId} is offline`,
      };
    }

    // Configure fan control via Braiins OS gRPC API
    // Create gRPC client with miner connection details
    const grpcClient = await createGrpcClient({
      defaultHost: registration.host,
      defaultPort: registration.port ?? 50051,
      useTls: false,
      timeout: GRPC_CONFIG.DEFAULT_TIMEOUT_MS,
    });

    try {
      // Prepare cooling mode configuration
      const coolingConfig: CoolingModeConfig = {
        mode,
        ...(mode === 'manual' && fanSpeed !== undefined ? { fanSpeed } : {}),
        ...(mode === 'auto' && minFanSpeed !== undefined ? { minFanSpeed } : {}),
        ...(mode === 'auto' && maxFanSpeed !== undefined ? { maxFanSpeed } : {}),
      };

      // Call setCoolingMode on the gRPC client
      await grpcClient.setCoolingMode(
        { host: registration.host, port: registration.port ?? 50051 },
        registration.password ?? '',
        coolingConfig
      );

      logger.info('Fan control configured successfully', {
        minerId,
        mode,
        fanSpeed,
        minFanSpeed,
        maxFanSpeed,
      });
    } catch (error) {
      logger.error('Failed to configure fan control', {
        minerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        minerId,
        status: 'failed',
        error: `API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    } finally {
      // Always close gRPC client
      await grpcClient.close();
    }

    // Invalidate miner status cache after configuration
    await context.minerService.refreshMinerStatus(minerId);

    // Prepare result with warning if applicable
    const result: MinerConfigResult = {
      minerId,
      status: 'success',
    };

    if (validate) {
      let safetyCheck;

      if (mode === 'manual' && fanSpeed !== undefined) {
        safetyCheck = validateFanSpeed(fanSpeed, false);
      } else if (mode === 'auto' && minFanSpeed !== undefined && maxFanSpeed !== undefined) {
        safetyCheck = validateFanSpeedRange(minFanSpeed, maxFanSpeed, false);
      }

      if (safetyCheck?.warning) {
        result.warning = safetyCheck.warning;
      }
    }

    return result;
  } catch (error) {
    logger.error('Fan control configuration failed', {
      minerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      minerId,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Configure Fan Control Tool Definition.
 */
export const configureFanControlTool: MCPToolDefinition = {
  schema: {
    name: 'configure_fan_control',
    description:
      'Configure fan speed and mode (auto or manual) for Braiins OS miners. Includes safety validation to prevent overheating (minimum 30% fan speed). Real-time application, no background job needed.',
    inputSchema: {
      type: 'object',
      properties: {
        minerIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of miner IDs to configure (max 100)',
          minItems: 1,
          maxItems: 100,
        },
        mode: {
          type: 'string',
          enum: ['auto', 'manual'],
          description: 'Fan control mode: auto (adaptive based on temperature) or manual (fixed percentage)',
        },
        fanSpeed: {
          type: 'number',
          description: 'Fan speed percentage (0-100) for manual mode. Minimum 30% for safety.',
          minimum: 0,
          maximum: 100,
        },
        minFanSpeed: {
          type: 'number',
          description: 'Minimum fan speed (0-100) for auto mode. Minimum 30% for safety.',
          minimum: 0,
          maximum: 100,
        },
        maxFanSpeed: {
          type: 'number',
          description: 'Maximum fan speed (0-100) for auto mode',
          minimum: 0,
          maximum: 100,
        },
        validate: {
          type: 'boolean',
          description: 'Enable safety validation (default: true)',
          default: true,
        },
        detailLevel: {
          type: 'string',
          enum: ['concise', 'verbose'],
          description: 'Output detail level (default: concise)',
          default: 'concise',
        },
      },
      required: ['minerIds', 'mode'],
    },
  },

  handler: async (args: ToolArguments, context: ToolContext) => {
    try {
      const validated = ConfigureFanControlArgsSchema.parse(args);

      // Process all miners
      const results = await Promise.all(
        validated.minerIds.map((minerId) =>
          configureSingleMiner(minerId, validated.mode, validated.fanSpeed, validated.minFanSpeed, validated.maxFanSpeed, validated.validate, context)
        )
      );

      // Count successes and failures
      const successCount = results.filter((r) => r.status === 'success').length;
      const failedCount = results.filter((r) => r.status === 'failed').length;

      // Collect warnings
      const warnings = results.filter((r) => r.warning).map((r) => `${r.minerId}: ${r.warning}`);

      // Verbose response includes individual results
      if (validated.detailLevel === 'verbose') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  summary: {
                    total: validated.minerIds.length,
                    successful: successCount,
                    failed: failedCount,
                  },
                  warnings,
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Concise response (default)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              successfulMiners: successCount,
              failedMiners: failedCount,
              warnings,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Configure fan control tool failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to configure fan control',
              suggestions: [
                'Verify miner IDs are correct using list_miners',
                'For manual mode, ensure fanSpeed is provided',
                'For auto mode, ensure minFanSpeed ≤ maxFanSpeed',
                'Fan speeds must be at least 30% for safety',
              ],
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
