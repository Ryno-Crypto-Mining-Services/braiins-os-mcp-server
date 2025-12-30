/**
 * Configure Autotuning Tool
 *
 * Configures autotuning mode (power optimization, hashrate maximization, or efficiency balance)
 * for one or more Braiins OS miners with batch operation support.
 *
 * Autotuning modes:
 * - power: Optimize for minimum power consumption while maintaining acceptable hashrate
 * - hashrate: Maximize hashrate output regardless of power consumption
 * - efficiency: Balance between power efficiency and hashrate performance
 *
 * @module mcp/tools/configure-autotuning
 */

import { z } from 'zod';
import { createChildLogger } from '../../utils/logger';
import type { MCPToolDefinition, ToolArguments, ToolContext } from './types';

const logger = createChildLogger({ module: 'configure-autotuning' });

/**
 * Autotuning mode schema.
 */
const AutotuningModeSchema = z.enum(['power', 'hashrate', 'efficiency'], {
  errorMap: () => ({ message: 'Mode must be one of: power, hashrate, efficiency' }),
});

/**
 * Miner IDs schema - supports batch operations with reasonable limits.
 */
const MinerIdsSchema = z
  .array(z.string().min(1, 'Miner ID cannot be empty'))
  .min(1, 'At least one miner ID required')
  .max(100, 'Maximum 100 miners per batch');

/**
 * Input schema for configure autotuning tool.
 */
const ConfigureAutotuningArgsSchema = z.object({
  minerIds: MinerIdsSchema,
  mode: AutotuningModeSchema,
  targetPower: z
    .number()
    .positive('Target power must be a positive number')
    .optional()
    .describe('Target power consumption in watts (required for power mode)'),
  targetHashrate: z
    .number()
    .positive('Target hashrate must be a positive number')
    .optional()
    .describe('Target hashrate in TH/s (required for hashrate mode)'),
  validate: z.boolean().optional().default(true).describe('Validate mode compatibility with miner model'),
});

/**
 * Validates input based on mode requirements.
 */
function validateModeParameters(args: z.infer<typeof ConfigureAutotuningArgsSchema>): void {
  if (args.mode === 'power' && !args.targetPower) {
    throw new Error('targetPower is required when mode is "power"');
  }
  if (args.mode === 'hashrate' && !args.targetHashrate) {
    throw new Error('targetHashrate is required when mode is "hashrate"');
  }
  // Efficiency mode calculates balanced targets automatically, so no specific target required
}

/**
 * Individual miner configuration result.
 */
interface MinerConfigResult {
  minerId: string;
  status: 'completed' | 'failed';
  error?: string;
  appliedMode?: string;
  appliedTarget?: number;
}

/**
 * Calculates efficiency mode target (balanced between power and hashrate).
 * This is a simplified heuristic - production would use miner-specific curves.
 *
 * @returns Balanced power target in watts
 */
function calculateEfficiencyTarget(): number {
  // Default to 80% of typical rated power (3000W for Antminer S19) as efficiency sweet spot
  // In production, would fetch actual miner specifications from model database
  const defaultRatedPower = 3000;
  return Math.round(defaultRatedPower * 0.8);
}

/**
 * Configures autotuning for a single miner.
 *
 * @param minerId - Miner ID to configure
 * @param mode - Autotuning mode
 * @param targetPower - Target power (for power mode)
 * @param targetHashrate - Target hashrate (for hashrate mode)
 * @param validate - Whether to validate miner compatibility
 * @param context - Tool context with services
 * @returns Configuration result
 */
async function configureSingleMiner(
  minerId: string,
  mode: 'power' | 'hashrate' | 'efficiency',
  targetPower: number | undefined,
  targetHashrate: number | undefined,
  validate: boolean,
  context: ToolContext
): Promise<MinerConfigResult> {
  try {
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

    // Validate mode compatibility if requested
    if (validate && status.info) {
      // Check if miner supports autotuning (BOS+ feature)
      const bosVersion = status.info.bos_version?.current;
      if (!bosVersion) {
        return {
          minerId,
          status: 'failed',
          error: `Cannot determine BOS version for miner ${minerId}`,
        };
      }

      // Basic validation: BOS+ supports autotuning in v1.0.0+
      // In production, would check specific model capabilities
      logger.debug('Miner validated for autotuning', {
        minerId,
        bosVersion,
        model: status.info.miner_identity?.model,
      });
    }

    // Apply the appropriate configuration based on mode
    const appliedMode = mode;
    let appliedTarget: number | undefined;

    switch (mode) {
      case 'power': {
        // Set power target mode
        if (!targetPower) {
          throw new Error('targetPower is required for power mode');
        }

        await context.minerService.setPowerTarget(minerId, { watt: targetPower });
        appliedTarget = targetPower;
        logger.info('Power target mode configured', { minerId, targetPower });
        break;
      }

      case 'hashrate': {
        // Set hashrate target mode
        if (!targetHashrate) {
          throw new Error('targetHashrate is required for hashrate mode');
        }

        await context.minerService.setHashrateTarget(minerId, {
          terahash_per_second: targetHashrate,
        });
        appliedTarget = targetHashrate;
        logger.info('Hashrate target mode configured', { minerId, targetHashrate });
        break;
      }

      case 'efficiency': {
        // Calculate and set balanced power target (efficiency mode)
        const efficiencyTarget = calculateEfficiencyTarget();

        await context.minerService.setPowerTarget(minerId, { watt: efficiencyTarget });
        appliedTarget = efficiencyTarget;
        // Keep appliedMode as 'efficiency' to match the type
        logger.info('Efficiency mode configured', {
          minerId,
          calculatedPowerTarget: efficiencyTarget,
        });
        break;
      }
    }

    return {
      minerId,
      status: 'completed',
      appliedMode,
      appliedTarget,
    };
  } catch (error) {
    logger.error('Autotuning configuration failed for miner', {
      minerId,
      mode,
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
 * Processes autotuning configuration job in background.
 *
 * @param jobId - Job ID to process
 * @param context - Tool context
 * @param validated - Validated input parameters
 */
async function processAutotuningConfiguration(
  jobId: string,
  context: ToolContext,
  validated: z.infer<typeof ConfigureAutotuningArgsSchema>
): Promise<void> {
  let completedCount = 0;
  let failedCount = 0;

  // Process miners sequentially for reliability
  for (const minerId of validated.minerIds) {
    const result = await configureSingleMiner(
      minerId,
      validated.mode,
      validated.targetPower,
      validated.targetHashrate,
      validated.validate,
      context
    );

    if (result.status === 'completed') {
      completedCount++;
      await context.jobService.updateProgress(jobId, completedCount, failedCount);
    } else {
      failedCount++;
      await context.jobService.updateProgress(jobId, completedCount, failedCount);
      await context.jobService.addError(jobId, {
        minerId,
        error: result.error ?? 'Unknown error',
        suggestion: 'Verify miner is online and supports autotuning. Check BOS+ version.',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Complete the job
  await context.jobService.completeJob(jobId);

  logger.info('Autotuning configuration job completed', {
    jobId,
    total: validated.minerIds.length,
    completed: completedCount,
    failed: failedCount,
  });
}

/**
 * Estimates job duration based on number of miners.
 *
 * @param minerCount - Number of miners to configure
 * @returns Estimated duration in seconds
 */
function estimateDuration(minerCount: number): number {
  // Estimate ~5 seconds per miner for configuration to stabilize
  return minerCount * 5;
}

/**
 * Configure Autotuning Tool Definition.
 */
export const configureAutotuningTool: MCPToolDefinition = {
  schema: {
    name: 'configure_autotuning',
    description:
      'Configure autotuning mode for one or more Braiins OS miners. Supports power optimization, hashrate maximization, or efficiency balance. Returns job ID for async progress tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        minerIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of miner IDs to configure (1-100 miners)',
          minItems: 1,
          maxItems: 100,
        },
        mode: {
          type: 'string',
          enum: ['power', 'hashrate', 'efficiency'],
          description:
            'Autotuning mode: "power" (optimize for minimum power), "hashrate" (maximize hashrate), or "efficiency" (balanced)',
        },
        targetPower: {
          type: 'number',
          description: 'Target power consumption in watts (required for power mode)',
        },
        targetHashrate: {
          type: 'number',
          description: 'Target hashrate in TH/s (required for hashrate mode)',
        },
        validate: {
          type: 'boolean',
          description: 'Validate mode compatibility with miner model (default: true)',
          default: true,
        },
      },
      required: ['minerIds', 'mode'],
    },
  },

  handler: async (args: ToolArguments, context: ToolContext) => {
    try {
      const validated = ConfigureAutotuningArgsSchema.parse(args);

      // Validate mode-specific parameters
      validateModeParameters(validated);

      // Create job using JobService
      const job = await context.jobService.createJob('configure_autotuning', validated.minerIds.length, {
        mode: validated.mode,
        targetPower: validated.targetPower,
        targetHashrate: validated.targetHashrate,
        minerIds: validated.minerIds,
      });

      // Start background processing
      processAutotuningConfiguration(job.jobId, context, validated).catch(async (error) => {
        logger.error('Job processing failed', {
          jobId: job.jobId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        await context.jobService.failJob(job.jobId, error instanceof Error ? error.message : 'Unknown error');
      });

      // Return job status
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              jobId: job.jobId,
              status: job.status,
              applied: job.progress.completed,
              failed: job.progress.failed,
              estimatedDuration: estimateDuration(validated.minerIds.length),
              message: `Autotuning configuration started for ${validated.minerIds.length} miner(s) in ${validated.mode} mode. Use check_job_status to monitor progress.`,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Configure autotuning tool failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to configure autotuning',
              suggestions: [
                'Verify miner IDs are correct using list_miners',
                'Ensure mode is one of: power, hashrate, efficiency',
                'Provide targetPower (watts) for power mode',
                'Provide targetHashrate (TH/s) for hashrate mode',
                'Ensure miners are online with get_fleet_status',
              ],
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
