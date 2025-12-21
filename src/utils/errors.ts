/**
 * Custom Error Classes
 *
 * Provides domain-specific error types with error codes,
 * HTTP status codes, and retryability information.
 *
 * @module utils/errors
 */

import { ERROR_CODES, HTTP_STATUS } from '../config/constants';

/**
 * Base application error class.
 * All custom errors should extend this class.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, retryable = false, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serializes the error for API responses.
   */
  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        details: this.details,
      },
    };
  }
}

/**
 * Validation error for invalid input data.
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ERROR_CODES.VALIDATION_ERROR, message, HTTP_STATUS.BAD_REQUEST, false, details);
  }
}

/**
 * Resource not found error.
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(ERROR_CODES.RESOURCE_NOT_FOUND, `${resource} with ID '${id}' not found`, HTTP_STATUS.NOT_FOUND, false, {
      resource,
      id,
    });
  }
}

/**
 * Authentication error.
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(ERROR_CODES.UNAUTHORIZED, message, HTTP_STATUS.UNAUTHORIZED, false);
  }
}

/**
 * Authorization error.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(ERROR_CODES.FORBIDDEN, message, HTTP_STATUS.FORBIDDEN, false);
  }
}

/**
 * Rate limiting error.
 */
export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(ERROR_CODES.RATE_LIMITED, 'Rate limit exceeded. Please try again later.', HTTP_STATUS.TOO_MANY_REQUESTS, true, {
      retryAfterSeconds,
    });
  }
}

// ============================================================
// Miner-specific errors
// ============================================================

/**
 * Miner not found error.
 */
export class MinerNotFoundError extends AppError {
  constructor(minerId: string) {
    super(ERROR_CODES.MINER_NOT_FOUND, `Miner '${minerId}' not found`, HTTP_STATUS.NOT_FOUND, false, {
      minerId,
    });
  }
}

/**
 * Miner offline error.
 */
export class MinerOfflineError extends AppError {
  constructor(minerId: string) {
    super(ERROR_CODES.MINER_OFFLINE, `Miner '${minerId}' is offline`, HTTP_STATUS.SERVICE_UNAVAILABLE, true, {
      minerId,
    });
  }
}

/**
 * Miner busy error (e.g., firmware update in progress).
 */
export class MinerBusyError extends AppError {
  constructor(minerId: string, operation: string) {
    super(ERROR_CODES.MINER_BUSY, `Miner '${minerId}' is busy with operation: ${operation}`, HTTP_STATUS.CONFLICT, true, {
      minerId,
      operation,
    });
  }
}

/**
 * Firmware incompatibility error.
 */
export class FirmwareIncompatibleError extends AppError {
  constructor(minerId: string, currentVersion: string, targetVersion: string) {
    super(
      ERROR_CODES.FIRMWARE_INCOMPATIBLE,
      `Cannot upgrade miner '${minerId}' from ${currentVersion} to ${targetVersion}`,
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      false,
      {
        minerId,
        currentVersion,
        targetVersion,
      }
    );
  }
}

/**
 * Firmware update failure error.
 */
export class FirmwareUpdateError extends AppError {
  constructor(minerId: string, reason: string) {
    super(ERROR_CODES.FIRMWARE_UPDATE_FAILED, `Firmware update failed for miner '${minerId}': ${reason}`, HTTP_STATUS.INTERNAL_SERVER_ERROR, true, {
      minerId,
      reason,
    });
  }
}

// ============================================================
// Connection errors
// ============================================================

/**
 * gRPC connection error.
 */
export class GrpcConnectionError extends AppError {
  constructor(host: string, port: number, reason?: string) {
    super(
      ERROR_CODES.GRPC_CONNECTION_FAILED,
      `Cannot connect to gRPC server at ${host}:${port}${reason ? `: ${reason}` : ''}`,
      HTTP_STATUS.BAD_GATEWAY,
      true,
      {
        host,
        port,
        reason,
      }
    );
  }
}

/**
 * gRPC timeout error.
 */
export class GrpcTimeoutError extends AppError {
  constructor(host: string, port: number, timeoutMs: number) {
    super(ERROR_CODES.GRPC_TIMEOUT, `gRPC request to ${host}:${port} timed out after ${timeoutMs}ms`, HTTP_STATUS.GATEWAY_TIMEOUT, true, {
      host,
      port,
      timeoutMs,
    });
  }
}

/**
 * Redis connection error.
 */
export class RedisConnectionError extends AppError {
  constructor(host: string, port: number, reason?: string) {
    super(
      ERROR_CODES.REDIS_CONNECTION_FAILED,
      `Cannot connect to Redis at ${host}:${port}${reason ? `: ${reason}` : ''}`,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      true,
      {
        host,
        port,
        reason,
      }
    );
  }
}

// ============================================================
// Utility functions
// ============================================================

/**
 * Determines if an error is retryable.
 *
 * @param error - Error to check
 * @returns true if the error can be retried
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.retryable;
  }
  return false;
}

/**
 * Wraps an unknown error in an AppError.
 *
 * @param error - Error to wrap
 * @returns Wrapped AppError instance
 */
export function wrapError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(ERROR_CODES.INTERNAL_ERROR, error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR, false, {
      originalError: error.name,
      stack: error.stack,
    });
  }

  return new AppError(ERROR_CODES.INTERNAL_ERROR, String(error), HTTP_STATUS.INTERNAL_SERVER_ERROR, false);
}
