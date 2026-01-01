/**
 * Run Performance Baseline Tool
 *
 * Run diagnostic performance test on a Braiins OS miner to measure optimal
 * hashrate, power, and efficiency across different power modes.
 *
 * @module mcp/tools/run-performance-baseline
 */

import { z } from 'zod';
import { createGrpcClient } from '../../api/grpc/client';
import { GRPC_CONFIG } from '../../config/constants';
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
 * Collect performance metrics for a power mode using real Braiins OS API.
 */
async function collectModeMetrics(
  minerId: string,
  mode: string,
  duration: number,
  context: ToolContext,
  registration: { host: string; port?: number; password?: string }
): Promise<ModeResult> {
  const sampleInterval = 30; // Sample every 30 seconds
  const samples = Math.floor(duration / sampleInterval);

  // Power targets for each mode (watts)
  const powerTargets: Record<string, number> = {
    low: 2500,
    medium: 3000,
    high: 3500,
  };

  const powerTarget = powerTargets[mode] ?? 3000;

  logger.info('Collecting metrics for power mode', {
    minerId,
    mode,
    duration,
    samples,
    powerTarget,
  });

  try {
    // Create gRPC client
    const grpcClient = await createGrpcClient({
      defaultHost: registration.host,
      defaultPort: registration.port ?? 50051,
      useTls: false,
      timeout: GRPC_CONFIG.DEFAULT_TIMEOUT_MS,
    });

    try {
      // Set power target for this mode via Braiins OS gRPC API
      await grpcClient.setPowerTarget(
        { host: registration.host, port: registration.port ?? 50051 },
        registration.password ?? '',
        powerTarget
      );

      logger.info('Power target set for baseline test', {
        minerId,
        mode,
        powerWatts: powerTarget,
      });

      // Collect samples over the duration
      const metricsData: Array<{ hashrate: number; power: number; temperature: number }> = [];

      for (let i = 0; i < samples; i++) {
        // Wait for sample interval
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), sampleInterval * 1000);
        });

        // Get current miner status
        const status = await context.minerService.getMinerStatus(minerId);

        // Extract actual metrics from MinerStatusSummary nested structures
        // Hashrate: sum of all hashboards' hashrate
        let hashrate = 0;
        if (status.hashboards?.hashboards) {
          for (const board of status.hashboards.hashboards) {
            if (board.stats?.hashrate?.terahash_per_second) {
              hashrate += board.stats.hashrate.terahash_per_second;
            } else if (board.stats?.hashrate?.gigahash_per_second) {
              hashrate += board.stats.hashrate.gigahash_per_second / 1000; // Convert GH/s to TH/s
            }
          }
        }

        // Temperature: max temperature across all hashboards
        let temperature = 0;
        if (status.hashboards?.hashboards) {
          for (const board of status.hashboards.hashboards) {
            if (board.highest_chip_temp?.celsius) {
              temperature = Math.max(temperature, board.highest_chip_temp.celsius);
            }
          }
        }

        // Power: from tuner state (falls back to set power target if not available)
        let power = powerTarget; // Default to configured target
        if (status.tunerState?.mode_state?.powertargetmodestate?.current_target?.watt) {
          power = status.tunerState.mode_state.powertargetmodestate.current_target.watt;
        }

        metricsData.push({
          hashrate,
          power,
          temperature,
        });

        logger.debug('Collected sample', {
          minerId,
          mode,
          sample: i + 1,
          hashrate,
          power,
          temperature,
          online: status.online,
        });
      }

      // Calculate averages
      const avgHashrate = metricsData.reduce((sum, m) => sum + m.hashrate, 0) / metricsData.length;
      const avgPower = metricsData.reduce((sum, m) => sum + m.power, 0) / metricsData.length;
      const avgTemp = metricsData.reduce((sum, m) => sum + m.temperature, 0) / metricsData.length;
      const efficiency = avgPower / avgHashrate; // J/TH (Watts per Terahash)

      return {
        mode,
        samples: metricsData.length,
        metrics: {
          hashrate: avgHashrate,
          power: avgPower,
          efficiency,
          temperature: avgTemp,
        },
      };
    } finally {
      await grpcClient.close();
    }
  } catch (error) {
    logger.error('Failed to collect metrics for power mode', {
      minerId,
      mode,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
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
    // Get miner registration for gRPC connection
    const registration = (await context.minerService.getRegisteredMiners()).find((m) => m.id === validated.minerId);
    if (!registration) {
      throw new Error(`Miner ${validated.minerId} not found in registry`);
    }

    // Get current power mode (simulated)
    const currentMode = 'medium'; // TODO: Get actual current mode from miner via getTunerState()

    // Test each power mode
    let modeIndex = 0;
    for (const mode of validated.modes) {
      // Update progress
      await context.jobService.updateProgress(jobId, modeIndex, 0);

      // Collect metrics for this mode
      const result = await collectModeMetrics(validated.minerId, mode, validated.duration, context, registration);
      modeResults.push(result);

      modeIndex++;
    }

    // Generate recommendations
    const recommendations = generateRecommendations(modeResults, currentMode);

    // Find optimal mode
    const optimalMode = modeResults.reduce((best, current) => (current.metrics.efficiency < best.metrics.efficiency ? current : best));

    // Prepare results for storage
    const results = {
      baseline: optimalMode.metrics,
      recommendations,
      detailedMetrics: modeResults,
      optimalMode: optimalMode.mode,
    };

    // Store results in job for retrieval via check_baseline_job_status
    await context.jobService.setResults(jobId, results);

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
        const response: Record<string, unknown> = {
          success: true,
          jobId: job.jobId,
          status: job.status,
          progress: job.progress,
        };

        // Include results if job is completed
        if (job.status === 'completed' && job.results) {
          response.results = job.results;
        }

        // Include errors if job has failed
        if (job.status === 'failed' && job.errors.length > 0) {
          response.errors = job.errors;
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response),
            },
          ],
        };
      }

      // Verbose response with full job details (including results)
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
