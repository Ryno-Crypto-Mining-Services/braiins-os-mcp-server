/**
 * Tests for Run Performance Baseline Tool
 */

import { checkBaselineJobStatusTool, runPerformanceBaselineTool } from '../../../../src/mcp/tools/run-performance-baseline';
import type { ToolContext } from '../../../../src/mcp/tools/types';
import type { Job } from '../../../../src/services/job.service';
import { getTextFromResult } from '../../helpers/tool-test-utils';

describe('run_performance_baseline tool', () => {
  let mockContext: Partial<ToolContext>;
  let mockGetRegisteredMiners: jest.Mock;
  let mockGetMinerStatus: jest.Mock;
  let mockCreateJob: jest.Mock;
  let mockGetJob: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    mockGetRegisteredMiners = jest.fn();
    mockGetMinerStatus = jest.fn();
    mockCreateJob = jest.fn();
    mockGetJob = jest.fn();

    mockContext = {
      minerService: {
        getRegisteredMiners: mockGetRegisteredMiners,
        getMinerStatus: mockGetMinerStatus,
      } as unknown as ToolContext['minerService'],
      jobService: {
        createJob: mockCreateJob,
        getJob: mockGetJob,
      } as unknown as ToolContext['jobService'],
    };

    // Default mock implementations
    mockGetRegisteredMiners.mockResolvedValue([
      { id: 'miner-1', host: '192.168.1.100', port: 50051 },
      { id: 'miner-2', host: '192.168.1.101', port: 50051 },
    ]);

    mockGetMinerStatus.mockResolvedValue({
      online: true,
      hashrate: 95.5,
      temperature: 65,
    });

    mockCreateJob.mockResolvedValue({
      jobId: 'job_123',
      type: 'performance_baseline',
      status: 'pending',
      progress: { total: 3, completed: 0, failed: 0, percentage: 0 },
      startedAt: new Date().toISOString(),
      errors: [],
    });

    mockGetJob.mockResolvedValue({
      jobId: 'job_123',
      type: 'performance_baseline',
      status: 'running',
      progress: { total: 3, completed: 1, failed: 0, percentage: 33 },
      startedAt: new Date().toISOString(),
      errors: [],
    });
  });

  describe('Job creation', () => {
    it('should create baseline job for single miner', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.jobId).toBe('job_123');
      expect(response.status).toBe('pending');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockCreateJob).toHaveBeenCalledWith('performance_baseline', 3, expect.any(Object));
    });

    it('should use default duration of 300 seconds', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockCreateJob).toHaveBeenCalledWith(
        'performance_baseline',
        3,
        expect.objectContaining({ duration: 300 })
      );
    });

    it('should accept custom duration', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 600,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockCreateJob).toHaveBeenCalledWith(
        'performance_baseline',
        3,
        expect.objectContaining({ duration: 600 })
      );
    });

    it('should test all modes by default', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockCreateJob).toHaveBeenCalledWith(
        'performance_baseline',
        3, // low, medium, high
        expect.objectContaining({ modes: ['low', 'medium', 'high'] })
      );
    });

    it('should accept custom modes subset', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          modes: ['low', 'high'],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockCreateJob).toHaveBeenCalledWith(
        'performance_baseline',
        2,
        expect.objectContaining({ modes: ['low', 'high'] })
      );
    });
  });

  describe('Duration validation', () => {
    it('should accept minimum duration of 60 seconds', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 60,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
    });

    it('should accept maximum duration of 3600 seconds', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 3600,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
    });

    it('should reject duration below 60 seconds', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 30,
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });

    it('should reject duration above 3600 seconds', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 5000,
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });
  });

  describe('Power mode validation', () => {
    it('should accept valid power modes', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          modes: ['low', 'medium', 'high'],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
    });

    it('should reject invalid power mode', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          modes: ['low', 'invalid', 'high'],
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });

    it('should accept single mode', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          modes: ['medium'],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockCreateJob).toHaveBeenCalledWith('performance_baseline', 1, expect.any(Object));
    });
  });

  describe('Detail levels', () => {
    it('should return concise response by default', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.jobId).toBeDefined();
      expect(response.status).toBeDefined();
      expect(response.estimatedDuration).toBeDefined();
      expect(response.estimatedDuration).toContain('s');
      expect(response.modes).toBeUndefined(); // Not in concise mode
    });

    it('should return verbose response when requested', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          detailLevel: 'verbose',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.jobId).toBeDefined();
      expect(response.status).toBeDefined();
      expect(response.progress).toBeDefined();
      expect(response.modes).toBeDefined();
      expect(response.estimatedDuration).toContain('seconds'); // Full word in verbose mode
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent miner', async () => {
      mockGetRegisteredMiners.mockResolvedValue([
        { id: 'miner-2', host: '192.168.1.101', port: 50051 },
      ]);

      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
      expect(response.suggestion).toContain('list_miners');
    });

    it('should handle offline miner', async () => {
      mockGetMinerStatus.mockResolvedValue({ online: false });

      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
      expect(response.error).toContain('offline');
      expect(response.suggestion).toContain('powered on');
    });

    it('should handle service errors gracefully', async () => {
      mockGetMinerStatus.mockRejectedValue(new Error('Network timeout'));

      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });
  });

  describe('Estimated duration calculation', () => {
    it('should calculate correct duration for all modes', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 300,
          modes: ['low', 'medium', 'high'],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.estimatedDuration).toBe('900s'); // 300 * 3 modes
    });

    it('should calculate correct duration for subset of modes', async () => {
      const result = await runPerformanceBaselineTool.handler(
        {
          minerId: 'miner-1',
          duration: 600,
          modes: ['low', 'high'],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.estimatedDuration).toBe('1200s'); // 600 * 2 modes
    });
  });

  describe('Tool schema validation', () => {
    it('should have correct tool name', () => {
      expect(runPerformanceBaselineTool.schema.name).toBe('run_performance_baseline');
    });

    it('should have description', () => {
      expect(runPerformanceBaselineTool.schema.description).toBeTruthy();
      expect(runPerformanceBaselineTool.schema.description).toContain('performance');
    });

    it('should require minerId parameter', () => {
      expect(runPerformanceBaselineTool.schema.inputSchema.required).toContain('minerId');
    });

    it('should have duration property defined', () => {
      expect(runPerformanceBaselineTool.schema.inputSchema.properties).toHaveProperty('duration');
    });

    it('should have modes property defined', () => {
      expect(runPerformanceBaselineTool.schema.inputSchema.properties).toHaveProperty('modes');
    });
  });
});

describe('check_baseline_job_status tool', () => {
  let mockContext: Partial<ToolContext>;
  let mockGetJob: jest.Mock;

  beforeEach(() => {
    mockGetJob = jest.fn();

    mockContext = {
      jobService: {
        getJob: mockGetJob,
      } as unknown as ToolContext['jobService'],
    };

    // Default mock - running job
    mockGetJob.mockResolvedValue({
      jobId: 'job_123',
      type: 'performance_baseline',
      status: 'running',
      progress: { total: 3, completed: 1, failed: 0, percentage: 33 },
      startedAt: new Date().toISOString(),
      errors: [],
      metadata: {
        minerId: 'miner-1',
        duration: 300,
        modes: ['low', 'medium', 'high'],
      },
    } as Job);
  });

  describe('Job status retrieval', () => {
    it('should return running job status', async () => {
      const result = await checkBaselineJobStatusTool.handler(
        {
          jobId: 'job_123',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.jobId).toBe('job_123');
      expect(response.status).toBe('running');
      expect(response.progress).toBeDefined();
    });

    it('should return completed job status', async () => {
      mockGetJob.mockResolvedValue({
        jobId: 'job_123',
        type: 'performance_baseline',
        status: 'completed',
        progress: { total: 3, completed: 3, failed: 0, percentage: 100 },
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        errors: [],
      } as Job);

      const result = await checkBaselineJobStatusTool.handler(
        {
          jobId: 'job_123',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.status).toBe('completed');
      expect(response.progress.percentage).toBe(100);
    });

    it('should return failed job status', async () => {
      mockGetJob.mockResolvedValue({
        jobId: 'job_123',
        type: 'performance_baseline',
        status: 'failed',
        progress: { total: 3, completed: 1, failed: 2, percentage: 100 },
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        errors: [
          {
            error: 'Miner connection failed',
            suggestion: 'Check network connectivity',
            timestamp: new Date().toISOString(),
          },
        ],
      } as Job);

      const result = await checkBaselineJobStatusTool.handler(
        {
          jobId: 'job_123',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.status).toBe('failed');
    });
  });

  describe('Detail levels', () => {
    it('should return concise response by default', async () => {
      const result = await checkBaselineJobStatusTool.handler(
        {
          jobId: 'job_123',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.jobId).toBeDefined();
      expect(response.status).toBeDefined();
      expect(response.progress).toBeDefined();
      expect(response.metadata).toBeUndefined(); // Not in concise mode
    });

    it('should return verbose response when requested', async () => {
      const result = await checkBaselineJobStatusTool.handler(
        {
          jobId: 'job_123',
          detailLevel: 'verbose',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.jobId).toBeDefined();
      expect(response.status).toBeDefined();
      expect(response.progress).toBeDefined();
      expect(response.startedAt).toBeDefined();
      expect(response.metadata).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent job', async () => {
      mockGetJob.mockResolvedValue(null);

      const result = await checkBaselineJobStatusTool.handler(
        {
          jobId: 'nonexistent',
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should handle service errors', async () => {
      mockGetJob.mockRejectedValue(new Error('Database connection failed'));

      const result = await checkBaselineJobStatusTool.handler(
        {
          jobId: 'job_123',
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });
  });

  describe('Tool schema validation', () => {
    it('should have correct tool name', () => {
      expect(checkBaselineJobStatusTool.schema.name).toBe('check_baseline_job_status');
    });

    it('should have description', () => {
      expect(checkBaselineJobStatusTool.schema.description).toBeTruthy();
      expect(checkBaselineJobStatusTool.schema.description).toContain('status');
    });

    it('should require jobId parameter', () => {
      expect(checkBaselineJobStatusTool.schema.inputSchema.required).toContain('jobId');
    });
  });
});
