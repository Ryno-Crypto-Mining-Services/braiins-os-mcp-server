/**
 * Configure Autotuning Tool Unit Tests
 */

import type { BraiinsClient } from '../../../../src/api/braiins';
import { configureAutotuningTool } from '../../../../src/mcp/tools/configure-autotuning';
import type { ToolContext, ToolResult } from '../../../../src/mcp/tools/types';
import type { JobService } from '../../../../src/services/job.service';
import type { MinerRegistration, MinerService, MinerStatusSummary } from '../../../../src/services/miner.service';

/**
 * Extracts text content from tool result safely.
 */
function getResponseText(result: ToolResult): string {
  const firstContent = result.content[0];
  if (firstContent && 'text' in firstContent && typeof firstContent.text === 'string') {
    return firstContent.text;
  }
  return '{}';
}

describe('configure_autotuning tool', () => {
  let mockContext: ToolContext;
  let mockMiners: MinerRegistration[];
  let mockMinerStatus: MinerStatusSummary;
  let mockCreateJob: jest.Mock;
  let mockSetPowerTarget: jest.Mock;
  let mockSetHashrateTarget: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock functions
    mockCreateJob = jest.fn();
    mockSetPowerTarget = jest.fn();
    mockSetHashrateTarget = jest.fn();

    // Setup mock miners
    mockMiners = [
      {
        id: 'miner-1',
        name: 'Test Miner 1',
        host: '192.168.1.100',
        username: 'root',
        password: 'admin',
      },
      {
        id: 'miner-2',
        name: 'Test Miner 2',
        host: '192.168.1.101',
        username: 'root',
        password: 'admin',
      },
      {
        id: 'miner-3',
        name: 'Test Miner 3',
        host: '192.168.1.102',
        username: 'root',
        password: 'admin',
      },
    ];

    // Setup mock miner status
    mockMinerStatus = {
      id: 'miner-1',
      name: 'Test Miner 1',
      host: '192.168.1.100',
      online: true,
      info: {
        uid: 'test-uid',
        serial_number: 'SN123',
        hostname: 'miner-1',
        mac_address: '00:11:22:33:44:55',
        platform: 1,
        bos_mode: 1,
        bos_version: {
          current: '1.5.0',
          major: 1,
          minor: 5,
          patch: 0,
        },
        kernel_version: '5.10.0',
        control_board_soc_family: 1,
        miner_identity: {
          brand: 'Antminer',
          model: 'S19',
          name: 'Test Miner',
        },
        status: 2,
        system_uptime: 3600,
        system_uptime_s: 3600,
        bosminer_uptime_s: 3600,
      },
      lastUpdated: new Date().toISOString(),
    };

    // Setup mock implementations
    mockSetPowerTarget.mockResolvedValue(undefined);
    mockSetHashrateTarget.mockResolvedValue(undefined);
    mockCreateJob.mockImplementation((_type: string, total: number, metadata?: Record<string, unknown>) => {
      return Promise.resolve({
        jobId: 'test-job-123',
        type: 'configure_autotuning',
        status: 'pending',
        progress: { total, completed: 0, failed: 0, percentage: 0 },
        startedAt: new Date().toISOString(),
        errors: [],
        metadata,
      });
    });

    // Setup mock context with proper types
    const mockMinerService: Partial<MinerService> = {
      getRegisteredMiners: jest.fn().mockResolvedValue(mockMiners),
      getMinerStatus: jest.fn().mockResolvedValue(mockMinerStatus),
      setPowerTarget: mockSetPowerTarget,
      setHashrateTarget: mockSetHashrateTarget,
    };

    const mockJobService: Partial<JobService> = {
      createJob: mockCreateJob,
      updateProgress: jest.fn().mockResolvedValue(undefined),
      addError: jest.fn().mockResolvedValue(undefined),
      completeJob: jest.fn().mockResolvedValue(undefined),
      failJob: jest.fn().mockResolvedValue(undefined),
    };

    mockContext = {
      minerService: mockMinerService as MinerService,
      braiinsClient: {} as BraiinsClient,
      jobService: mockJobService as unknown as JobService,
    };
  });

  describe('Single miner configuration', () => {
    it('should configure single miner in power mode', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'power',
          targetPower: 2500,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as {
        success: boolean;
        jobId?: string;
        status?: string;
        estimatedDuration?: number;
      };

      expect(response.success).toBe(true);
      expect(response.jobId).toBe('test-job-123');
      expect(response.status).toBe('pending');
      expect(response.estimatedDuration).toBe(5); // 1 miner * 5 sec
      expect(mockCreateJob).toHaveBeenCalledWith('configure_autotuning', 1, {
        mode: 'power',
        targetPower: 2500,
        targetHashrate: undefined,
        minerIds: ['miner-1'],
      });
    });

    it('should configure single miner in hashrate mode', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'hashrate',
          targetHashrate: 95,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean; jobId?: string };

      expect(response.success).toBe(true);
      expect(response.jobId).toBe('test-job-123');
      expect(mockCreateJob).toHaveBeenCalledWith('configure_autotuning', 1, {
        mode: 'hashrate',
        targetPower: undefined,
        targetHashrate: 95,
        minerIds: ['miner-1'],
      });
    });

    it('should configure single miner in efficiency mode', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'efficiency',
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean; jobId?: string };

      expect(response.success).toBe(true);
      expect(response.jobId).toBe('test-job-123');
      // Efficiency mode doesn't require target parameters
      expect(mockCreateJob).toHaveBeenCalledWith('configure_autotuning', 1, {
        mode: 'efficiency',
        targetPower: undefined,
        targetHashrate: undefined,
        minerIds: ['miner-1'],
      });
    });
  });

  describe('Batch operations', () => {
    it('should configure multiple miners in batch', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1', 'miner-2', 'miner-3'],
          mode: 'power',
          targetPower: 2400,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as {
        success: boolean;
        estimatedDuration?: number;
      };

      expect(response.success).toBe(true);
      expect(response.estimatedDuration).toBe(15); // 3 miners * 5 sec
      expect(mockCreateJob).toHaveBeenCalledWith('configure_autotuning', 3, expect.any(Object));
    });

    it('should enforce batch size limit (max 100 miners)', async () => {
      const tooManyMiners = Array.from({ length: 101 }, (_, i) => `miner-${i}`);

      const result = await configureAutotuningTool.handler(
        {
          minerIds: tooManyMiners,
          mode: 'power',
          targetPower: 2500,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });
  });

  describe('Input validation', () => {
    it('should reject power mode without targetPower', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'power',
          // Missing targetPower
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean; error?: string };

      expect(response.success).toBe(false);
      expect(response.error).toContain('targetPower');
      expect(result.isError).toBe(true);
    });

    it('should reject hashrate mode without targetHashrate', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'hashrate',
          // Missing targetHashrate
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean; error?: string };

      expect(response.success).toBe(false);
      expect(response.error).toContain('targetHashrate');
      expect(result.isError).toBe(true);
    });

    it('should reject invalid mode', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'invalid-mode',
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('should reject empty miner IDs array', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: [],
          mode: 'power',
          targetPower: 2500,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('should reject negative targetPower', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'power',
          targetPower: -100,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('should reject negative targetHashrate', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'hashrate',
          targetHashrate: -50,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });
  });

  describe('Validation flag', () => {
    it('should respect validate: false flag', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'power',
          targetPower: 2500,
          validate: false,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(true);
      expect(mockCreateJob).toHaveBeenCalledWith(
        'configure_autotuning',
        1,
        expect.objectContaining({ mode: 'power' })
      );
    });

    it('should default to validate: true', async () => {
      const result = await configureAutotuningTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'efficiency',
          // No validate parameter - should default to true
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(true);
    });
  });

  describe('Tool schema', () => {
    it('should have correct tool name', () => {
      expect(configureAutotuningTool.schema.name).toBe('configure_autotuning');
    });

    it('should have description', () => {
      expect(configureAutotuningTool.schema.description).toBeDefined();
      expect(configureAutotuningTool.schema.description).toContain('autotuning');
    });

    it('should have required parameters defined', () => {
      expect(configureAutotuningTool.schema.inputSchema.required).toContain('minerIds');
      expect(configureAutotuningTool.schema.inputSchema.required).toContain('mode');
    });

    it('should have mode enum values', () => {
      const properties = configureAutotuningTool.schema.inputSchema.properties;
      expect(properties).toBeDefined();
      const modeProperty = properties?.mode as { enum: string[] };
      expect(modeProperty.enum).toEqual(['power', 'hashrate', 'efficiency']);
    });
  });
});
