/**
 * Workflow Simulation Tests for Performance Baseline Tool
 *
 * NOTE: These are workflow simulation tests, not true integration tests.
 * They validate the tool interface and workflow logic but do NOT test:
 * - Real background processing (processBaselineTest function)
 * - Real metric extraction from MinerStatusSummary structures
 * - Real gRPC client integration
 * - Error propagation from background processor
 *
 * TODO: Create true integration tests that:
 * 1. Test real processBaselineTest execution
 * 2. Validate metric extraction with realistic MinerStatusSummary data
 * 3. Test error handling in background processing
 * 4. Use patterns from error-scenarios.test.ts (real services + boundary mocking)
 *
 * Tests the workflow of running a performance baseline test including:
 * - Job creation and tracking
 * - Status checking
 * - Results retrieval
 * - Workflow state transitions
 */

import { checkBaselineJobStatusTool, runPerformanceBaselineTool } from '../../../../src/mcp/tools/run-performance-baseline';
import type { ToolContext } from '../../../../src/mcp/tools/types';
import type { Job, JobService } from '../../../../src/services/job.service';
import type { MinerService } from '../../../../src/services/miner.service';
import { getTextFromResult } from '../../../unit/helpers/tool-test-utils';

describe('Performance Baseline Integration Tests', () => {
  let context: ToolContext;
  let jobStore: Map<string, Job>;
  let jobCounter: number;

  beforeEach(() => {
    // Shared job store for integration testing
    jobStore = new Map<string, Job>();
    jobCounter = 0;

    // Mock job service with persistent storage
    const mockJobService: Partial<JobService> = {
      createJob: jest.fn().mockImplementation(async (type: string, total: number, metadata?: Record<string, unknown>) => {
        jobCounter++;
        const job: Job = {
          jobId: `baseline-${Date.now()}-${jobCounter}`,
          type,
          status: 'pending',
          progress: { total, completed: 0, failed: 0, percentage: 0 },
          startedAt: new Date().toISOString(),
          errors: [],
          metadata,
        };
        jobStore.set(job.jobId, job);
        return job;
      }),

      getJob: jest.fn().mockImplementation(async (jobId: string) => {
        return jobStore.get(jobId) ?? null;
      }),

      updateProgress: jest.fn().mockImplementation(async (jobId: string, completed: number, failed: number) => {
        const job = jobStore.get(jobId);
        if (job) {
          job.progress.completed = completed;
          job.progress.failed = failed;
          job.progress.percentage = Math.round((completed / job.progress.total) * 100);
        }
      }),

      completeJob: jest.fn().mockImplementation(async (jobId: string) => {
        const job = jobStore.get(jobId);
        if (job) {
          job.status = 'completed';
          job.completedAt = new Date().toISOString();
        }
      }),

      failJob: jest.fn().mockImplementation(async (jobId: string, error: string) => {
        const job = jobStore.get(jobId);
        if (job) {
          job.status = 'failed';
          job.completedAt = new Date().toISOString();
          job.errors.push({
            error,
            suggestion: 'Check miner connectivity and try again',
            timestamp: new Date().toISOString(),
          });
        }
      }),

      setResults: jest.fn().mockImplementation(async (jobId: string, results: Record<string, unknown>) => {
        const job = jobStore.get(jobId);
        if (job) {
          job.results = results;
        }
      }),
    };

    // Mock miner service
    const mockMinerService: Partial<MinerService> = {
      getRegisteredMiners: jest.fn().mockResolvedValue([
        { id: 'miner-1', name: 'Test Miner', host: '192.168.1.100', port: 50051 },
      ]),

      getMinerStatus: jest.fn().mockResolvedValue({
        id: 'miner-1',
        name: 'Test Miner',
        online: true,
        hashboards: {
          hashboards: [
            {
              id: 'board1',
              enabled: true,
              stats: {
                hashrate: {
                  terahash_per_second: 95.5,
                },
              },
              highest_chip_temp: {
                celsius: 65,
              },
            },
          ],
        },
        tunerState: {
          mode_state: {
            powertargetmodestate: {
              current_target: {
                watt: 3000,
              },
            },
          },
        },
      }),
    };

    context = {
      jobService: mockJobService as JobService,
      minerService: mockMinerService as MinerService,
    } as ToolContext;
  });

  describe('Full baseline workflow', () => {
    it('should complete full baseline test workflow', async () => {
      // Step 1: Start baseline test
      const startResult = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 60, // Short duration for testing
          modes: ['low', 'high'], // Test 2 modes
        },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      expect(startResponse.success).toBe(true);
      expect(startResponse.jobId).toBeDefined();
      expect(startResponse.status).toBe('pending');

      const jobId = startResponse.jobId as string;

      // Step 2: Check job status immediately (should be pending or running)
      const statusResult1 = await checkBaselineJobStatusTool.handler(
        { jobId },
        context
      );

      const statusResponse1 = JSON.parse(getTextFromResult(statusResult1));
      expect(statusResponse1.success).toBe(true);
      expect(statusResponse1.status).toMatch(/pending|running/);

      // Step 3: Simulate job progress
      await context.jobService.updateProgress(jobId, 1, 0);

      const statusResult2 = await checkBaselineJobStatusTool.handler(
        { jobId },
        context
      );

      const statusResponse2 = JSON.parse(getTextFromResult(statusResult2));
      expect(statusResponse2.success).toBe(true);
      expect(statusResponse2.progress.completed).toBe(1);
      expect(statusResponse2.progress.percentage).toBe(50); // 1 of 2 modes

      // Step 4: Simulate job completion with results
      const mockResults = {
        baseline: {
          hashrate: 95.5,
          power: 3000,
          efficiency: 31.4,
          temperature: 65,
        },
        recommendations: [
          'Switch to low power mode for optimal efficiency (30.2 J/TH)',
          'Temperature is within safe range (65°C)',
        ],
        detailedMetrics: [
          {
            mode: 'low',
            samples: 2,
            metrics: {
              hashrate: 92.0,
              power: 2500,
              efficiency: 27.2,
              temperature: 62,
            },
          },
          {
            mode: 'high',
            samples: 2,
            metrics: {
              hashrate: 98.5,
              power: 3500,
              efficiency: 35.5,
              temperature: 68,
            },
          },
        ],
        optimalMode: 'low',
      };

      await context.jobService.setResults(jobId, mockResults);
      await context.jobService.completeJob(jobId);

      // Step 5: Check final status with results
      const finalResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const finalResponse = JSON.parse(getTextFromResult(finalResult));
      expect(finalResponse.success).toBe(true);
      expect(finalResponse.status).toBe('completed');
      expect(finalResponse.results).toBeDefined();
      expect(finalResponse.results.baseline).toBeDefined();
      expect(finalResponse.results.recommendations).toHaveLength(2);
      expect(finalResponse.results.detailedMetrics).toHaveLength(2);
      expect(finalResponse.results.optimalMode).toBe('low');
    });

    it('should handle job failure gracefully', async () => {
      // Start baseline test
      const startResult = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 60,
          modes: ['medium'],
        },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      const jobId = startResponse.jobId as string;

      // Simulate job failure
      await context.jobService.failJob(jobId, 'Miner connection lost during test');

      // Check status
      const statusResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const statusResponse = JSON.parse(getTextFromResult(statusResult));
      expect(statusResponse.success).toBe(true);
      expect(statusResponse.status).toBe('failed');
      expect(statusResponse.errors).toHaveLength(1);
      expect(statusResponse.errors[0].error).toContain('connection lost');
    });
  });

  describe('Concurrent baseline tests', () => {
    it('should handle multiple concurrent baseline tests', async () => {
      // Add another miner
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const getMinersMock = context.minerService.getRegisteredMiners as jest.Mock;
      getMinersMock.mockResolvedValue([
        { id: 'miner-1', name: 'Test Miner 1', host: '192.168.1.100', port: 50051 },
        { id: 'miner-2', name: 'Test Miner 2', host: '192.168.1.101', port: 50051 },
      ]);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const getStatusMock = context.minerService.getMinerStatus as jest.Mock;
      getStatusMock.mockResolvedValue({ online: true });

      // Start two baseline tests concurrently
      const [result1, result2] = await Promise.all([
        runPerformanceBaselineTool.handler(
          { minerId: 'miner-1', modes: ['low'] },
          context
        ),
        runPerformanceBaselineTool.handler(
          { minerId: 'miner-2', modes: ['high'] },
          context
        ),
      ]);

      const response1 = JSON.parse(getTextFromResult(result1));
      const response2 = JSON.parse(getTextFromResult(result2));

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);
      expect(response1.jobId).not.toBe(response2.jobId);

      // Both jobs should be tracked independently
      const status1 = await checkBaselineJobStatusTool.handler(
        { jobId: response1.jobId },
        context
      );
      const status2 = await checkBaselineJobStatusTool.handler(
        { jobId: response2.jobId },
        context
      );

      const statusResponse1 = JSON.parse(getTextFromResult(status1));
      const statusResponse2 = JSON.parse(getTextFromResult(status2));

      expect(statusResponse1.success).toBe(true);
      expect(statusResponse2.success).toBe(true);
    });
  });

  describe('Detail level consistency', () => {
    it('should maintain detail level across workflow', async () => {
      // Start with verbose detail
      const startResult = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 60,
          modes: ['low'],
          detailLevel: 'verbose',
        },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      expect(startResponse.modes).toBeDefined(); // Verbose includes modes
      expect(startResponse.estimatedDuration).toContain('seconds'); // Verbose uses full word

      const jobId = startResponse.jobId as string;

      // Check with concise detail
      const conciseResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'concise' },
        context
      );

      const conciseResponse = JSON.parse(getTextFromResult(conciseResult));
      expect(conciseResponse.metadata).toBeUndefined(); // Concise excludes metadata

      // Check with verbose detail
      const verboseResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const verboseResponse = JSON.parse(getTextFromResult(verboseResult));
      expect(verboseResponse.metadata).toBeDefined(); // Verbose includes metadata
      expect(verboseResponse.startedAt).toBeDefined();
    });
  });

  describe('Job persistence', () => {
    it('should persist job state across queries', async () => {
      // Start baseline test
      const startResult = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 60,
          modes: ['low', 'medium', 'high'],
        },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      const jobId = startResponse.jobId as string;

      // Update progress multiple times
      await context.jobService.updateProgress(jobId, 1, 0);
      await context.jobService.updateProgress(jobId, 2, 0);
      await context.jobService.updateProgress(jobId, 3, 0);

      // Each query should reflect latest progress
      const checkAfterUpdate = await checkBaselineJobStatusTool.handler(
        { jobId },
        context
      );

      const checkResponse = JSON.parse(getTextFromResult(checkAfterUpdate));
      expect(checkResponse.progress.completed).toBe(3);
      expect(checkResponse.progress.percentage).toBe(100);
    });
  });
});
