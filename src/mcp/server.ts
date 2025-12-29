/**
 * MCP Server Module
 *
 * Creates and configures the Model Context Protocol server
 * with resources, tools, and prompts for miner management.
 *
 * @module mcp/server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createBraiinsClient, BraiinsClient } from '../api/braiins';
import { RedisClient } from '../cache/redis';
import { SERVER_INFO, MCP_SCHEMES } from '../config/constants';
import type { AppConfig } from '../config/env';
import { createMinerService, MinerService, MinerRegistration } from '../services/miner.service';
import { createChildLogger } from '../utils/logger';

const mcpLogger = createChildLogger({ module: 'mcp' });

/**
 * Dependencies for MCP server.
 */
export interface MCPDependencies {
  redis: RedisClient | null;
  config: AppConfig;
}

/**
 * MCP server with service access.
 */
export interface MCPServerWithServices {
  server: Server;
  minerService: MinerService;
  braiinsClient: BraiinsClient;
}

/**
 * Creates and configures the MCP server.
 *
 * @param deps - Server dependencies
 * @returns Configured MCP server instance with services
 */
export async function createMCPServer(deps: MCPDependencies): Promise<MCPServerWithServices> {
  // Create Braiins API client
  const braiinsClient = createBraiinsClient({
    defaultTimeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
  });

  // Create miner service
  const minerService = createMinerService(braiinsClient, deps.redis);

  const server = new Server(
    {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    }
  );

  // ==================== Resources ====================
  // Resources are things Claude can read

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    mcpLogger.debug('Listing resources');

    const miners = await minerService.getRegisteredMiners();

    // Build dynamic resource list
    const resources = [
      {
        uri: `${MCP_SCHEMES.MINER}list`,
        name: 'Miner List',
        description: 'List of all registered miners',
        mimeType: 'application/json',
      },
      {
        uri: `${MCP_SCHEMES.FLEET}status`,
        name: 'Fleet Status',
        description: 'Aggregated status of the mining fleet',
        mimeType: 'application/json',
      },
    ];

    // Add individual miner resources
    for (const miner of miners) {
      resources.push({
        uri: `${MCP_SCHEMES.MINER}${miner.id}`,
        name: `Miner: ${miner.name}`,
        description: `Status and configuration for ${miner.name} (${miner.host})`,
        mimeType: 'application/json',
      });
    }

    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    mcpLogger.debug('Reading resource', { uri });

    // Parse the URI to determine resource type
    if (uri.startsWith(MCP_SCHEMES.MINER)) {
      const path = uri.replace(MCP_SCHEMES.MINER, '');

      if (path === 'list') {
        const miners = await minerService.getRegisteredMiners();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                miners: miners.map((m) => ({
                  id: m.id,
                  name: m.name,
                  host: m.host,
                  tags: m.tags,
                })),
                total: miners.length,
              }),
            },
          ],
        };
      }

      // Single miner by ID
      try {
        const status = await minerService.getMinerStatus(path);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(status),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                minerId: path,
              }),
            },
          ],
        };
      }
    }

    if (uri.startsWith(MCP_SCHEMES.FLEET)) {
      const fleetStatus = await minerService.getFleetStatus();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(fleetStatus),
          },
        ],
      };
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  });

  // ==================== Tools ====================
  // Tools are things Claude can do

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    mcpLogger.debug('Listing tools');

    return {
      tools: [
        {
          name: 'register_miner',
          description: 'Register a new miner with the MCP server',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Unique identifier for the miner',
              },
              name: {
                type: 'string',
                description: 'Human-readable name for the miner',
              },
              host: {
                type: 'string',
                description: 'IP address or hostname of the miner',
              },
              port: {
                type: 'number',
                description: 'HTTP port (default: 80)',
              },
              username: {
                type: 'string',
                description: 'Login username (default: root)',
              },
              password: {
                type: 'string',
                description: 'Login password',
              },
              useTls: {
                type: 'boolean',
                description: 'Use HTTPS (default: false)',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional tags for organization',
              },
            },
            required: ['id', 'name', 'host', 'password'],
          },
        },
        {
          name: 'unregister_miner',
          description: 'Remove a miner from the MCP server',
          inputSchema: {
            type: 'object',
            properties: {
              minerId: {
                type: 'string',
                description: 'The miner ID to remove',
              },
            },
            required: ['minerId'],
          },
        },
        {
          name: 'get_miner_status',
          description: 'Get the current status of a miner including hashrate, temperature, pools, and errors',
          inputSchema: {
            type: 'object',
            properties: {
              minerId: {
                type: 'string',
                description: 'The unique identifier of the miner',
              },
              refresh: {
                type: 'boolean',
                description: 'Force refresh from device (bypass cache)',
              },
            },
            required: ['minerId'],
          },
        },
        {
          name: 'get_fleet_status',
          description: 'Get aggregated status for all registered miners',
          inputSchema: {
            type: 'object',
            properties: {
              tenantId: {
                type: 'string',
                description: 'Optional tenant ID to filter miners',
              },
            },
            required: [],
          },
        },
        {
          name: 'reboot_miner',
          description: 'Reboot a miner',
          inputSchema: {
            type: 'object',
            properties: {
              minerId: {
                type: 'string',
                description: 'The unique identifier of the miner',
              },
            },
            required: ['minerId'],
          },
        },
        {
          name: 'set_power_target',
          description: 'Set the power consumption target for a miner in watts',
          inputSchema: {
            type: 'object',
            properties: {
              minerId: {
                type: 'string',
                description: 'The unique identifier of the miner',
              },
              watts: {
                type: 'number',
                description: 'Target power consumption in watts',
              },
            },
            required: ['minerId', 'watts'],
          },
        },
        {
          name: 'set_hashrate_target',
          description: 'Set the hashrate target for a miner in TH/s',
          inputSchema: {
            type: 'object',
            properties: {
              minerId: {
                type: 'string',
                description: 'The unique identifier of the miner',
              },
              terahashPerSecond: {
                type: 'number',
                description: 'Target hashrate in TH/s',
              },
            },
            required: ['minerId', 'terahashPerSecond'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    mcpLogger.info('Tool called', { name, args });

    try {
      switch (name) {
        case 'register_miner': {
          const registration: MinerRegistration = {
            id: args?.id as string,
            name: args?.name as string,
            host: args?.host as string,
            port: args?.port as number | undefined,
            username: (args?.username as string) ?? 'root',
            password: args?.password as string,
            useTls: args?.useTls as boolean | undefined,
            tags: args?.tags as string[] | undefined,
          };

          await minerService.registerMiner(registration);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Miner '${registration.name}' registered successfully`,
                  minerId: registration.id,
                  host: registration.host,
                }),
              },
            ],
          };
        }

        case 'unregister_miner': {
          const minerId = args?.minerId as string;
          await minerService.unregisterMiner(minerId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Miner '${minerId}' unregistered`,
                }),
              },
            ],
          };
        }

        case 'get_miner_status': {
          const minerId = args?.minerId as string;
          const refresh = args?.refresh as boolean | undefined;

          const status = refresh ? await minerService.refreshMinerStatus(minerId) : await minerService.getMinerStatus(minerId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  ...status,
                }),
              },
            ],
          };
        }

        case 'get_fleet_status': {
          const tenantId = args?.tenantId as string | undefined;
          const fleetStatus = await minerService.getFleetStatus(tenantId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  ...fleetStatus,
                }),
              },
            ],
          };
        }

        case 'reboot_miner': {
          const minerId = args?.minerId as string;
          await minerService.rebootMiner(minerId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Reboot command sent to miner '${minerId}'`,
                  note: 'Miner will be temporarily offline during reboot',
                }),
              },
            ],
          };
        }

        case 'set_power_target': {
          const minerId = args?.minerId as string;
          const watts = args?.watts as number;

          await minerService.setPowerTarget(minerId, { watt: watts });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Power target set to ${watts}W for miner '${minerId}'`,
                  note: 'Tuner will adjust to reach target over time',
                }),
              },
            ],
          };
        }

        case 'set_hashrate_target': {
          const minerId = args?.minerId as string;
          const terahashPerSecond = args?.terahashPerSecond as number;

          await minerService.setHashrateTarget(minerId, {
            terahash_per_second: terahashPerSecond,
          });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Hashrate target set to ${terahashPerSecond} TH/s for miner '${minerId}'`,
                  note: 'Tuner will adjust to reach target over time',
                }),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      mcpLogger.error('Tool execution failed', { name, error });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  });

  mcpLogger.info('MCP server configured', {
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
  });

  return {
    server,
    minerService,
    braiinsClient,
  };
}
