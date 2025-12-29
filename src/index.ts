/**
 * braiins-os-mcp-server - Main Entry Point
 *
 * Model Context Protocol server for Braiins OS+ miner management.
 * Enables Claude and other AI agents to interact with mining hardware.
 *
 * @module braiins-os-mcp-server
 */

import { loadConfig } from './config/env';
import { createServer } from './server';
import { logger } from './utils/logger';

/**
 * Bootstrap the MCP server application.
 */
async function main(): Promise<void> {
  try {
    // Load configuration from environment
    const config = loadConfig();

    logger.info('Starting braiins-os-mcp-server', {
      version: process.env.npm_package_version || '0.1.0',
      nodeVersion: process.version,
      environment: config.environment,
    });

    // Create and start the server
    const server = await createServer(config);

    // Graceful shutdown handling
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, initiating graceful shutdown...`);
      await server.stop();
      logger.info('Server stopped successfully');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    await server.start();

    logger.info('MCP Server listening', {
      transport: config.transport,
      port: config.port,
    });

    // Signal readiness for STDIO transport
    if (config.transport === 'stdio') {
      console.error('MCP Server listening on STDIO');
      console.error('Ready to receive requests from Claude');
    }
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

main();
