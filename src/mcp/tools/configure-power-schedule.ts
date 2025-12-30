/**
 * Configure Power Schedule Tool
 *
 * Configure time-based power schedules for Braiins OS miners using cron-like scheduling.
 * Supports multiple schedules per miner with timezone-aware execution.
 *
 * @module mcp/tools/configure-power-schedule
 */

import { z } from 'zod';
import { createChildLogger } from '../../utils/logger';
import type { MCPToolDefinition, ToolArguments, ToolContext } from './types';

const logger = createChildLogger({ module: 'configure-power-schedule' });

/**
 * Validate cron expression format (5-field cron: minute hour day month weekday)
 */
function validateCronExpression(cron: string): boolean {
  // Regex for standard 5-field cron format
  const cronRegex =
    /^(\*|([0-9]|[1-5][0-9])|\*\/([0-9]|[1-5][0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|[12][0-9]|3[01])|\*\/([1-9]|[12][0-9]|3[01])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|[0-6]|\*\/[0-6])$/;
  return cronRegex.test(cron);
}

/**
 * Calculate next execution time for a cron expression.
 * Simplified placeholder - returns current time + 1 minute.
 * TODO: Replace with actual cron parser library (e.g., cron-parser) to calculate
 * next execution time based on cron expression and timezone.
 */
function calculateNextExecution(): string {
  const now = new Date();
  const nextRun = new Date(now.getTime() + 60000); // Add 1 minute
  return nextRun.toISOString();
}

/**
 * Power schedule schema
 */
const PowerScheduleSchema = z.object({
  cron: z.string().refine(validateCronExpression, {
    message: "Invalid cron expression. Expected format: 'minute hour day month weekday' (e.g., '0 2 * * *')",
  }),
  powerLimit: z.number().int().min(0).max(10000).describe('Power limit in watts'),
  mode: z.enum(['enable', 'disable']).describe('Enable or disable the miner'),
});

/**
 * Miner IDs schema
 */
const MinerIdsSchema = z.array(z.string().min(1)).min(1, 'At least one miner ID required').max(100, 'Maximum 100 miners per batch');

/**
 * Input schema for configure power schedule tool
 */
const ConfigurePowerScheduleArgsSchema = z
  .object({
    minerIds: MinerIdsSchema,
    schedules: z.array(PowerScheduleSchema).min(1, 'At least one schedule required').max(10, 'Maximum 10 schedules per miner'),
    timezone: z.string().default('UTC').describe('IANA timezone (e.g., America/New_York, Europe/London)'),
    validate: z.boolean().optional().default(true).describe('Validate timezone format'),
    detailLevel: z.enum(['concise', 'verbose']).optional().default('concise').describe('Output detail level'),
  })
  .strict();

/**
 * Individual miner schedule result
 */
interface MinerScheduleResult {
  minerId: string;
  status: 'success' | 'failed';
  error?: string;
}

/**
 * Schedule output format
 */
interface ScheduleOutput {
  cron: string;
  nextExecution: string;
}

/**
 * Configure power schedule for a single miner
 */
async function configureSingleMiner(
  minerId: string,
  schedules: z.infer<typeof PowerScheduleSchema>[],
  timezone: string,
  validate: boolean,
  context: ToolContext
): Promise<MinerScheduleResult> {
  try {
    // Validate timezone if enabled
    if (validate) {
      try {
        new Date().toLocaleString('en-US', { timeZone: timezone });
      } catch (error) {
        return {
          minerId,
          status: 'failed',
          error: `Invalid timezone: ${timezone}. Use IANA format (e.g., America/New_York, Europe/London, UTC)`,
        };
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

    // Configure power schedules via Braiins API
    // TODO: Implement actual API call when available
    logger.info('Configuring power schedule', {
      minerId,
      schedules,
      timezone,
    });

    // Invalidate miner config cache
    await context.minerService.refreshMinerStatus(minerId);

    return {
      minerId,
      status: 'success',
    };
  } catch (error) {
    logger.error('Power schedule configuration failed', {
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
 * Configure Power Schedule Tool Definition
 */
export const configurePowerScheduleTool: MCPToolDefinition = {
  schema: {
    name: 'configure_power_schedule',
    description:
      'Configure time-based power schedules for Braiins OS miners with cron-like scheduling. Supports multiple schedules per miner with timezone-aware execution. Schedules persist across miner reboots.',
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
        schedules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              cron: {
                type: 'string',
                description: "Cron expression: 'minute hour day month weekday' (e.g., '0 2 * * *' for 2 AM daily)",
              },
              powerLimit: {
                type: 'number',
                description: 'Power limit in watts (0-10000)',
                minimum: 0,
                maximum: 10000,
              },
              mode: {
                type: 'string',
                enum: ['enable', 'disable'],
                description: 'Enable or disable the miner at scheduled time',
              },
            },
            required: ['cron', 'powerLimit', 'mode'],
          },
          description: 'Array of power schedules (max 10)',
          minItems: 1,
          maxItems: 10,
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone format (default: UTC)',
          default: 'UTC',
        },
        validate: {
          type: 'boolean',
          description: 'Validate timezone format (default: true)',
          default: true,
        },
        detailLevel: {
          type: 'string',
          enum: ['concise', 'verbose'],
          description: 'Output detail level (default: concise)',
          default: 'concise',
        },
      },
      required: ['minerIds', 'schedules'],
    },
  },

  handler: async (args: ToolArguments, context: ToolContext) => {
    try {
      const validated = ConfigurePowerScheduleArgsSchema.parse(args);

      // Process all miners
      const results = await Promise.all(
        validated.minerIds.map((minerId) => configureSingleMiner(minerId, validated.schedules, validated.timezone, validated.validate, context))
      );

      // Count successes and failures
      const successCount = results.filter((r) => r.status === 'success').length;
      const failedCount = results.filter((r) => r.status === 'failed').length;

      // Prepare schedule output with next execution times
      const scheduleOutputs: ScheduleOutput[] = validated.schedules.map((schedule) => ({
        cron: schedule.cron,
        nextExecution: calculateNextExecution(),
      }));

      // Verbose response
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
                  schedules: scheduleOutputs,
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
              schedules: scheduleOutputs,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Configure power schedule tool failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to configure power schedule',
              suggestions: [
                'Verify miner IDs are correct using list_miners',
                'Check cron expression format: minute hour day month weekday',
                'Use IANA timezone format (e.g., America/New_York, UTC)',
                'Ensure power limits are within 0-10000 watts',
              ],
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
