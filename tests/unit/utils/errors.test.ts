/**
 * Error Classes Unit Tests
 */

import { AppError, ValidationError, NotFoundError, MinerNotFoundError, GrpcConnectionError, isRetryable, wrapError } from '../../../src/utils/errors';
import { ERROR_CODES, HTTP_STATUS } from '../../../src/config/constants';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with all properties', () => {
      const error = new AppError('TEST_ERROR', 'Test message', 400, true, { key: 'value' });

      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.retryable).toBe(true);
      expect(error.details).toEqual({ key: 'value' });
      expect(error.name).toBe('AppError');
    });

    it('should serialize to JSON correctly', () => {
      const error = new AppError('TEST_ERROR', 'Test message', 400, false, { id: '123' });
      const json = error.toJSON();

      expect(json).toEqual({
        error: {
          code: 'TEST_ERROR',
          message: 'Test message',
          statusCode: 400,
          details: { id: '123' },
        },
      });
    });

    it('should have default values', () => {
      const error = new AppError('CODE', 'message');

      expect(error.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(error.retryable).toBe(false);
      expect(error.details).toBeUndefined();
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct properties', () => {
      const error = new ValidationError('Invalid input');

      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(error.retryable).toBe(false);
    });

    it('should include details when provided', () => {
      const error = new ValidationError('Field required', { field: 'email' });

      expect(error.details).toEqual({ field: 'email' });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource info', () => {
      const error = new NotFoundError('Miner', '123');

      expect(error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
      expect(error.message).toBe("Miner with ID '123' not found");
      expect(error.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      expect(error.details).toEqual({ resource: 'Miner', id: '123' });
    });
  });

  describe('MinerNotFoundError', () => {
    it('should create miner not found error', () => {
      const error = new MinerNotFoundError('miner-abc');

      expect(error.code).toBe(ERROR_CODES.MINER_NOT_FOUND);
      expect(error.message).toBe("Miner 'miner-abc' not found");
      expect(error.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      expect(error.retryable).toBe(false);
    });
  });

  describe('GrpcConnectionError', () => {
    it('should create gRPC connection error', () => {
      const error = new GrpcConnectionError('192.168.1.100', 50051, 'Connection refused');

      expect(error.code).toBe(ERROR_CODES.GRPC_CONNECTION_FAILED);
      expect(error.message).toContain('192.168.1.100:50051');
      expect(error.message).toContain('Connection refused');
      expect(error.statusCode).toBe(HTTP_STATUS.BAD_GATEWAY);
      expect(error.retryable).toBe(true);
    });

    it('should work without reason', () => {
      const error = new GrpcConnectionError('localhost', 50051);

      expect(error.message).toBe('Cannot connect to gRPC server at localhost:50051');
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable errors', () => {
      const error = new GrpcConnectionError('localhost', 50051);
      expect(isRetryable(error)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const error = new ValidationError('Invalid input');
      expect(isRetryable(error)).toBe(false);
    });

    it('should return false for non-AppError', () => {
      expect(isRetryable(new Error('standard error'))).toBe(false);
      expect(isRetryable('string error')).toBe(false);
      expect(isRetryable(null)).toBe(false);
    });
  });

  describe('wrapError', () => {
    it('should return AppError as-is', () => {
      const original = new ValidationError('test');
      const wrapped = wrapError(original);

      expect(wrapped).toBe(original);
    });

    it('should wrap standard Error', () => {
      const original = new Error('standard error');
      const wrapped = wrapError(original);

      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(wrapped.message).toBe('standard error');
    });

    it('should wrap string error', () => {
      const wrapped = wrapError('string error');

      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.message).toBe('string error');
    });
  });
});
