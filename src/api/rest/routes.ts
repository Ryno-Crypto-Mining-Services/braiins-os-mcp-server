/**
 * REST API Routes Module
 *
 * Defines Express routes for the HTTP transport layer.
 * Provides REST API access to miner operations.
 *
 * @module api/rest/routes
 */

import { Application, Request, Response, NextFunction } from 'express';
import { RedisClient } from '../../cache/redis';
import type { AppConfig } from '../../config/env';
import { createMinerRepository, createMinerStatusRepository, IMinerRepository, IMinerStatusRepository } from '../../repositories';
import { wrapError, ValidationError } from '../../utils/errors';
import { createChildLogger } from '../../utils/logger';
import { BraiinsClient } from '../braiins';
import { createMinerController, createFleetController } from './controllers/miner.controller';

const routeLogger = createChildLogger({ module: 'rest' });

/**
 * Dependencies required for route handlers.
 */
export interface RouteDependencies {
  redis: RedisClient | null;
  braiins: BraiinsClient;
  config: AppConfig;
}

/**
 * Created repositories for dependency injection.
 */
export interface RouteRepositories {
  minerRepo: IMinerRepository;
  statusRepo: IMinerStatusRepository;
}

/**
 * Sets up all REST API routes on the Express application.
 *
 * @param app - Express application instance
 * @param deps - Route handler dependencies
 * @returns Created repositories for external access
 */
export function setupRoutes(app: Application, deps: RouteDependencies): RouteRepositories {
  // Create repositories
  const minerRepo = createMinerRepository(deps.redis);
  const statusRepo = createMinerStatusRepository(deps.braiins, minerRepo, deps.redis);

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    routeLogger.debug('Incoming request', {
      method: req.method,
      path: req.path,
      query: req.query,
    });
    next();
  });

  // ==================== API Version 1 ====================

  // Health check is defined in server.ts

  // Mount controllers
  const minerController = createMinerController({
    minerRepo,
    statusRepo,
    braiins: deps.braiins,
  });

  const fleetController = createFleetController({
    minerRepo,
    statusRepo,
    braiins: deps.braiins,
  });

  app.use('/api/v1/miners', minerController);
  app.use('/api/v1/fleet', fleetController);

  // ==================== Firmware Endpoints ====================

  /**
   * GET /api/v1/firmware
   * List available firmware versions.
   */
  app.get('/api/v1/firmware', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // TODO: Implement firmware listing (Week 5)
      routeLogger.info('List firmware versions');

      res.json({
        success: true,
        data: [],
        meta: {
          timestamp: new Date().toISOString(),
          note: 'Firmware listing will be implemented in Week 5',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/v1/firmware/update
   * Start a firmware update for multiple miners.
   */
  app.post('/api/v1/firmware/update', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { minerIds, version } = req.body as { minerIds?: string[]; version?: string };

      if (!minerIds || !Array.isArray(minerIds) || minerIds.length === 0) {
        throw new ValidationError('minerIds array is required');
      }

      if (!version) {
        throw new ValidationError('version is required');
      }

      // TODO: Implement firmware update (Week 5)
      routeLogger.info('Start firmware update', { minerIds, version });

      res.status(202).json({
        success: true,
        data: {
          taskId: `task-${Date.now()}`,
          minerIds,
          targetVersion: version,
          status: 'pending',
        },
        meta: {
          timestamp: new Date().toISOString(),
          note: 'Firmware update will be implemented in Week 5',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ==================== Task Endpoints ====================

  /**
   * GET /api/v1/tasks/:id
   * Get task status and progress.
   */
  app.get('/api/v1/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ValidationError('Task ID is required');
      }

      // TODO: Implement task progress retrieval (Week 5)
      routeLogger.info('Get task status', { taskId: id });

      res.json({
        success: true,
        data: {
          id,
          status: 'pending',
          progress: 0,
          message: 'Task pending',
        },
        meta: {
          timestamp: new Date().toISOString(),
          note: 'Task tracking will be implemented in Week 5',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // ==================== Error Handling ====================

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    });
  });

  // Global error handler
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const appError = wrapError(error);

    routeLogger.error('Request error', {
      code: appError.code,
      message: appError.message,
      statusCode: appError.statusCode,
    });

    res.status(appError.statusCode).json({
      success: false,
      ...appError.toJSON(),
    });
  });

  return { minerRepo, statusRepo };
}
