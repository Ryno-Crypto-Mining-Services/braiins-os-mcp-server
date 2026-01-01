/**
 * Integration Tests for Performance Baseline Tool
 *
 * True integration tests that validate:
 * - Real background processing (processBaselineTest function)
 * - Real metric extraction from MinerStatusSummary structures
 * - Real gRPC client integration (mocked at proto boundary)
 * - Real error propagation from background processor
 *
 * Pattern: Real services + boundary mocking (follows error-scenarios.test.ts)
 */

import type { BraiinsClient } from '../../../../src/api/braiins/client';
import { createBraiinsClient } from '../../../../src/api/braiins/client';
import type { GrpcClient } from '../../../../src/api/grpc/client';
import { createGrpcClient } from '../../../../src/api/grpc/client';
import {
  checkBaselineJobStatusTool,
  runPerformanceBaselineTool,
} from '../../../../src/mcp/tools/run-performance-baseline';
import type { ToolContext } from '../../../../src/mcp/tools/types';
import type { JobService } from '../../../../src/services/job.service';
import { createJobService } from '../../../../src/services/job.service';
import type { MinerService, MinerStatusSummary } from '../../../../src/services/miner.service';
import { createMinerService } from '../../../../src/services/miner.service';
import { getTextFromResult } from '../../../unit/helpers/tool-test-utils';
import {
  createHashboard,
  createMinerStatusFixture,
  createTunerState,
  waitForJobCompletion,
} from '../../helpers/integration-test-utils';

// Mock the gRPC client module at the boundary
jest.mock('../../../../src/api/grpc/client', () => {
  const actual = jest.requireActual<typeof import('../../../../src/api/grpc/client')>('../../../../src/api/grpc/client');
  return {
    ...actual,
    createGrpcClient: jest.fn(),
  };
});

const mockCreateGrpcClient = createGrpcClient as jest.MockedFunction<typeof createGrpcClient>;

/**
 * Mock gRPC client type
 */
interface MockGrpcClient {
  setPowerTarget: jest.Mock<Promise<void>, [unknown, string, number]>;
  close: jest.Mock<Promise<void>, []>;
}

/**
 * Baseline results structure
 */
interface BaselineResults {
  baseline: {
    hashrate: number;
    power: number;
    efficiency: number;
    temperature: number;
  };
  recommendations: string[];
  detailedMetrics: Array<{
    mode: string;
    samples: number;
    metrics: {
      hashrate: number;
      power: number;
      efficiency: number;
      temperature: number;
    };
  }>;
  optimalMode: string;
}

describe('Performance Baseline Integration Tests (Real)', () => {
  let context: ToolContext;
  let jobService: JobService;
  let minerService: MinerService;
  let braiinsClient: BraiinsClient;
  let mockGrpcClient: MockGrpcClient;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create real services with in-memory storage
    jobService = createJobService(null); // null = use in-memory storage
    braiinsClient = createBraiinsClient({ defaultTimeout: 5000, maxRetries: 0 });
    minerService = createMinerService(braiinsClient, null);

    // Register test miner
    await minerService.registerMiner({
      id: 'miner-1',
      name: 'Test Miner 1',
      host: '192.168.1.100',
      port: 50051,
      username: 'root',
      password: 'test-password',
    });

    // Create mock gRPC client
    mockGrpcClient = {
      setPowerTarget: jest.fn<Promise<void>, [unknown, string, number]>().mockResolvedValue(undefined),
      close: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    };

    // Mock createGrpcClient to return our mock
    mockCreateGrpcClient.mockResolvedValue(mockGrpcClient as unknown as GrpcClient);

    // Create tool context with real services
    context = {
      jobService,
      minerService,
    } as ToolContext;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Real Background Processing', () => {
    it('should execute processBaselineTest with real metric extraction', async () => {
      // Setup: Mock getMinerStatus to return realistic data
      const lowPowerStatus = createMinerStatusFixture();
      jest.spyOn(minerService, 'getMinerStatus').mockResolvedValue(lowPowerStatus);

      // Start baseline test with VERY short duration for testing
      const startResult = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 60, // Minimum duration: 60 seconds
          modes: ['low'], // Single mode for faster test
        },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      expect(startResponse.success).toBe(true);
      expect(startResponse.jobId).toBeDefined();

      const jobId = startResponse.jobId as string;

      // Wait for background processing to complete (60s test + overhead)
      // Using longer timeout to account for actual sampling intervals
      await waitForJobCompletion(jobService, jobId, 90000);

      // Verify job completed successfully
      const finalResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const finalResponse = JSON.parse(getTextFromResult(finalResult));
      expect(finalResponse.success).toBe(true);
      expect(finalResponse.status).toBe('completed');
      expect(finalResponse.results).toBeDefined();

      // Verify metrics were extracted correctly from nested structures
      const results = finalResponse.results as BaselineResults;
      expect(results.baseline).toBeDefined();

      // Verify hashrate calculation: sum of all hashboards (32.5 + 31.8 + 33.2 = 97.5)
      expect(results.baseline.hashrate).toBeCloseTo(97.5, 1);

      // Verify temperature: max across hashboards (64)
      expect(results.baseline.temperature).toBe(64);

      // Verify power from tuner state
      expect(results.baseline.power).toBe(2500);

      // Verify efficiency calculation: (2500 / 97.5) * 1000 = 25.64 J/TH
      expect(results.baseline.efficiency).toBeCloseTo(25.6, 1);
    }, 120000); // Extended timeout for real processing

    it('should handle unit conversion from gigahash to terahash', async () => {
      // Setup: Mock status with gigahash_per_second instead of terahash_per_second
      const gigahashStatus = createMinerStatusFixture({
        hashboards: {
          hashboards: [
            {
              id: 'hashboard-0',
              board_name: 'Board 0',
              model: 'S19',
              enabled: true,
              chip_type: 'BM1398',
              chips_count: 126,
              stats: {
                accepted_shares: 1000,
                rejected_shares: 5,
                hardware_errors: 2,
                hashrate: {
                  gigahash_per_second: 32500, // 32.5 TH/s
                },
              },
              highest_chip_temp: { celsius: 62 },
            },
            {
              id: 'hashboard-1',
              board_name: 'Board 1',
              model: 'S19',
              enabled: true,
              chip_type: 'BM1398',
              chips_count: 126,
              stats: {
                accepted_shares: 980,
                rejected_shares: 8,
                hardware_errors: 1,
                hashrate: {
                  gigahash_per_second: 31800, // 31.8 TH/s
                },
              },
              highest_chip_temp: { celsius: 64 },
            },
          ],
        },
      });

      jest.spyOn(minerService, 'getMinerStatus').mockResolvedValue(gigahashStatus);

      const startResult = await runPerformanceBaselineTool.handler(
        { minerId: 'miner-1', duration: 60, modes: ['low'] },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      const jobId = startResponse.jobId as string;
      await waitForJobCompletion(jobService, jobId, 90000);

      const finalResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const finalResponse = JSON.parse(getTextFromResult(finalResult));
      const results = finalResponse.results as BaselineResults;

      // Verify conversion: (32500 + 31800) / 1000 = 64.3 TH/s
      expect(results.baseline.hashrate).toBeCloseTo(64.3, 1);
    }, 120000);

    it('should handle missing hashrate data gracefully', async () => {
      // Setup: Mock status with missing hashrate stats
      const noHashrateStatus = createMinerStatusFixture({
        hashboards: {
          hashboards: [
            {
              id: 'hashboard-0',
              board_name: 'Board 0',
              model: 'S19',
              enabled: true,
              chip_type: 'BM1398',
              chips_count: 126,
              stats: {
                accepted_shares: 1000,
                rejected_shares: 5,
                hardware_errors: 2,
                // No hashrate data
              },
              highest_chip_temp: { celsius: 62 },
            },
          ],
        },
      });

      jest.spyOn(minerService, 'getMinerStatus').mockResolvedValue(noHashrateStatus);

      const startResult = await runPerformanceBaselineTool.handler(
        { minerId: 'miner-1', duration: 60, modes: ['low'] },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      const jobId = startResponse.jobId as string;
      await waitForJobCompletion(jobService, jobId, 90000);

      const finalResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const finalResponse = JSON.parse(getTextFromResult(finalResult));
      const results = finalResponse.results as BaselineResults;

      // Hashrate should be 0 when no data available
      expect(results.baseline.hashrate).toBe(0);
    }, 120000);

    it('should fall back to power target when tuner state is missing', async () => {
      // Setup: Mock status without tuner state
      const noTunerStatus = createMinerStatusFixture({
        tunerState: undefined,
      });

      jest.spyOn(minerService, 'getMinerStatus').mockResolvedValue(noTunerStatus);

      const startResult = await runPerformanceBaselineTool.handler(
        { minerId: 'miner-1', duration: 60, modes: ['low'] },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      const jobId = startResponse.jobId as string;
      await waitForJobCompletion(jobService, jobId, 90000);

      const finalResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const finalResponse = JSON.parse(getTextFromResult(finalResult));
      const results = finalResponse.results as BaselineResults;

      // Power should fall back to mode target (low = 2500W)
      expect(results.baseline.power).toBe(2500);
    }, 120000);
  });

  describe('Error Propagation from Background Processor', () => {
    it('should capture gRPC connection errors during metric collection', async () => {
      // Setup: getMinerStatus succeeds initially, then fails
      jest
        .spyOn(minerService, 'getMinerStatus')
        .mockResolvedValueOnce(createMinerStatusFixture())
        .mockRejectedValue(new Error('gRPC connection lost'));

      const startResult = await runPerformanceBaselineTool.handler(
        { minerId: 'miner-1', duration: 60, modes: ['low'] },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      const jobId = startResponse.jobId as string;

      // Wait for job to fail
      await waitForJobCompletion(jobService, jobId, 90000);

      const statusResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const status = JSON.parse(getTextFromResult(statusResult));

      expect(status.status).toBe('failed');
      expect(status.errors).toHaveLength(1);
      expect(status.errors[0].error).toContain('gRPC connection lost');
    }, 120000);

    it('should handle setPowerTarget failures', async () => {
      // Setup: setPowerTarget fails
      mockGrpcClient.setPowerTarget.mockRejectedValue(new Error('Failed to set power target'));

      jest.spyOn(minerService, 'getMinerStatus').mockResolvedValue(createMinerStatusFixture());

      const startResult = await runPerformanceBaselineTool.handler(
        { minerId: 'miner-1', duration: 60, modes: ['low'] },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      const jobId = startResponse.jobId as string;
      await waitForJobCompletion(jobService, jobId, 90000);

      const statusResult = await checkBaselineJobStatusTool.handler({ jobId }, context);
      const status = JSON.parse(getTextFromResult(statusResult));

      expect(status.status).toBe('failed');
      expect(status.errors[0].error).toContain('Failed to set power target');
    }, 120000);
  });

  describe('Recommendation Generation Logic', () => {
    it('should recommend switching to more efficient mode', async () => {
      // Setup: Different power levels return different metrics
      const lowPowerStatus = createMinerStatusFixture({
        tunerState: createTunerState(2500),
      });

      const highPowerStatus = createMinerStatusFixture({
        hashboards: {
          hashboards: [
            createHashboard('hashboard-0', 34.0, 68),
            createHashboard('hashboard-1', 33.5, 70),
            createHashboard('hashboard-2', 34.2, 69),
          ],
        },
        tunerState: createTunerState(3500),
      });

      const getMinerStatusSpy = jest.spyOn(minerService, 'getMinerStatus');
      getMinerStatusSpy.mockResolvedValue(lowPowerStatus);

      const startResult = await runPerformanceBaselineTool.handler(
        { minerId: 'miner-1', duration: 60, modes: ['low', 'high'] },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      const jobId = startResponse.jobId as string;

      // Update mock to return high power status for second mode
      setTimeout(() => {
        getMinerStatusSpy.mockResolvedValue(highPowerStatus);
      }, 61000); // After first mode completes

      await waitForJobCompletion(jobService, jobId, 150000);

      const finalResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const finalResponse = JSON.parse(getTextFromResult(finalResult));
      const results = finalResponse.results as BaselineResults;

      // Low mode should be optimal (lower efficiency)
      expect(results.optimalMode).toBe('low');
      expect(results.recommendations).toEqual(
        expect.arrayContaining([expect.stringContaining('low power mode')])
      );
    }, 180000);

    it('should warn about high temperature', async () => {
      // Setup: Return high temperature readings
      const hotStatus = createMinerStatusFixture({
        hashboards: {
          hashboards: [
            createHashboard('hashboard-0', 32.0, 85),
            createHashboard('hashboard-1', 31.5, 87),
            createHashboard('hashboard-2', 32.2, 86),
          ],
        },
      });

      jest.spyOn(minerService, 'getMinerStatus').mockResolvedValue(hotStatus);

      const startResult = await runPerformanceBaselineTool.handler(
        { minerId: 'miner-1', duration: 60, modes: ['high'] },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      const jobId = startResponse.jobId as string;
      await waitForJobCompletion(jobService, jobId, 90000);

      const finalResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const finalResponse = JSON.parse(getTextFromResult(finalResult));
      const results = finalResponse.results as BaselineResults;

      // Should include temperature warning
      expect(results.recommendations).toEqual(
        expect.arrayContaining([expect.stringContaining('high')])
      );
    }, 120000);
  });

  describe('Multi-Mode Testing', () => {
    it('should test multiple power modes sequentially', async () => {
      const lowStatus = createMinerStatusFixture();
      const mediumStatus = createMinerStatusFixture({
        hashboards: {
          hashboards: [
            createHashboard('hashboard-0', 33.5, 65),
            createHashboard('hashboard-1', 32.8, 66),
            createHashboard('hashboard-2', 34.2, 65),
          ],
        },
        tunerState: createTunerState(3000),
      });
      const highStatus = createMinerStatusFixture({
        hashboards: {
          hashboards: [
            createHashboard('hashboard-0', 34.5, 68),
            createHashboard('hashboard-1', 33.8, 69),
            createHashboard('hashboard-2', 35.2, 68),
          ],
        },
        tunerState: createTunerState(3500),
      });

      const getMinerStatusSpy = jest.spyOn(minerService, 'getMinerStatus');
      let callCount = 0;

      // Return different status based on which mode is being tested
      getMinerStatusSpy.mockImplementation(async (): Promise<MinerStatusSummary> => {
        callCount++;
        if (callCount <= 2) {
          return lowStatus;
        } // First mode samples
        if (callCount <= 4) {
          return mediumStatus;
        } // Second mode samples
        return highStatus; // Third mode samples
      });

      const startResult = await runPerformanceBaselineTool.handler(
        { minerId: 'miner-1', duration: 60, modes: ['low', 'medium', 'high'] },
        context
      );

      const startResponse = JSON.parse(getTextFromResult(startResult));
      const jobId = startResponse.jobId as string;
      await waitForJobCompletion(jobService, jobId, 240000); // 60s * 3 modes + overhead

      const finalResult = await checkBaselineJobStatusTool.handler(
        { jobId, detailLevel: 'verbose' },
        context
      );

      const finalResponse = JSON.parse(getTextFromResult(finalResult));
      const results = finalResponse.results as BaselineResults;

      // Should have detailed metrics for all 3 modes
      expect(results.detailedMetrics).toHaveLength(3);
      expect(results.detailedMetrics.map((m) => m.mode)).toEqual(['low', 'medium', 'high']);

      // Verify each mode has different power levels
      const modes = results.detailedMetrics;
      const lowMode = modes.find((m) => m.mode === 'low');
      const mediumMode = modes.find((m) => m.mode === 'medium');
      const highMode = modes.find((m) => m.mode === 'high');

      expect(lowMode?.metrics.power).toBe(2500);
      expect(mediumMode?.metrics.power).toBe(3000);
      expect(highMode?.metrics.power).toBe(3500);
    }, 300000); // Extended timeout for 3 modes
  });
});
