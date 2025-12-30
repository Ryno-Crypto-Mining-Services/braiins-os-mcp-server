/**
 * Configure Network Tool Unit Tests
 */

import type { BraiinsClient, NetworkConfigResponse } from '../../../../src/api/braiins';
import { configureNetworkTool } from '../../../../src/mcp/tools/configure-network';
import type { ToolContext, ToolResult } from '../../../../src/mcp/tools/types';
import type { JobService } from '../../../../src/services/job.service';
import type { MinerRegistration, MinerService, MinerStatusSummary } from '../../../../src/services/miner.service';

/**
 * Network configuration interface for test responses
 */
interface NetworkConfig {
  hostname: string;
  ipAddress: string;
  gateway: string;
  dnsServers: string[];
}

/**
 * Connectivity test result interface
 */
interface ConnectivityTest {
  reachable: boolean;
  latency: number;
  error?: string;
}

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

describe('configure_network tool', () => {
  let mockContext: ToolContext;
  let mockMinerRegistration: MinerRegistration;
  let mockMinerStatus: MinerStatusSummary;
  let mockCurrentNetworkConfig: NetworkConfigResponse;
  let mockUpdatedNetworkConfig: NetworkConfigResponse;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock miner registration
    mockMinerRegistration = {
      id: 'miner-1',
      name: 'Test Miner 1',
      host: '192.168.1.100',
      username: 'root',
      password: 'admin',
    };

    // Setup mock miner status
    mockMinerStatus = {
      id: 'miner-1',
      name: 'Test Miner 1',
      host: '192.168.1.100',
      online: true,
      lastUpdated: new Date().toISOString(),
    };

    // Setup mock current network config
    mockCurrentNetworkConfig = {
      name: 'eth0',
      hostname: 'miner-1',
      mac_address: '00:11:22:33:44:55',
      protocol: 0,
      networks: [
        {
          address: '192.168.1.100',
          netmask: '255.255.255.0',
        },
      ],
      default_gateway: '192.168.1.1',
      dns_servers: ['8.8.8.8', '8.8.4.4'],
    };

    // Setup mock updated network config
    mockUpdatedNetworkConfig = {
      ...mockCurrentNetworkConfig,
      networks: [
        {
          address: '192.168.1.150',
          netmask: '255.255.255.0',
        },
      ],
    };

    // Setup mock context
    const mockMinerService: Partial<MinerService> = {
      getRegisteredMiners: jest.fn().mockResolvedValue([mockMinerRegistration]),
      getMinerStatus: jest.fn().mockResolvedValue(mockMinerStatus),
      refreshMinerStatus: jest.fn().mockResolvedValue(mockMinerStatus),
    };

    const mockBraiinsClient: Partial<BraiinsClient> = {
      getNetworkConfig: jest.fn().mockResolvedValue(mockCurrentNetworkConfig),
      setNetworkConfig: jest.fn().mockResolvedValue(undefined),
    };

    const mockJobService: Partial<JobService> = {};

    mockContext = {
      minerService: mockMinerService as MinerService,
      braiinsClient: mockBraiinsClient as BraiinsClient,
      jobService: mockJobService as JobService,
    };
  });

  describe('Input Validation', () => {
    it('should accept valid IP address with CIDR notation', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          ipAddress: '192.168.1.150/24',
          validateConnectivity: false, // Skip connectivity test for unit test
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContext.braiinsClient.setNetworkConfig).toHaveBeenCalled();
    });

    it('should reject invalid IP address format', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          ipAddress: '999.999.999.999/24',
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean; error?: string };

      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid');
      expect(result.isError).toBe(true);
    });

    it('should reject invalid CIDR prefix', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          ipAddress: '192.168.1.150/99',
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('should accept valid gateway IP address', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          gateway: '192.168.1.254',
          validateConnectivity: false,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(true);
    });

    it('should reject invalid gateway format', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          gateway: 'invalid-gateway',
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('should accept valid DNS servers array', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          dnsServers: ['8.8.8.8', '8.8.4.4', '1.1.1.1'],
          validateConnectivity: false,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(true);
    });

    it('should reject more than 3 DNS servers', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          dnsServers: ['8.8.8.8', '8.8.4.4', '1.1.1.1', '9.9.9.9'],
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('should accept valid hostname', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          hostname: 'miner-test-01',
          validateConnectivity: false,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(true);
    });

    it('should reject invalid hostname with special characters', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          hostname: 'miner_test@01',
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('should require at least one network parameter', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });
  });

  describe('Miner Validation', () => {
    it('should reject non-existent miner', async () => {
      (mockContext.minerService.getRegisteredMiners as jest.Mock).mockResolvedValue([]);

      const result = await configureNetworkTool.handler(
        {
          minerId: 'non-existent-miner',
          ipAddress: '192.168.1.150/24',
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean; error?: string };

      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
      expect(result.isError).toBe(true);
    });

    it('should reject offline miner', async () => {
      (mockContext.minerService.getMinerStatus as jest.Mock).mockResolvedValue({
        ...mockMinerStatus,
        online: false,
      });

      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          ipAddress: '192.168.1.150/24',
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean; error?: string };

      expect(response.success).toBe(false);
      expect(response.error).toContain('offline');
      expect(result.isError).toBe(true);
    });
  });

  describe('Network Configuration', () => {
    it('should update IP address successfully', async () => {
      // Mock successful connectivity test
      (mockContext.braiinsClient.getNetworkConfig as jest.Mock).mockResolvedValueOnce(mockCurrentNetworkConfig).mockResolvedValueOnce(mockUpdatedNetworkConfig);

      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          ipAddress: '192.168.1.150/24',
          validateConnectivity: false,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean; previousConfig?: NetworkConfig; newConfig?: NetworkConfig };

      expect(response.success).toBe(true);
      expect(response.previousConfig).toBeDefined();
      expect(response.newConfig).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContext.braiinsClient.setNetworkConfig).toHaveBeenCalled();
    });

    it('should update gateway successfully', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          gateway: '192.168.1.254',
          validateConnectivity: false,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContext.braiinsClient.setNetworkConfig).toHaveBeenCalled();
    });

    it('should update hostname successfully', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          hostname: 'new-miner-name',
          validateConnectivity: false,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContext.braiinsClient.setNetworkConfig).toHaveBeenCalledWith(
        mockMinerRegistration.host,
        expect.objectContaining({
          hostname: 'new-miner-name',
        })
      );
    });

    it('should call refreshMinerStatus after successful update', async () => {
      await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          ipAddress: '192.168.1.150/24',
          validateConnectivity: false,
        },
        mockContext
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContext.minerService.refreshMinerStatus).toHaveBeenCalledWith('miner-1');
    });
  });

  describe('Connectivity Testing', () => {
    it('should test connectivity when validateConnectivity is true', async () => {
      // Mock successful connectivity test
      (mockContext.braiinsClient.getNetworkConfig as jest.Mock)
        .mockResolvedValueOnce(mockCurrentNetworkConfig) // Initial config
        .mockResolvedValueOnce(mockCurrentNetworkConfig) // Connectivity test
        .mockResolvedValueOnce(mockUpdatedNetworkConfig); // Final config

      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          ipAddress: '192.168.1.150/24',
          validateConnectivity: true,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean; connectivityTest?: ConnectivityTest };

      expect(response.success).toBe(true);
      expect(response.connectivityTest).toBeDefined();
      expect(response.connectivityTest?.reachable).toBe(true);
    });

    it('should skip connectivity test when validateConnectivity is false', async () => {
      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          ipAddress: '192.168.1.150/24',
          validateConnectivity: false,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean };

      expect(response.success).toBe(true);
      // Connectivity test was skipped, so getNetworkConfig called twice (initial + final)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContext.braiinsClient.getNetworkConfig).toHaveBeenCalledTimes(2);
    });

    it('should rollback on connectivity test failure', async () => {
      // Mock failed connectivity test
      (mockContext.braiinsClient.getNetworkConfig as jest.Mock)
        .mockResolvedValueOnce(mockCurrentNetworkConfig) // Initial config
        .mockRejectedValueOnce(new Error('Connection timeout')); // Connectivity test fails

      const result = await configureNetworkTool.handler(
        {
          minerId: 'miner-1',
          ipAddress: '192.168.1.150/24',
          validateConnectivity: true,
        },
        mockContext
      );

      const responseText = getResponseText(result);
      const response = JSON.parse(responseText) as { success: boolean; error?: string; rollback?: string };

      expect(response.success).toBe(false);
      expect(response.error).toContain('Connectivity test failed');
      expect(response.rollback).toContain('rolled back');
      expect(result.isError).toBe(true);

      // Should have called setNetworkConfig twice: once for update, once for rollback
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContext.braiinsClient.setNetworkConfig).toHaveBeenCalledTimes(2);
    });
  });
});
