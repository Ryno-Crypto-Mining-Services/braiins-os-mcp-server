/**
 * gRPC Client Module
 *
 * Provides a gRPC client wrapper for Braiins OS+ miner communication
 * with connection management, retry logic, and error handling.
 *
 * @module api/grpc/client
 */

import * as grpc from '@grpc/grpc-js';
import { GRPC_CONFIG } from '../../config/constants';
import { GrpcConnectionError } from '../../utils/errors';
import { createChildLogger } from '../../utils/logger';
import { createAuthMetadata, getAuthToken } from './auth';
import {
  createCoolingServiceClient,
  createPerformanceServiceClient,
} from './proto-loader';

const grpcLogger = createChildLogger({ module: 'grpc' });

/**
 * gRPC client configuration options.
 */
export interface GrpcConfig {
  defaultHost: string;
  defaultPort: number;
  useTls: boolean;
  timeout?: number;
}

/**
 * Miner connection information.
 */
export interface MinerConnection {
  host: string;
  port: number;
}

/**
 * Cooling mode configuration
 */
export interface CoolingModeConfig {
  mode: 'auto' | 'manual';
  fanSpeed?: number; // For manual mode: 0-100
  minFanSpeed?: number; // For auto mode: 0-100
  maxFanSpeed?: number; // For auto mode: 0-100
  targetTemperature?: number; // For auto mode: target temp in Celsius
}

/**
 * Tuner state information
 */
export interface TunerState {
  enabled: boolean;
  mode: string;
  powerTarget?: number; // Watts
  hashrateTarget?: number; // TH/s
}

/**
 * gRPC proto message types for Braiins OS API
 */
interface Temperature {
  celsius: number;
}

interface Power {
  watt: number;
}

interface Hashrate {
  terahash: number;
}

interface CoolingManualMode {
  fan_speed_ratio: number;
  hot_temperature: Temperature;
  dangerous_temperature: Temperature;
  target_temperature: Temperature;
}

interface CoolingAutoMode {
  target_temperature: Temperature;
  hot_temperature: Temperature;
  dangerous_temperature: Temperature;
  min_fan_speed: number;
  max_fan_speed: number;
}

interface SetCoolingModeRequest {
  save_action: number;
  mode: { manual?: CoolingManualMode; auto?: CoolingAutoMode };
}

interface GetTunerStateResponse {
  tuner_enabled: boolean;
  tuner_mode: string;
  power_target?: Power;
  hashrate_target?: Hashrate;
}

interface SetPowerTargetRequest {
  save_action: number;
  power_target: Power;
}

/**
 * CoolingService client interface
 */
interface CoolingServiceClient extends grpc.Client {
  SetCoolingMode(
    request: SetCoolingModeRequest,
    metadata: grpc.Metadata,
    callback: (error: grpc.ServiceError | null) => void
  ): grpc.ClientUnaryCall;
}

/**
 * PerformanceService client interface
 */
interface PerformanceServiceClient extends grpc.Client {
  GetTunerState(
    request: Record<string, never>,
    metadata: grpc.Metadata,
    callback: (error: grpc.ServiceError | null, response: GetTunerStateResponse) => void
  ): grpc.ClientUnaryCall;
  SetPowerTarget(
    request: SetPowerTargetRequest,
    metadata: grpc.Metadata,
    callback: (error: grpc.ServiceError | null) => void
  ): grpc.ClientUnaryCall;
}

/**
 * gRPC client interface for miner operations.
 */
export interface GrpcClient {
  /**
   * Get miner status.
   */
  getMinerStatus(connection: MinerConnection): Promise<MinerStatus>;

  /**
   * List all hashboards.
   */
  getHashboards(connection: MinerConnection): Promise<Hashboard[]>;

  /**
   * Get current firmware version.
   */
  getFirmwareVersion(connection: MinerConnection): Promise<FirmwareInfo>;

  /**
   * Reboot the miner.
   */
  rebootMiner(connection: MinerConnection): Promise<void>;

  /**
   * Update miner configuration.
   */
  setConfiguration(connection: MinerConnection, config: MinerConfig): Promise<void>;

  /**
   * Start firmware update.
   */
  startFirmwareUpdate(connection: MinerConnection, firmwareUrl: string): Promise<string>;

  /**
   * Check firmware update progress.
   */
  getFirmwareUpdateProgress(connection: MinerConnection, taskId: string): Promise<UpdateProgress>;

  /**
   * Set cooling mode (fan control).
   */
  setCoolingMode(connection: MinerConnection, password: string, config: CoolingModeConfig): Promise<void>;

  /**
   * Get tuner state (performance/autotuning info).
   */
  getTunerState(connection: MinerConnection, password: string): Promise<TunerState>;

  /**
   * Set power target for tuner.
   */
  setPowerTarget(connection: MinerConnection, password: string, powerWatts: number): Promise<void>;

  /**
   * Test connection to a miner.
   */
  testConnection(connection: MinerConnection): Promise<boolean>;

  /**
   * Close all connections.
   */
  close(): Promise<void>;
}

/**
 * Miner status response.
 */
export interface MinerStatus {
  online: boolean;
  uptime: number;
  hashrate: number;
  temperature: number;
  fanSpeed: number;
  powerConsumption: number;
  efficiency: number;
  poolUrl: string;
  workerName: string;
  shares: {
    accepted: number;
    rejected: number;
    stale: number;
  };
}

/**
 * Hashboard information.
 */
export interface Hashboard {
  id: number;
  status: 'active' | 'disabled' | 'error';
  temperature: number;
  hashrate: number;
  chips: {
    total: number;
    active: number;
    disabled: number;
  };
}

/**
 * Firmware information.
 */
export interface FirmwareInfo {
  version: string;
  buildDate: string;
  model: string;
  features: string[];
}

/**
 * Miner configuration.
 */
export interface MinerConfig {
  poolUrl?: string;
  poolUser?: string;
  poolPassword?: string;
  frequency?: number;
  voltage?: number;
  fanSpeed?: number;
  autotuneEnabled?: boolean;
}

/**
 * Update progress information.
 */
export interface UpdateProgress {
  taskId: string;
  status: 'pending' | 'downloading' | 'installing' | 'rebooting' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
}

/**
 * Creates a gRPC client with the specified configuration.
 *
 * @param config - gRPC client configuration
 * @returns gRPC client instance
 */
export async function createGrpcClient(config: GrpcConfig): Promise<GrpcClient> {
  // Connection pool to reuse channels
  const connections = new Map<string, grpc.Channel>();

  /**
   * Gets or creates a gRPC channel for a miner.
   */
  function getChannel(connection: MinerConnection): grpc.Channel {
    const key = `${connection.host}:${connection.port}`;

    let channel = connections.get(key);
    if (!channel) {
      const credentials = config.useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();

      channel = new grpc.Channel(key, credentials, {
        'grpc.keepalive_time_ms': 30000,
        'grpc.keepalive_timeout_ms': 10000,
        'grpc.max_receive_message_length': 50 * 1024 * 1024, // 50MB
      });

      connections.set(key, channel);
      grpcLogger.debug('Created new gRPC channel', { host: connection.host, port: connection.port });
    }

    return channel;
  }

  /**
   * Execute a gRPC call with retry logic.
   */
  async function withRetry<T>(operation: string, connection: MinerConnection, fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let backoff: number = GRPC_CONFIG.INITIAL_BACKOFF_MS;

    for (let attempt = 1; attempt <= GRPC_CONFIG.MAX_RETRIES; attempt++) {
      try {
        grpcLogger.debug(`gRPC ${operation} attempt ${attempt}`, {
          host: connection.host,
          port: connection.port,
        });
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        grpcLogger.warn(`gRPC ${operation} failed (attempt ${attempt})`, {
          host: connection.host,
          port: connection.port,
          error: lastError.message,
        });

        if (attempt < GRPC_CONFIG.MAX_RETRIES) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, backoff);
          });
          backoff = Math.min(backoff * GRPC_CONFIG.BACKOFF_MULTIPLIER, GRPC_CONFIG.MAX_BACKOFF_MS);
        }
      }
    }

    throw new GrpcConnectionError(connection.host, connection.port, lastError?.message);
  }

  // Placeholder implementation - actual gRPC calls will be implemented
  // once proto files are added and types are generated

  return {
    async getMinerStatus(connection: MinerConnection): Promise<MinerStatus> {
      return withRetry('getMinerStatus', connection, async () => {
        // TODO: Implement actual gRPC call when proto types are generated
        grpcLogger.debug('getMinerStatus called', connection);
        throw new Error('Not implemented - waiting for proto file generation');
      });
    },

    async getHashboards(connection: MinerConnection): Promise<Hashboard[]> {
      return withRetry('getHashboards', connection, async () => {
        grpcLogger.debug('getHashboards called', connection);
        throw new Error('Not implemented - waiting for proto file generation');
      });
    },

    async getFirmwareVersion(connection: MinerConnection): Promise<FirmwareInfo> {
      return withRetry('getFirmwareVersion', connection, async () => {
        grpcLogger.debug('getFirmwareVersion called', connection);
        throw new Error('Not implemented - waiting for proto file generation');
      });
    },

    async rebootMiner(connection: MinerConnection): Promise<void> {
      return withRetry('rebootMiner', connection, async () => {
        grpcLogger.debug('rebootMiner called', connection);
        throw new Error('Not implemented - waiting for proto file generation');
      });
    },

    async setConfiguration(connection: MinerConnection, minerConfig: MinerConfig): Promise<void> {
      return withRetry('setConfiguration', connection, async () => {
        grpcLogger.debug('setConfiguration called', { ...connection, config: minerConfig });
        throw new Error('Not implemented - waiting for proto file generation');
      });
    },

    async startFirmwareUpdate(connection: MinerConnection, firmwareUrl: string): Promise<string> {
      return withRetry('startFirmwareUpdate', connection, async () => {
        grpcLogger.debug('startFirmwareUpdate called', { ...connection, firmwareUrl });
        throw new Error('Not implemented - waiting for proto file generation');
      });
    },

    async getFirmwareUpdateProgress(connection: MinerConnection, taskId: string): Promise<UpdateProgress> {
      return withRetry('getFirmwareUpdateProgress', connection, async () => {
        grpcLogger.debug('getFirmwareUpdateProgress called', { ...connection, taskId });
        throw new Error('Not implemented - waiting for proto file generation');
      });
    },

    async setCoolingMode(
      connection: MinerConnection,
      password: string,
      coolingConfig: CoolingModeConfig
    ): Promise<void> {
      return withRetry('setCoolingMode', connection, async () => {
        grpcLogger.debug('Setting cooling mode', { ...connection, config: coolingConfig });

        // Get authentication token
        const authToken = await getAuthToken(connection.host, connection.port, password);
        const metadata = createAuthMetadata(authToken.token);

        // Create CoolingService client
        const credentials = config.useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
        const client = (await createCoolingServiceClient(
          connection.host,
          connection.port,
          credentials
        )) as CoolingServiceClient;

        try {
          // Build the request based on mode
          const request: SetCoolingModeRequest = {
            save_action: 1, // SAVE_ACTION_SAVE_AND_APPLY
            mode:
              coolingConfig.mode === 'manual'
                ? {
                    manual: {
                      fan_speed_ratio: coolingConfig.fanSpeed ? coolingConfig.fanSpeed / 100 : 0.5,
                      hot_temperature: { celsius: 80 },
                      dangerous_temperature: { celsius: 95 },
                      target_temperature: { celsius: 75 },
                    },
                  }
                : {
                    auto: {
                      target_temperature: { celsius: coolingConfig.targetTemperature ?? 75 },
                      hot_temperature: { celsius: 80 },
                      dangerous_temperature: { celsius: 95 },
                      min_fan_speed: coolingConfig.minFanSpeed ?? 30,
                      max_fan_speed: coolingConfig.maxFanSpeed ?? 100,
                    },
                  },
          };

          // Call SetCoolingMode RPC
          await new Promise<void>((resolve, reject) => {
            client.SetCoolingMode(request, metadata, (error: grpc.ServiceError | null) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });

          grpcLogger.info('Cooling mode set successfully', { ...connection, mode: coolingConfig.mode });
        } finally {
          client.close();
        }
      });
    },

    async getTunerState(connection: MinerConnection, password: string): Promise<TunerState> {
      return withRetry('getTunerState', connection, async () => {
        grpcLogger.debug('Getting tuner state', connection);

        // Get authentication token
        const authToken = await getAuthToken(connection.host, connection.port, password);
        const metadata = createAuthMetadata(authToken.token);

        // Create PerformanceService client
        const credentials = config.useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
        const client = (await createPerformanceServiceClient(
          connection.host,
          connection.port,
          credentials
        )) as PerformanceServiceClient;

        try {
          // Call GetTunerState RPC
          const response = await new Promise<GetTunerStateResponse>((resolve, reject) => {
            client.GetTunerState({}, metadata, (error: grpc.ServiceError | null, response: GetTunerStateResponse) => {
              if (error) {
                reject(error);
              } else {
                resolve(response);
              }
            });
          });

          grpcLogger.info('Tuner state retrieved', connection);

          return {
            enabled: response.tuner_enabled ?? false,
            mode: response.tuner_mode ?? 'unknown',
            powerTarget: response.power_target?.watt,
            hashrateTarget: response.hashrate_target?.terahash,
          };
        } finally {
          client.close();
        }
      });
    },

    async setPowerTarget(connection: MinerConnection, password: string, powerWatts: number): Promise<void> {
      return withRetry('setPowerTarget', connection, async () => {
        grpcLogger.debug('Setting power target', { ...connection, powerWatts });

        // Get authentication token
        const authToken = await getAuthToken(connection.host, connection.port, password);
        const metadata = createAuthMetadata(authToken.token);

        // Create PerformanceService client
        const credentials = config.useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
        const client = (await createPerformanceServiceClient(
          connection.host,
          connection.port,
          credentials
        )) as PerformanceServiceClient;

        try {
          const request: SetPowerTargetRequest = {
            save_action: 1, // SAVE_ACTION_SAVE_AND_APPLY
            power_target: { watt: powerWatts },
          };

          // Call SetPowerTarget RPC
          await new Promise<void>((resolve, reject) => {
            client.SetPowerTarget(request, metadata, (error: grpc.ServiceError | null) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });

          grpcLogger.info('Power target set successfully', { ...connection, powerWatts });
        } finally {
          client.close();
        }
      });
    },

    async testConnection(connection: MinerConnection): Promise<boolean> {
      try {
        const channel = getChannel(connection);
        const state = channel.getConnectivityState(true);
        return state === grpc.connectivityState.READY || state === grpc.connectivityState.IDLE;
      } catch {
        return false;
      }
    },

    async close(): Promise<void> {
      for (const [key, channel] of connections) {
        channel.close();
        grpcLogger.debug('Closed gRPC channel', { key });
      }
      connections.clear();
    },
  };
}
