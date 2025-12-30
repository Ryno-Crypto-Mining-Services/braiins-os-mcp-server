/**
 * Run Performance Baseline Tool
 *
 * Run diagnostic performance test on a Braiins OS miner to measure optimal
 * hashrate, power, and efficiency across different power modes.
 *
 * @module mcp/tools/run-performance-baseline
 */

import { z } from 'zod';
import { createChildLogger } from '../../utils/logger';
import type { MCPToolDefinition, ToolArguments, ToolContext } from './types';

const logger = createChildLogger({ module: 'run-performance-baseline' });

/**
 * Power mode schema
 */
const PowerModeSchema = z.enum(['low', 'medium', 'high'], {
  errorMap: () => ({
    message: 'Power mode must be one of: low, medium, high',
  }),
});

/**
 * Input schema for run performance baseline tool
 */
const RunPerformanceBaselineArgsSchema = z
  .object({
    minerId: z.string().min(1).describe('Single miner ID to test'),
    duration: z.number().int().min(60).max(3600).optional().default(300).describe('Test duration per mode in seconds (60-3600)'),
    modes: z.array(PowerModeSchema).optional().default(['low', 'medium', 'high']).describe('Power modes to test'),
    collectMetrics: z.boolean().optional().default(true).describe('Collect detailed performance metrics'),
    detailLevel: z.enum(['concise', 'verbose']).optional().default('concise').describe('Output detail level'),
  })
  .strict();

/**
 * Baseline metrics for a single power mode
 */
interface BaselineMetrics {
  hashrate: number; // TH/s
  power: number; // Watts
  efficiency: number; // J/TH
  temperature: number; // Celsius
}

/**
 * Mode test result
 */
interface ModeResult {
  mode: string;
  samples: number;
  metrics: BaselineMetrics;
}

/**
 * Simulate collecting metrics for a power mode.
 * In production, this would call actual Braiins OS APIs.
 */
async function collectModeMetrics(minerId: string, mode: string, duration: number): Promise<ModeResult> {
  // TODO: Implement actual metrics collection via Braiins API
  // For now, simulate with reasonable values
  const samples = Math.floor(duration / 30); // One sample every 30 seconds

  // Simulate different performance characteristics per mode
  const basePower = mode === 'low' ? 2500 : mode === 'medium' ? 3000 : 3500;
  const baseHashrate = mode === 'low' ? 85 : mode === 'medium' ? 95 : 100;
  const baseTemp = mode === 'low' ? 60 : mode === 'medium' ? 68 : 75;

  logger.info('Collecting metrics for power mode', {
    minerId,
    mode,
    duration,
    samples,
  });

  return {
    mode,
    samples,
    metrics: {
      hashrate: baseHashrate,
      power: basePower,
      efficiency: (basePower / baseHashrate) * 1000, // J/TH
      temperature: baseTemp,
    },
  };
}

/**
 * Generate optimization recommendations based on test results
 */
function generateRecommendations(modeResults: ModeResult[], currentMode: string): string[] {
  const recommendations: string[] = [];

  // Find optimal mode (lowest efficiency = best)
  const optimalMode = modeResults.reduce((best, current) => (current.metrics.efficiency < best.metrics.efficiency ? current : best));

  // Efficiency recommendation
  if (optimalMode.mode !== currentMode) {
    recommendations.push(
      `Switch to ${optimalMode.mode} power mode for optimal efficiency (${optimalMode.metrics.efficiency.toFixed(1)} J/TH)`
    );
  } else {
    recommendations.push(`Current ${currentMode} power mode is optimal (${optimalMode.metrics.efficiency.toFixed(1)} J/TH)`);
  }

  // Temperature recommendation
  const avgTemp = optimalMode.metrics.temperature;
  if (avgTemp > 80) {
    recommendations.push(`Temperature is high (${avgTemp}°C). Consider improving cooling or reducing power limit.`);
  } else if (avgTemp > 70) {
    recommendations.push(`Temperature is moderate (${avgTemp}°C). Monitor cooling system.`);
  } else {
    recommendations.push(`Temperature is within safe range (${avgTemp}°C).`);
  }

  // Efficiency comparison
  const efficiencies = modeResults.map((r) => r.metrics.efficiency);
  const bestEfficiency = Math.min(...efficiencies);
  const worstEfficiency = Math.max(...efficiencies);
  const efficiencyGap = ((worstEfficiency - bestEfficiency) / bestEfficiency) * 100;

  if (efficiencyGap > 20) {
    recommendations.push(`Significant efficiency gain available (${efficiencyGap.toFixed(0)}%) by optimizing power mode.`);
  }

  return recommendations;
}

/**
 * Process performance baseline test in background
 */
async function processBaselineTest(
  jobId: string,
  context: ToolContext,
  validated: z.infer<typeof RunPerformanceBaselineArgsSchema>
): Promise<void> {
  const modeResults: ModeResult[] = [];

  try {
    // Get current power mode (simulated)
    const currentMode = 'medium'; // TODO: Get actual current mode from miner

    // Test each power mode
    let modeIndex = 0;
    for (const mode of validated.modes) {
      // Update progress
      await context.jobService.updateProgress(jobId, modeIndex, 0);

      // Collect metrics for this mode
      const result = await collectModeMetrics(validated.minerId, mode, validated.duration);
      modeResults.push(result);

      modeIndex++;
    }

    // Generate recommendations
    const recommendations = generateRecommendations(modeResults, currentMode);

    // Find optimal mode
    const optimalMode = modeResults.reduce((best, current) => (current.metrics.efficiency < best.metrics.efficiency ? current : best));

    // Prepare results for logging
    const results = {
      baseline: optimalMode.metrics,
      recommendations,
      detailedMetrics: modeResults,
    };

    // TODO: Store results in Redis or database for retrieval via check_baseline_job_status
    // For now, results are only logged and not persisted beyond the job completion

    // Complete the job
    await context.jobService.completeJob(jobId);

    logger.info('Performance baseline test completed', {
      jobId,
      minerId: validated.minerId,
      modesTest: validated.modes.length,
      optimalMode: optimalMode.mode,
      baseline: results.baseline,
      recommendations: results.recommendations,
    });
  } catch (error) {
    logger.error('Performance baseline test failed', {
      jobId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    await context.jobService.failJob(jobId, error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Run Performance Baseline Tool Definition
 */
export const runPerformanceBaselineTool: MCPToolDefinition = {
  schema: {
    name: 'run_performance_baseline',
    description:
      'Run diagnostic performance test on a Braiins OS miner to measure optimal hashrate, power, and efficiency. Tests different power modes and generates optimization recommendations. Long-running operation (5-15 minutes) with job tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        minerId: {
          type: 'string',
          description: 'Single miner ID to test',
        },
        duration: {
          type: 'number',
          description: 'Test duration per power mode in seconds (60-3600, default: 300)',
          minimum: 60,
          maximum: 3600,
          default: 300,
        },
        modes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
          },
          description: 'Power modes to test (default: all modes)',
          default: ['low', 'medium', 'high'],
        },
        collectMetrics: {
          type: 'boolean',
          description: 'Collect detailed performance metrics (default: true)',
          default: true,
        },
        detailLevel: {
          type: 'string',
          enum: ['concise', 'verbose'],
          description: 'Output detail level (default: concise)',
          default: 'concise',
        },
      },
      required: ['minerId'],
    },
  },

  handler: async (args: ToolArguments, context: ToolContext) => {
    try {
      const validated = RunPerformanceBaselineArgsSchema.parse(args);

      // Verify miner exists and is online
      const registration = (await context.minerService.getRegisteredMiners()).find((m) => m.id === validated.minerId);

      if (!registration) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Miner ${validated.minerId} not found in registry`,
                suggestion: 'Use list_miners to see available miners',
              }),
            },
          ],
          isError: true,
        };
      }

      const status = await context.minerService.getMinerStatus(validated.minerId);

      if (!status.online) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Miner ${validated.minerId} is offline`,
                suggestion: 'Ensure miner is powered on and reachable',
              }),
            },
          ],
          isError: true,
        };
      }

      // Calculate estimated duration
      const estimatedDuration = validated.duration * validated.modes.length;

      // Create background job
      const job = await context.jobService.createJob('performance_baseline', validated.modes.length, {
        minerId: validated.minerId,
        duration: validated.duration,
        modes: validated.modes,
        collectMetrics: validated.collectMetrics,
      });

      // Start background processing
      processBaselineTest(job.jobId, context, validated).catch((error) => {
        logger.error('Baseline test processing failed', {
          jobId: job.jobId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

      // Verbose response
      if (validated.detailLevel === 'verbose') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  jobId: job.jobId,
                  status: job.status,
                  progress: job.progress,
                  estimatedDuration: `${estimatedDuration} seconds`,
                  modes: validated.modes,
                  message: `Performance baseline test started for miner ${validated.minerId}. Use check_baseline_job_status to monitor progress.`,
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
              jobId: job.jobId,
              status: job.status,
              estimatedDuration: `${estimatedDuration}s`,
              message: `Baseline test started. Poll with check_baseline_job_status.`,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Run performance baseline tool failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to start baseline test',
              suggestions: [
                'Verify miner ID is correct using list_miners',
                'Ensure miner is online with get_miner_status',
                'Check duration is between 60-3600 seconds',
                'Verify modes are valid: low, medium, high',
              ],
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Check Baseline Job Status Tool Definition
 */
export const checkBaselineJobStatusTool: MCPToolDefinition = {
  schema: {
    name: 'check_baseline_job_status',
    description: 'Check the status of a performance baseline test job by job ID',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'Job ID returned from run_performance_baseline',
        },
        detailLevel: {
          type: 'string',
          enum: ['concise', 'verbose'],
          description: 'Output detail level (default: concise)',
          default: 'concise',
        },
      },
      required: ['jobId'],
    },
  },

  handler: async (args: ToolArguments, context: ToolContext) => {
    try {
      const { jobId, detailLevel = 'concise' } = args as { jobId: string; detailLevel?: 'concise' | 'verbose' };

      const job = await context.jobService.getJob(jobId);

      if (!job) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Job ${jobId} not found`,
                suggestion: 'Verify the job ID is correct',
              }),
            },
          ],
          isError: true,
        };
      }

      // Concise response
      if (detailLevel === 'concise') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                jobId: job.jobId,
                status: job.status,
                progress: job.progress,
              }),
            },
          ],
        };
      }

      // Verbose response with full job details
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                ...job,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to check job status',
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
