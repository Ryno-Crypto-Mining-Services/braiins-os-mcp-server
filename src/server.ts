/**
 * Server Module - Transport Setup and Lifecycle Management
 *
 * Handles STDIO and HTTP transport configuration for the MCP server.
 * Manages server lifecycle, health checks, and graceful shutdown.
 *
 * @module server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express, { Application } from 'express';
import helmet from 'helmet';
import { setupRoutes } from './api/rest/routes';
import { createRedisClient, RedisClient } from './cache/redis';
import type { AppConfig } from './config/env';
import { createMCPServer, MCPServerWithServices } from './mcp/server';
import { logger } from './utils/logger';

/**
 * Server wrapper that manages the MCP server and its dependencies.
 */
export interface AppServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  getApp(): Application | null;
  getMcpServer(): Server;
  getRedisClient(): RedisClient | null;
  getMcpServices(): MCPServerWithServices;
}

/**
 * Creates the application server with appropriate transport.
 *
 * @param config - Application configuration
 * @returns Server instance ready to start
 */
export async function createServer(config: AppConfig): Promise<AppServer> {
  let expressApp: Application | null = null;
  let redisClient: RedisClient | null = null;
  let httpServer: ReturnType<Application['listen']> | null = null;

  // Initialize Redis client if enabled
  if (config.redis.enabled) {
    try {
      redisClient = await createRedisClient({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
      });
      logger.info('Redis client connected');
    } catch (error) {
      logger.warn('Redis connection failed, continuing without cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Create MCP server with dependencies
  const mcpServices = await createMCPServer({
    redis: redisClient,
    config,
  });

  return {
    async start(): Promise<void> {
      if (config.transport === 'stdio') {
        // STDIO transport for local Claude Desktop integration
        const transport = new StdioServerTransport();
        await mcpServices.server.connect(transport);
        logger.info('MCP Server connected via STDIO transport');
      } else {
        // HTTP transport for remote connections
        expressApp = express();

        // Security middleware
        expressApp.use(helmet());
        // eslint-disable-next-line import/no-named-as-default-member
        expressApp.use(express.json());

        // Health check endpoint
        expressApp.get('/health', (_req, res) => {
          res.json({
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            dependencies: {
              redis: redisClient ? 'connected' : 'disabled',
            },
          });
        });

        // Readiness check
        expressApp.get('/ready', (_req, res) => {
          void (async () => {
            try {
              // Check Redis if enabled
              if (redisClient) {
                await redisClient.set('health:check', 'ok', 10);
              }
              res.json({ ready: true });
            } catch {
              res.status(503).json({ ready: false });
            }
          })();
        });

        // Setup REST API routes
        setupRoutes(expressApp, {
          redis: redisClient,
          braiins: mcpServices.braiinsClient,
          config,
        });

        // Start HTTP server
        httpServer = expressApp.listen(config.port, () => {
          logger.info(`HTTP Server listening on port ${config.port}`);
        });
      }
    },

    async stop(): Promise<void> {
      logger.info('Stopping server...');

      // Close HTTP server if running
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer!.close(() => resolve());
        });
        logger.info('HTTP server closed');
      }

      // Disconnect all miners
      mcpServices.minerService.disconnectAll();
      logger.info('Miner connections closed');

      // Close Redis connection
      if (redisClient) {
        await redisClient.quit();
        logger.info('Redis connection closed');
      }

      // Close MCP server
      await mcpServices.server.close();
      logger.info('MCP server closed');
    },

    getApp(): Application | null {
      return expressApp;
    },

    getMcpServer(): Server {
      return mcpServices.server;
    },

    getRedisClient(): RedisClient | null {
      return redisClient;
    },

    getMcpServices(): MCPServerWithServices {
      return mcpServices;
    },
  };
}
