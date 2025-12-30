/**
 * Tests for Configure Fan Control Tool
 */

import { configureFanControlTool } from '../../../../src/mcp/tools/configure-fan-control';
import type { ToolContext, ToolResult } from '../../../../src/mcp/tools/types';

/**
 * Helper to extract text from tool result
 */
function getTextFromResult(result: ToolResult): string {
  if (!result.content || result.content.length === 0) {
    throw new Error('Result has no content');
  }

  const firstContent = result.content[0];
  if (!firstContent || firstContent.type !== 'text') {
    throw new Error('First content item is not text');
  }

  return firstContent.text;
}

describe('configure_fan_control tool', () => {
  let mockContext: Partial<ToolContext>;
  let mockGetRegisteredMiners: jest.Mock;
  let mockGetMinerStatus: jest.Mock;
  let mockRefreshMinerStatus: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    mockGetRegisteredMiners = jest.fn();
    mockGetMinerStatus = jest.fn();
    mockRefreshMinerStatus = jest.fn();

    mockContext = {
      minerService: {
        getRegisteredMiners: mockGetRegisteredMiners,
        getMinerStatus: mockGetMinerStatus,
        refreshMinerStatus: mockRefreshMinerStatus,
      } as unknown as ToolContext['minerService'],
    };

    // Default mock implementations
    mockGetRegisteredMiners.mockResolvedValue([
      { id: 'miner-1', host: '192.168.1.100', port: 50051 },
      { id: 'miner-2', host: '192.168.1.101', port: 50051 },
      { id: 'miner-3', host: '192.168.1.102', port: 50051 },
    ]);

    mockGetMinerStatus.mockResolvedValue({
      online: true,
      hashrate: 95.5,
      temperature: 65,
    });

    mockRefreshMinerStatus.mockResolvedValue(undefined);
  });

  describe('Auto mode configuration', () => {
    it('should configure fan to auto mode with valid parameters', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'auto',
          minFanSpeed: 30,
          maxFanSpeed: 80,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBe(1);
      expect(response.failedMiners).toBe(0);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockRefreshMinerStatus).toHaveBeenCalledWith('miner-1');
    });

    it('should reject auto mode with minFanSpeed < 30%', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'auto',
          minFanSpeed: 20, // Below safety threshold
          maxFanSpeed: 80,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.failedMiners).toBe(1);
    });

    it('should reject auto mode with minFanSpeed > maxFanSpeed', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'auto',
          minFanSpeed: 80,
          maxFanSpeed: 50, // Less than min
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.failedMiners).toBe(1);
    });

    it('should generate warning for low minFanSpeed (30-40%)', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'auto',
          minFanSpeed: 35, // Low but acceptable
          maxFanSpeed: 80,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.warnings).toHaveLength(1);
      expect(response.warnings[0]).toContain('35%');
      expect(response.warnings[0]).toContain('low');
    });
  });

  describe('Manual mode configuration', () => {
    it('should configure fan to manual mode with valid fanSpeed', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          fanSpeed: 70,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBe(1);
      expect(response.failedMiners).toBe(0);
    });

    it('should reject manual mode without fanSpeed parameter', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          // Missing fanSpeed
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.failedMiners).toBe(1);
    });

    it('should reject manual mode with fanSpeed < 30%', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          fanSpeed: 25, // Below safety threshold
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.failedMiners).toBe(1);
    });

    it('should generate warning for fanSpeed between 30-40%', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          fanSpeed: 35, // Low but acceptable
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.warnings).toHaveLength(1);
      expect(response.warnings[0]).toContain('35%');
    });
  });

  describe('Batch operations', () => {
    it('should configure multiple miners successfully', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1', 'miner-2', 'miner-3'],
          mode: 'manual',
          fanSpeed: 70,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBe(3);
      expect(response.failedMiners).toBe(0);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockRefreshMinerStatus).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures gracefully', async () => {
      mockGetMinerStatus
        .mockResolvedValueOnce({ online: true }) // miner-1 success
        .mockResolvedValueOnce({ online: false }) // miner-2 offline
        .mockResolvedValueOnce({ online: true }); // miner-3 success

      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1', 'miner-2', 'miner-3'],
          mode: 'manual',
          fanSpeed: 70,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBe(2);
      expect(response.failedMiners).toBe(1);
    });

    it('should reject batch size > 100', async () => {
      const minerIds = Array.from({ length: 101 }, (_, i) => `miner-${i}`);

      const result = await configureFanControlTool.handler(
        {
          minerIds,
          mode: 'manual',
          fanSpeed: 70,
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });
  });

  describe('Mode switching', () => {
    it('should switch from manual to auto mode', async () => {
      // First set to manual
      await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          fanSpeed: 70,
        },
        mockContext as ToolContext
      );

      // Then switch to auto
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'auto',
          minFanSpeed: 40,
          maxFanSpeed: 80,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBe(1);
    });

    it('should switch from auto to manual mode', async () => {
      // First set to auto
      await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'auto',
          minFanSpeed: 40,
          maxFanSpeed: 80,
        },
        mockContext as ToolContext
      );

      // Then switch to manual
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          fanSpeed: 60,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBe(1);
    });
  });

  describe('Validation flag', () => {
    it('should allow unsafe fanSpeed when validate=false', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          fanSpeed: 20, // Below safety threshold
          validate: false, // Disable safety checks
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBe(1); // Should succeed when validation disabled
    });

    it('should default to validate=true', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          fanSpeed: 20, // Below safety threshold
          // validate not specified, defaults to true
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.failedMiners).toBe(1); // Should fail with validation enabled
    });
  });

  describe('Detail levels', () => {
    it('should return concise response by default', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          fanSpeed: 70,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBeDefined();
      expect(response.failedMiners).toBeDefined();
      expect(response.warnings).toBeDefined();
      expect(response.results).toBeUndefined(); // Not included in concise mode
    });

    it('should return verbose response when requested', async () => {
      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1', 'miner-2'],
          mode: 'manual',
          fanSpeed: 70,
          detailLevel: 'verbose',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.summary).toBeDefined();
      expect(response.results).toBeDefined();
      expect(response.results).toHaveLength(2);
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent miner gracefully', async () => {
      mockGetRegisteredMiners.mockResolvedValue([
        { id: 'miner-1', host: '192.168.1.100', port: 50051 },
      ]);

      const result = await configureFanControlTool.handler(
        {
          minerIds: ['non-existent-miner'],
          mode: 'manual',
          fanSpeed: 70,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.failedMiners).toBe(1);
    });

    it('should handle offline miner gracefully', async () => {
      mockGetMinerStatus.mockResolvedValue({ online: false });

      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          fanSpeed: 70,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.failedMiners).toBe(1);
    });

    it('should handle service errors gracefully', async () => {
      mockGetMinerStatus.mockRejectedValue(new Error('Network timeout'));

      const result = await configureFanControlTool.handler(
        {
          minerIds: ['miner-1'],
          mode: 'manual',
          fanSpeed: 70,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.failedMiners).toBe(1);
    });
  });

  describe('Tool schema validation', () => {
    it('should have correct tool name', () => {
      expect(configureFanControlTool.schema.name).toBe('configure_fan_control');
    });

    it('should have description', () => {
      expect(configureFanControlTool.schema.description).toBeTruthy();
      expect(configureFanControlTool.schema.description).toContain('fan');
    });

    it('should require minerIds and mode parameters', () => {
      expect(configureFanControlTool.schema.inputSchema.required).toContain('minerIds');
      expect(configureFanControlTool.schema.inputSchema.required).toContain('mode');
    });

    it('should have mode property defined', () => {
      expect(configureFanControlTool.schema.inputSchema.properties).toHaveProperty('mode');
    });
  });
});
