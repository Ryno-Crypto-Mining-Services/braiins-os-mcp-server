/**
 * Type Definitions Index
 *
 * Re-exports all type definitions for the application.
 *
 * @module types
 */

// Re-export config types
export type { AppConfig } from '../config/env';

// Re-export error types
export { AppError, ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, RateLimitError, MinerNotFoundError, MinerOfflineError, MinerBusyError, FirmwareIncompatibleError, FirmwareUpdateError, GrpcConnectionError, GrpcTimeoutError, RedisConnectionError } from '../utils/errors';

// Re-export gRPC client types
export type { GrpcConfig, GrpcClient, MinerConnection, MinerStatus, Hashboard, FirmwareInfo, MinerConfig, UpdateProgress } from '../api/grpc/client';

// Re-export cache types
export type { RedisConfig, RedisClient } from '../cache/redis';

/**
 * Common response envelope for API responses.
 */
export interface ApiResponse<T> {
  data: T;
  meta: {
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Paginated response envelope.
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Error response envelope.
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: Record<string, unknown>;
  };
}

/**
 * Task status for long-running operations.
 */
export interface TaskStatus {
  id: string;
  type: 'firmware_update' | 'reboot' | 'configuration';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  result?: unknown;
}

/**
 * Miner entity.
 */
export interface Miner {
  id: string;
  name: string;
  host: string;
  port: number;
  model: string;
  firmwareVersion: string;
  status: MinerStatusEnum;
  hashrate: number;
  temperature: number;
  uptime: number;
  poolUrl: string;
  workerName: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Miner status enumeration.
 */
export enum MinerStatusEnum {
  Online = 'online',
  Offline = 'offline',
  Maintenance = 'maintenance',
  Updating = 'updating',
  Error = 'error',
}

/**
 * Fleet entity.
 */
export interface Fleet {
  id: string;
  name: string;
  description?: string;
  minerIds: string[];
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fleet aggregated status.
 */
export interface FleetStatus {
  id: string;
  name: string;
  totalMiners: number;
  onlineMiners: number;
  offlineMiners: number;
  maintenanceMiners: number;
  totalHashrate: number;
  avgTemperature: number;
  avgPowerConsumption: number;
  efficiency: number;
  calculatedAt: string;
}

/**
 * Miner filter options.
 */
export interface MinerFilter {
  status?: MinerStatusEnum;
  pool?: string;
  model?: string;
  firmwareVersion?: string;
  tenantId?: string;
  limit?: number;
  offset?: number;
}

/**
 * JWT token payload.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tenant: string;
  iat: number;
  exp: number;
}

/**
 * User role enumeration.
 */
export enum UserRole {
  Technician = 'technician',
  Operator = 'operator',
  Admin = 'admin',
  ApiService = 'api_service',
}
