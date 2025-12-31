/**
 * Braiins OS Authentication Module
 *
 * Handles authentication token management for Braiins OS gRPC API.
 * Tokens expire after 3600 seconds of inactivity and need to be refreshed.
 *
 * @module api/grpc/auth
 */

import * as grpc from '@grpc/grpc-js';
import { createChildLogger } from '../../utils/logger';
import { createAuthenticationServiceClient } from './proto-loader';

const logger = createChildLogger({ module: 'grpc-auth' });

/**
 * Authentication token with expiration tracking
 */
export interface AuthToken {
  token: string;
  expiresAt: number; // Unix timestamp
  timeoutS: number; // Token timeout in seconds
}

/**
 * Login request interface for AuthenticationService
 */
interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Login response interface from AuthenticationService
 */
interface LoginResponse {
  token: string;
  timeoutS: number;
}

/**
 * AuthenticationService client interface with typed methods
 */
interface AuthenticationServiceClient extends grpc.Client {
  Login(
    request: LoginRequest,
    callback: (error: grpc.ServiceError | null, response: LoginResponse) => void
  ): grpc.ClientUnaryCall;
  Login(
    request: LoginRequest,
    metadata: grpc.Metadata,
    callback: (error: grpc.ServiceError | null, response: LoginResponse) => void
  ): grpc.ClientUnaryCall;
  Login(
    request: LoginRequest,
    metadata: grpc.Metadata,
    options: Partial<grpc.CallOptions>,
    callback: (error: grpc.ServiceError | null, response: LoginResponse) => void
  ): grpc.ClientUnaryCall;
}

/**
 * Token cache for miners
 */
const tokenCache = new Map<string, AuthToken>();

/**
 * Login to a Braiins OS miner and obtain an authentication token.
 *
 * @param host - Miner host address
 * @param port - Miner gRPC port (default: 50051)
 * @param username - Miner username (default: 'root')
 * @param password - Miner password
 * @param credentials - gRPC credentials (default: insecure)
 * @returns Authentication token
 */
export async function login(
  host: string,
  port: number = 50051,
  username: string = 'root',
  password: string,
  credentials: grpc.ChannelCredentials = grpc.credentials.createInsecure()
): Promise<AuthToken> {
  try {
    logger.debug('Logging in to miner', { host, port, username });

    const client = (await createAuthenticationServiceClient(host, port, credentials)) as AuthenticationServiceClient;

    // Call the Login RPC method
    const response = await new Promise<LoginResponse>((resolve, reject) => {
      client.Login(
        { username, password },
        (error: grpc.ServiceError | null, response: LoginResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });

    // Calculate expiration time (current time + timeout)
    const expiresAt = Date.now() + response.timeoutS * 1000;

    const authToken: AuthToken = {
      token: response.token,
      expiresAt,
      timeoutS: response.timeoutS,
    };

    // Cache the token
    const cacheKey = `${host}:${port}`;
    tokenCache.set(cacheKey, authToken);

    logger.info('Login successful', {
      host,
      port,
      tokenTimeout: response.timeoutS,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    // Close the authentication client
    client.close();

    return authToken;
  } catch (error) {
    logger.error('Login failed', {
      host,
      port,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error(`Login failed for ${host}:${port}: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

/**
 * Get a cached token for a miner if available and not expired.
 *
 * @param host - Miner host address
 * @param port - Miner gRPC port
 * @returns Cached token if available and valid, null otherwise
 */
export function getCachedToken(host: string, port: number = 50051): AuthToken | null {
  const cacheKey = `${host}:${port}`;
  const cached = tokenCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  // Check if token is expired (with 60s buffer)
  const now = Date.now();
  if (now >= cached.expiresAt - 60000) {
    logger.debug('Cached token expired', { host, port });
    tokenCache.delete(cacheKey);
    return null;
  }

  logger.debug('Using cached token', { host, port, expiresAt: new Date(cached.expiresAt).toISOString() });
  return cached;
}

/**
 * Get or create an authentication token for a miner.
 * Uses cached token if available and valid, otherwise logs in.
 *
 * @param host - Miner host address
 * @param port - Miner gRPC port
 * @param password - Miner password
 * @param username - Miner username (default: 'root')
 * @param credentials - gRPC credentials (default: insecure)
 * @returns Authentication token
 */
export async function getAuthToken(
  host: string,
  port: number = 50051,
  password: string,
  username: string = 'root',
  credentials: grpc.ChannelCredentials = grpc.credentials.createInsecure()
): Promise<AuthToken> {
  // Try cached token first
  const cached = getCachedToken(host, port);
  if (cached) {
    return cached;
  }

  // Login to get new token
  return login(host, port, username, password, credentials);
}

/**
 * Create gRPC metadata with authorization token.
 *
 * @param token - Authentication token
 * @returns gRPC Metadata with authorization header
 */
export function createAuthMetadata(token: string): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.add('authorization', token);
  return metadata;
}

/**
 * Clear cached tokens for a specific miner or all miners.
 *
 * @param host - Optional miner host to clear specific token
 * @param port - Optional miner port (default: 50051)
 */
export function clearTokenCache(host?: string, port: number = 50051): void {
  if (host) {
    const cacheKey = `${host}:${port}`;
    tokenCache.delete(cacheKey);
    logger.debug('Cleared token cache for miner', { host, port });
  } else {
    tokenCache.clear();
    logger.debug('Cleared all token cache');
  }
}
