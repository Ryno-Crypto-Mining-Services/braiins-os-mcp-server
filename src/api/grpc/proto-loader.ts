/**
 * Proto File Loader Module
 *
 * Handles loading Braiins OS proto files and creating gRPC service definitions
 * using @grpc/proto-loader for dynamic proto loading without code generation.
 *
 * @module api/grpc/proto-loader
 */

import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger({ module: 'proto-loader' });

/**
 * Proto loader options for consistent proto loading
 */
const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

/**
 * Root directory for proto files
 */
const PROTO_ROOT = join(__dirname, '../../../proto');

/**
 * Loaded proto package definitions cache
 */
const protoCache = new Map<string, grpc.GrpcObject>();

/**
 * Load a proto file and return the gRPC service definition.
 *
 * @param protoFile - Path to proto file relative to proto root (e.g., 'bos/v1/cooling.proto')
 * @returns Loaded proto package definition
 */
export async function loadProtoFile(protoFile: string): Promise<grpc.GrpcObject> {
  // Check cache first
  if (protoCache.has(protoFile)) {
    logger.debug('Using cached proto definition', { protoFile });
    return protoCache.get(protoFile)!;
  }

  const protoPath = join(PROTO_ROOT, protoFile);

  try {
    logger.debug('Loading proto file', { protoPath });

    // Load the proto file
    const packageDefinition = await protoLoader.load(protoPath, {
      ...PROTO_LOADER_OPTIONS,
      includeDirs: [PROTO_ROOT], // Allow imports from proto root
    });

    // Load the proto package definition into gRPC
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

    // Cache the result
    protoCache.set(protoFile, protoDescriptor);

    logger.info('Proto file loaded successfully', { protoFile });

    return protoDescriptor;
  } catch (error) {
    logger.error('Failed to load proto file', {
      protoFile,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error(`Failed to load proto file ${protoFile}: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

/**
 * Create a Braiins OS CoolingService client.
 *
 * @param host - Miner host address
 * @param port - Miner gRPC port
 * @param credentials - gRPC credentials (TLS or insecure)
 * @returns CoolingService client instance
 */
export async function createCoolingServiceClient(
  host: string,
  port: number,
  credentials: grpc.ChannelCredentials
): Promise<grpc.Client> {
  const proto = await loadProtoFile('bos/v1/cooling.proto');

  // Navigate the proto namespace: braiins.bos.v1.CoolingService
  const braiins = proto.braiins as grpc.GrpcObject;
  const bos = braiins.bos as grpc.GrpcObject;
  const v1 = bos.v1 as grpc.GrpcObject;
  const CoolingService = v1.CoolingService as grpc.ServiceClientConstructor;

  const client = new CoolingService(`${host}:${port}`, credentials);

  logger.debug('Created CoolingService client', { host, port });

  return client;
}

/**
 * Create a Braiins OS ConfigurationService client.
 *
 * @param host - Miner host address
 * @param port - Miner gRPC port
 * @param credentials - gRPC credentials (TLS or insecure)
 * @returns ConfigurationService client instance
 */
export async function createConfigurationServiceClient(
  host: string,
  port: number,
  credentials: grpc.ChannelCredentials
): Promise<grpc.Client> {
  const proto = await loadProtoFile('bos/v1/configuration.proto');

  const braiins = proto.braiins as grpc.GrpcObject;
  const bos = braiins.bos as grpc.GrpcObject;
  const v1 = bos.v1 as grpc.GrpcObject;
  const ConfigurationService = v1.ConfigurationService as grpc.ServiceClientConstructor;

  const client = new ConfigurationService(`${host}:${port}`, credentials);

  logger.debug('Created ConfigurationService client', { host, port });

  return client;
}

/**
 * Create a Braiins OS PerformanceService client.
 *
 * @param host - Miner host address
 * @param port - Miner gRPC port
 * @param credentials - gRPC credentials (TLS or insecure)
 * @returns PerformanceService client instance
 */
export async function createPerformanceServiceClient(
  host: string,
  port: number,
  credentials: grpc.ChannelCredentials
): Promise<grpc.Client> {
  const proto = await loadProtoFile('bos/v1/performance.proto');

  const braiins = proto.braiins as grpc.GrpcObject;
  const bos = braiins.bos as grpc.GrpcObject;
  const v1 = bos.v1 as grpc.GrpcObject;
  const PerformanceService = v1.PerformanceService as grpc.ServiceClientConstructor;

  const client = new PerformanceService(`${host}:${port}`, credentials);

  logger.debug('Created PerformanceService client', { host, port });

  return client;
}

/**
 * Create a Braiins OS AuthenticationService client.
 *
 * @param host - Miner host address
 * @param port - Miner gRPC port
 * @param credentials - gRPC credentials (TLS or insecure)
 * @returns AuthenticationService client instance
 */
export async function createAuthenticationServiceClient(
  host: string,
  port: number,
  credentials: grpc.ChannelCredentials
): Promise<grpc.Client> {
  const proto = await loadProtoFile('bos/v1/authentication.proto');

  const braiins = proto.braiins as grpc.GrpcObject;
  const bos = braiins.bos as grpc.GrpcObject;
  const v1 = bos.v1 as grpc.GrpcObject;
  const AuthenticationService = v1.AuthenticationService as grpc.ServiceClientConstructor;

  const client = new AuthenticationService(`${host}:${port}`, credentials);

  logger.debug('Created AuthenticationService client', { host, port });

  return client;
}

/**
 * Clear the proto cache. Useful for testing or reloading proto definitions.
 */
export function clearProtoCache(): void {
  protoCache.clear();
  logger.debug('Proto cache cleared');
}
