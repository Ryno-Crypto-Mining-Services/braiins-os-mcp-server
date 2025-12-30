/**
 * Tests for Configure Power Schedule Tool
 */

import { configurePowerScheduleTool } from '../../../../src/mcp/tools/configure-power-schedule';
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

describe('configure_power_schedule tool', () => {
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
    ]);

    mockGetMinerStatus.mockResolvedValue({
      online: true,
      hashrate: 95.5,
    });

    mockRefreshMinerStatus.mockResolvedValue(undefined);
  });

  describe('Single schedule creation', () => {
    it('should configure single schedule successfully', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '0 2 * * *', // 2 AM daily
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBe(1);
      expect(response.failedMiners).toBe(0);
      expect(response.schedules).toHaveLength(1);
      expect(response.schedules[0].cron).toBe('0 2 * * *');
      expect(response.schedules[0].nextExecution).toBeDefined();
    });
  });

  describe('Multiple schedules per miner', () => {
    it('should configure up to 10 schedules on one miner', async () => {
      const schedules = Array.from({ length: 10 }, (_, i) => ({
        cron: `${i * 6} * * * *`, // Every hour at different minutes
        powerLimit: 3000 - i * 100,
        mode: 'enable' as const,
      }));

      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.schedules).toHaveLength(10);
    });

    it('should reject more than 10 schedules', async () => {
      const schedules = Array.from({ length: 11 }, (_, i) => ({
        cron: `${i * 5} * * * *`,
        powerLimit: 3000,
        mode: 'enable' as const,
      }));

      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules,
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });
  });

  describe('Cron expression validation', () => {
    it('should accept valid cron expression', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '30 14 * * 5', // 2:30 PM every Friday
              powerLimit: 2500,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
    });

    it('should reject invalid cron expression format', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: 'invalid cron', // Invalid format
              powerLimit: 2500,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });

    it('should accept wildcard cron expressions', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '* * * * *', // Every minute
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
    });

    it('should accept step value cron expressions', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '*/15 * * * *', // Every 15 minutes
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
    });
  });

  describe('Timezone validation', () => {
    it('should accept valid IANA timezone', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
          timezone: 'America/New_York',
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
    });

    it('should reject invalid timezone when validation enabled', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
          timezone: 'Invalid/Timezone',
          validate: true,
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.failedMiners).toBe(1);
    });

    it('should use UTC as default timezone', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
          // timezone not specified
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
    });
  });

  describe('Batch operation test', () => {
    it('should configure multiple miners simultaneously', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1', 'miner-2'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBe(2);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockRefreshMinerStatus).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in batch', async () => {
      mockGetMinerStatus
        .mockResolvedValueOnce({ online: true }) // miner-1 success
        .mockResolvedValueOnce({ online: false }); // miner-2 offline

      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1', 'miner-2'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBe(1);
      expect(response.failedMiners).toBe(1);
    });

    it('should reject batch size > 100', async () => {
      const minerIds = Array.from({ length: 101 }, (_, i) => `miner-${i}`);

      const result = await configurePowerScheduleTool.handler(
        {
          minerIds,
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });
  });

  describe('Power limit validation', () => {
    it('should accept power limit within 0-10000 watts', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 5000,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
    });

    it('should reject power limit above 10000 watts', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 15000, // Above max
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });

    it('should reject negative power limit', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: -100,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      expect(result.isError).toBe(true);
      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(false);
    });
  });

  describe('Detail levels', () => {
    it('should return concise response by default', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.successfulMiners).toBeDefined();
      expect(response.failedMiners).toBeDefined();
      expect(response.schedules).toBeDefined();
      expect(response.results).toBeUndefined(); // Not in concise mode
    });

    it('should return verbose response when requested', async () => {
      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1', 'miner-2'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
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
      mockGetRegisteredMiners.mockResolvedValue([{ id: 'miner-1', host: '192.168.1.100', port: 50051 }]);

      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['non-existent-miner'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
        },
        mockContext as ToolContext
      );

      const response = JSON.parse(getTextFromResult(result));
      expect(response.success).toBe(true);
      expect(response.failedMiners).toBe(1);
    });

    it('should handle offline miner gracefully', async () => {
      mockGetMinerStatus.mockResolvedValue({ online: false });

      const result = await configurePowerScheduleTool.handler(
        {
          minerIds: ['miner-1'],
          schedules: [
            {
              cron: '0 2 * * *',
              powerLimit: 3000,
              mode: 'enable',
            },
          ],
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
      expect(configurePowerScheduleTool.schema.name).toBe('configure_power_schedule');
    });

    it('should have description', () => {
      expect(configurePowerScheduleTool.schema.description).toBeTruthy();
      expect(configurePowerScheduleTool.schema.description).toContain('schedule');
    });

    it('should require minerIds and schedules parameters', () => {
      expect(configurePowerScheduleTool.schema.inputSchema.required).toContain('minerIds');
      expect(configurePowerScheduleTool.schema.inputSchema.required).toContain('schedules');
    });
  });
});
