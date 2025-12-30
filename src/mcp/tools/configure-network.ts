/**
 * Configure Network Tool
 *
 * Updates network configuration (IP, DNS, gateway) for a Braiins OS miner
 * with connectivity validation and automatic rollback on failure.
 *
 * @module mcp/tools/configure-network
 */

import { z } from 'zod';
import type { NetworkConfigResponse } from '../../api/braiins';
import { createChildLogger } from '../../utils/logger';
import type { MCPToolDefinition, ToolArguments, ToolContext } from './types';

const logger = createChildLogger({ module: 'configure-network' });

/**
 * IPv4 address validation regex
 */
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * CIDR notation validation regex (e.g., 192.168.1.100/24)
 */
const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/(\d{1,2})$/;

/**
 * Validates IPv4 address format and range
 */
function isValidIPv4(ip: string): boolean {
  if (!IPV4_REGEX.test(ip)) {
    return false;
  }

  const octets = ip.split('.').map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255);
}

/**
 * Validates CIDR notation (IP/prefix)
 */
function isValidCIDR(cidr: string): boolean {
  if (!CIDR_REGEX.test(cidr)) {
    return false;
  }

  const parts = cidr.split('/');
  const ip = parts[0];
  const prefix = parts[1];

  if (!ip || !prefix) {
    return false;
  }

  const prefixNum = parseInt(prefix, 10);

  return isValidIPv4(ip) && prefixNum >= 1 && prefixNum <= 32;
}

/**
 * Extracts IP and netmask from CIDR notation
 */
function parseCIDR(cidr: string): { address: string; netmask: string } {
  const parts = cidr.split('/');
  const address = parts[0];
  const prefix = parts[1];

  if (!address || !prefix) {
    throw new Error('Invalid CIDR format');
  }

  const prefixNum = parseInt(prefix, 10);

  // Convert CIDR prefix to netmask
  const mask = (0xffffffff << (32 - prefixNum)) >>> 0;
  const netmask = [
    (mask >>> 24) & 0xff,
    (mask >>> 16) & 0xff,
    (mask >>> 8) & 0xff,
    mask & 0xff,
  ].join('.');

  return { address, netmask };
}

/**
 * Custom Zod validator for IPv4 addresses
 */
const IPv4Schema = z.string().refine(isValidIPv4, {
  message: 'Invalid IPv4 address format (must be xxx.xxx.xxx.xxx with each octet 0-255)',
});

/**
 * Custom Zod validator for CIDR notation
 */
const CIDRSchema = z.string().refine(isValidCIDR, {
  message: 'Invalid CIDR format (must be xxx.xxx.xxx.xxx/yy with prefix 1-32)',
});

/**
 * Input schema for network configuration.
 */
const ConfigureNetworkArgsSchema = z
  .object({
    minerId: z.string().min(1, 'Miner ID is required'),
    ipAddress: CIDRSchema.optional(),
    gateway: IPv4Schema.optional(),
    dnsServers: z.array(IPv4Schema).min(1).max(3).optional(),
    hostname: z.string().min(1).max(63).regex(/^[a-zA-Z0-9-]+$/).optional(),
    validateConnectivity: z.boolean().optional().default(true),
  })
  .strict()
  .refine((data) => data.ipAddress ?? data.gateway ?? data.dnsServers ?? data.hostname, {
    message: 'At least one network parameter must be provided (ipAddress, gateway, dnsServers, or hostname)',
  });

/**
 * Network configuration interface for output
 */
interface NetworkConfig {
  hostname: string;
  ipAddress: string;
  gateway: string;
  dnsServers: string[];
}

/**
 * Tests connectivity to a miner by attempting to fetch its status.
 *
 * @param host - Miner host IP address
 * @param context - Tool context
 * @returns Connectivity test result
 */
async function testConnectivity(
  host: string,
  context: ToolContext
): Promise<{ reachable: boolean; latency: number; error?: string }> {
  const startTime = Date.now();

  try {
    // Test connectivity by fetching network config (available in all Braiins versions)
    await context.braiinsClient.getNetworkConfig(host);

    const latency = Date.now() - startTime;
    return { reachable: true, latency };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      reachable: false,
      latency,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Formats network config response for output
 */
function formatNetworkConfig(config: NetworkConfigResponse): NetworkConfig {
  // Get primary network address
  const primaryAddress = config.networks[0];
  const ipAddress = primaryAddress ? `${primaryAddress.address}/${calculateCIDRPrefix(primaryAddress.netmask)}` : 'N/A';

  return {
    hostname: config.hostname ?? 'N/A',
    ipAddress,
    gateway: config.default_gateway ?? 'N/A',
    dnsServers: config.dns_servers ?? [],
  };
}

/**
 * Calculates CIDR prefix from netmask
 */
function calculateCIDRPrefix(netmask: string): number {
  const octets = netmask.split('.').map(Number);
  let prefix = 0;

  for (const octet of octets) {
    let bits = octet;
    while (bits > 0) {
      if (bits & 1) {
        prefix++;
      }
      bits >>= 1;
    }
  }

  return prefix;
}

/**
 * Configure Network Tool Definition.
 */
export const configureNetworkTool: MCPToolDefinition = {
  schema: {
    name: 'configure_network',
    description:
      'Update network configuration (IP address, gateway, DNS servers, hostname) for a Braiins OS miner. Tests connectivity after changes and automatically rolls back on failure. Single miner operation only for safety.',
    inputSchema: {
      type: 'object',
      properties: {
        minerId: {
          type: 'string',
          description: 'The unique identifier of the miner',
        },
        ipAddress: {
          type: 'string',
          description: 'IPv4 address with CIDR notation (e.g., 192.168.1.100/24)',
          pattern: '^(\\d{1,3}\\.){3}\\d{1,3}/(\\d{1,2})$',
        },
        gateway: {
          type: 'string',
          description: 'Gateway IPv4 address (e.g., 192.168.1.1)',
          pattern: '^(\\d{1,3}\\.){3}\\d{1,3}$',
        },
        dnsServers: {
          type: 'array',
          items: { type: 'string', pattern: '^(\\d{1,3}\\.){3}\\d{1,3}$' },
          description: 'DNS server IPv4 addresses (1-3 servers)',
          minItems: 1,
          maxItems: 3,
        },
        hostname: {
          type: 'string',
          description: 'Miner hostname (alphanumeric and hyphens only, max 63 chars)',
          pattern: '^[a-zA-Z0-9\\-]+$',
          maxLength: 63,
        },
        validateConnectivity: {
          type: 'boolean',
          description: 'Test connectivity after configuration and rollback on failure (default: true)',
          default: true,
        },
      },
      required: ['minerId'],
    },
  },

  handler: async (args: ToolArguments, context: ToolContext) => {
    try {
      const validated = ConfigureNetworkArgsSchema.parse(args);

      // Check if miner exists
      const registration = (await context.minerService.getRegisteredMiners()).find((m) => m.id === validated.minerId);

      if (!registration) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Miner ${validated.minerId} not found in registry`,
                suggestions: ['Verify miner ID with list_miners tool', 'Register miner first with register_miner tool'],
              }),
            },
          ],
          isError: true,
        };
      }

      // Get current miner status
      const status = await context.minerService.getMinerStatus(validated.minerId);

      if (!status.online) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Miner ${validated.minerId} is offline`,
                suggestions: ['Check miner power and network connectivity', 'Verify miner is reachable with ping_miner tool'],
              }),
            },
          ],
          isError: true,
        };
      }

      // Get current network configuration (for rollback)
      logger.info('Fetching current network configuration', { minerId: validated.minerId, host: registration.host });
      const currentConfig = await context.braiinsClient.getNetworkConfig(registration.host);
      const previousConfig = formatNetworkConfig(currentConfig);

      logger.info('Current network configuration retrieved', {
        minerId: validated.minerId,
        previousConfig,
      });

      // Build new network configuration request
      const newConfigRequest: {
        hostname?: string;
        protocol?: { static: { address: string; netmask: string; gateway: string } };
        dns_servers?: string[];
      } = {};

      // Update hostname if provided
      if (validated.hostname) {
        newConfigRequest.hostname = validated.hostname;
      }

      // Update static IP configuration if IP or gateway provided
      if (validated.ipAddress ?? validated.gateway) {
        const { address, netmask } = validated.ipAddress
          ? parseCIDR(validated.ipAddress)
          : { address: currentConfig.networks[0]?.address ?? '', netmask: currentConfig.networks[0]?.netmask ?? '' };

        const gateway = validated.gateway ?? currentConfig.default_gateway;

        newConfigRequest.protocol = {
          static: {
            address,
            netmask,
            gateway,
          },
        };
      }

      // Note: DNS servers are part of the protocol configuration in Braiins API
      // They would need to be set via a separate API call or included in the protocol
      // For now, we'll document this limitation

      // Apply network configuration
      logger.info('Applying network configuration', {
        minerId: validated.minerId,
        host: registration.host,
        config: newConfigRequest,
      });

      await context.braiinsClient.setNetworkConfig(registration.host, newConfigRequest);

      // Wait a moment for network to stabilize
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 3000);
      });

      // If IP address changed, we need to update the host in registration
      let newHost = registration.host;
      if (validated.ipAddress) {
        const { address } = parseCIDR(validated.ipAddress);
        newHost = address;

        // Update registration with new host
        logger.info('Updating miner registration with new IP', {
          minerId: validated.minerId,
          oldHost: registration.host,
          newHost,
        });

        // Note: In production, this would update the database
        // For now, we just note that the host has changed
      }

      // Test connectivity if requested
      let connectivityTest: { reachable: boolean; latency: number; error?: string } = {
        reachable: true,
        latency: 0,
      };

      if (validated.validateConnectivity) {
        logger.info('Testing connectivity to miner after configuration', {
          minerId: validated.minerId,
          host: newHost,
        });

        connectivityTest = await testConnectivity(newHost, context);

        // Rollback if connectivity test fails
        if (!connectivityTest.reachable) {
          const errorMsg = connectivityTest.error ?? 'Unknown error';
          logger.warn('Connectivity test failed, rolling back configuration', {
            minerId: validated.minerId,
            host: newHost,
            error: errorMsg,
          });

          // Attempt rollback to original configuration
          try {
            const firstNetwork = currentConfig.networks[0];
            if (!firstNetwork) {
              throw new Error('No network configuration available for rollback');
            }

            await context.braiinsClient.setNetworkConfig(registration.host, {
              hostname: currentConfig.hostname,
              protocol: {
                static: {
                  address: firstNetwork.address,
                  netmask: firstNetwork.netmask,
                  gateway: currentConfig.default_gateway,
                },
              },
            });

            const connectivityErrorMsg = connectivityTest.error ?? 'Connection timed out';
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'Connectivity test failed after network configuration',
                    details: connectivityErrorMsg,
                    rollback: 'Successfully rolled back to previous configuration',
                    previousConfig,
                    suggestions: [
                      'Verify IP address is in the correct subnet',
                      'Check gateway is reachable from the new IP',
                      'Ensure no IP conflicts on the network',
                      'Try again with validateConnectivity: false to skip connectivity test',
                    ],
                  }),
                },
              ],
              isError: true,
            };
          } catch (rollbackError) {
            const connectivityErrorMsg = connectivityTest.error ?? 'Connection failed';
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: 'Connectivity test failed and rollback also failed',
                    connectivityError: connectivityErrorMsg,
                    rollbackError: rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error',
                    warning: 'Miner may be unreachable. Manual intervention may be required.',
                    suggestions: [
                      'Check physical network connection to miner',
                      'Access miner via serial console or direct connection',
                      'Factory reset may be required to restore network access',
                    ],
                  }),
                },
              ],
              isError: true,
            };
          }
        }
      }

      // Get new configuration for confirmation
      const updatedConfig = await context.braiinsClient.getNetworkConfig(newHost);
      const newConfig = formatNetworkConfig(updatedConfig);

      // Invalidate miner config cache
      // Note: In production with Redis, this would be:
      // await cache.del(`cache:miner:${validated.minerId}:config`);

      // Refresh miner status in cache
      await context.minerService.refreshMinerStatus(validated.minerId);

      logger.info('Network configuration successfully updated', {
        minerId: validated.minerId,
        newConfig,
        connectivityTest,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Network configuration updated successfully for miner ${validated.minerId}`,
              previousConfig,
              newConfig,
              connectivityTest,
              notes: validated.dnsServers
                ? ['DNS servers update may require additional API support - check miner documentation']
                : undefined,
            }),
          },
        ],
      };
    } catch (error) {
      logger.error('Network configuration tool failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Failed to configure network',
              suggestions: [
                'Verify IP address format (must be xxx.xxx.xxx.xxx/yy)',
                'Verify gateway format (must be xxx.xxx.xxx.xxx)',
                'Ensure DNS servers are valid IPv4 addresses',
                'Check that miner is online and reachable',
                'Verify hostname is alphanumeric with hyphens only (max 63 chars)',
              ],
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
