/**
 * Braiins OS+ API Type Definitions
 *
 * Type definitions matching the Braiins OS Public REST API.
 * Based on API documentation: https://developer.braiins-os.com/
 *
 * @module api/braiins/types
 */

// ============================================================
// Common Types
// ============================================================

/**
 * Temperature measurement in Celsius.
 */
export interface Temperature {
  celsius: number;
}

/**
 * Power measurement in Watts.
 */
export interface Power {
  watt: number;
}

/**
 * Hashrate measurement.
 */
export interface Hashrate {
  terahash_per_second?: number;
  gigahash_per_second?: number;
}

/**
 * Timestamp with seconds and nanoseconds.
 */
export interface Timestamp {
  seconds: number;
  nanos: number;
}

/**
 * Frequency measurement in MHz.
 */
export interface Frequency {
  mhz: number;
}

/**
 * Voltage measurement in millivolts.
 */
export interface Voltage {
  millivolt: number;
}

// ============================================================
// Authentication
// ============================================================

/**
 * Login request payload.
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Login response with authentication token.
 */
export interface LoginResponse {
  token: string;
  timeout_s: number;
}

// ============================================================
// Miner Information
// ============================================================

/**
 * BOS firmware version details.
 */
export interface BosVersion {
  current: string;
  major: number;
  minor: number;
  patch: number;
  pre_release?: string;
  build_metadata?: string;
}

/**
 * Miner identity information.
 */
export interface MinerIdentity {
  brand: string;
  model: string;
  name: string;
}

/**
 * Power supply unit information.
 */
export interface PsuInfo {
  fans?: number;
  serial_number?: string;
  version?: string;
}

/**
 * Complete miner information response.
 */
export interface MinerInfo {
  uid: string;
  serial_number: string;
  hostname: string;
  mac_address: string;
  platform: number;
  bos_mode: number;
  bos_version: BosVersion;
  kernel_version: string;
  control_board_soc_family: number;
  miner_identity: MinerIdentity;
  psu_info?: PsuInfo;
  sticker_hashrate?: Hashrate;
  status: MinerStatusCode;
  system_uptime: number;
  system_uptime_s: number;
  bosminer_uptime_s: number;
}

/**
 * Miner status codes.
 */
export enum MinerStatusCode {
  Unknown = 0,
  Initializing = 1,
  Running = 2,
  Tuning = 3,
  Stopped = 4,
  Error = 5,
}

// ============================================================
// Errors
// ============================================================

/**
 * Error component (affected hardware).
 */
export interface ErrorComponent {
  name: string;
  index: number;
}

/**
 * Specific error code with details.
 */
export interface ErrorCode {
  code: string;
  reason: string;
  hint?: string;
}

/**
 * Error entry from the miner.
 */
export interface MinerError {
  message: string;
  timestamp: string;
  components: ErrorComponent[];
  error_codes: ErrorCode[];
}

/**
 * Errors response.
 */
export interface ErrorsResponse {
  errors: MinerError[];
}

// ============================================================
// Hashboards
// ============================================================

/**
 * Hashboard chip statistics.
 */
export interface ChipStats {
  total: number;
  active: number;
  disabled: number;
}

/**
 * Hashboard performance statistics.
 */
export interface HashboardStats {
  accepted_shares: number;
  rejected_shares: number;
  hardware_errors: number;
  hashrate?: Hashrate;
}

/**
 * Individual hashboard information.
 */
export interface HashboardInfo {
  id: string;
  board_name: string;
  model: string;
  serial_number?: string;
  enabled: boolean;
  chip_type: string;
  chips_count: number;
  current_voltage?: Voltage;
  current_frequency?: Frequency;
  board_temp?: Temperature;
  lowest_inlet_temp?: Temperature;
  highest_outlet_temp?: Temperature;
  highest_chip_temp?: Temperature;
  stats?: HashboardStats;
}

/**
 * Hashboards response.
 */
export interface HashboardsResponse {
  hashboards: HashboardInfo[];
}

/**
 * Hashboard enable/disable request.
 */
export interface HashboardEnableRequest {
  enable: boolean;
  hashboard_ids: string[];
}

/**
 * Hashboard enable/disable response.
 */
export interface HashboardEnableResponse {
  hashboards: Array<{
    id: string;
    is_enabled: boolean;
  }>;
}

// ============================================================
// Pools
// ============================================================

/**
 * Pool share statistics.
 */
export interface PoolStats {
  accepted_shares: number;
  rejected_shares: number;
  stale_shares: number;
  best_share: number;
  last_difficulty: number;
  generated_work: number;
  last_share_time?: Timestamp;
}

/**
 * Individual pool configuration.
 */
export interface PoolConfig {
  uid: string;
  url: string;
  user: string;
  password?: string;
  enabled: boolean;
  active?: boolean;
  alive?: boolean;
  stats?: PoolStats;
}

/**
 * Load balancing strategy.
 */
export interface LoadBalanceStrategy {
  fixedshareratio?: { value: number };
  quota?: { value: number };
  failover?: Record<string, unknown>;
}

/**
 * Pool group configuration.
 */
export interface PoolGroup {
  uid: string;
  name: string;
  pools: PoolConfig[];
  strategy?: LoadBalanceStrategy;
  load_balance_strategy?: LoadBalanceStrategy;
}

/**
 * Pools response (array of pool groups).
 */
export type PoolsResponse = PoolGroup[];

/**
 * Create pool group request.
 */
export interface CreatePoolGroupRequest {
  uid?: string;
  name: string;
  pools: Array<{
    uid?: string;
    url: string;
    user: string;
    password?: string;
    enabled: boolean;
  }>;
  load_balance_strategy?: LoadBalanceStrategy;
}

// ============================================================
// Performance Tuning
// ============================================================

/**
 * Hashrate target request/response.
 */
export interface HashrateTarget {
  terahash_per_second: number;
}

/**
 * Power target request/response.
 */
export interface PowerTarget {
  watt: number;
}

/**
 * Quick ramp configuration.
 */
export interface QuickRampConfig {
  up_s: number;
  down_s: number;
}

/**
 * Performance profile.
 */
export interface PerformanceProfile {
  target: Power;
  estimated_power_consumption: Power;
  measured_hashrate: Hashrate;
  created: Timestamp;
}

/**
 * Performance profiles response.
 */
export interface PerformanceProfilesResponse {
  power_target_profiles: PerformanceProfile[];
  hashrate_target_profiles: PerformanceProfile[];
}

/**
 * Tuner state values.
 */
export enum TunerState {
  Disabled = 0,
  Running = 1,
  Stable = 2,
  TestingPerformance = 3,
}

/**
 * Power target mode state.
 */
export interface PowerTargetModeState {
  current_target: Power;
  profile?: PerformanceProfile;
}

/**
 * Tuner state response.
 */
export interface TunerStateResponse {
  overall_tuner_state: TunerState;
  mode_state: {
    powertargetmodestate?: PowerTargetModeState;
    hashratetargetmodestate?: {
      current_target: Hashrate;
      profile?: PerformanceProfile;
    };
  };
}

// ============================================================
// Dynamic Performance Scaling (DPS)
// ============================================================

/**
 * DPS power target configuration.
 */
export interface DpsPowerTarget {
  min_power_target: Power;
  power_step: Power;
}

/**
 * DPS configuration request.
 */
export interface DpsConfigRequest {
  save_action: number;
  enable?: boolean;
  enable_shutdown?: boolean;
  mode?: number;
  shutdown_duration?: { hours: number };
  target?: {
    target: {
      powertarget?: DpsPowerTarget;
      hashratetarget?: {
        min_hashrate_target: Hashrate;
        hashrate_step: Hashrate;
      };
    };
  };
}

/**
 * DPS configuration response.
 */
export interface DpsConfigResponse {
  enabled: boolean;
  mode: number;
  shutdown_enabled: boolean;
  shutdown_duration?: { hours: number };
  power_target?: DpsPowerTarget;
  hashrate_target?: {
    min_hashrate_target: Hashrate;
    hashrate_step: Hashrate;
  };
}

// ============================================================
// Cooling
// ============================================================

/**
 * Cooling mode types.
 */
export type CoolingMode =
  | { auto: { target_temperature: Temperature } }
  | { manual: { fan_speed_percent: number } }
  | { immersion: Record<string, unknown> }
  | { hydro: { target_temperature: Temperature; hot_temperature?: Temperature; dangerous_temperature?: Temperature } };

/**
 * Cooling configuration request.
 */
export interface CoolingConfigRequest {
  mode: CoolingMode;
}

// ============================================================
// Network
// ============================================================

/**
 * Network address configuration.
 */
export interface NetworkAddress {
  address: string;
  netmask: string;
}

/**
 * Network protocol configuration.
 */
export type NetworkProtocol = { dhcp: Record<string, unknown> } | { static: { address: string; netmask: string; gateway: string } };

/**
 * Network configuration response.
 */
export interface NetworkConfigResponse {
  name: string;
  hostname: string;
  mac_address: string;
  protocol: number;
  networks: NetworkAddress[];
  default_gateway: string;
  dns_servers: string[];
}

/**
 * Network configuration request.
 */
export interface NetworkConfigRequest {
  hostname?: string;
  protocol?: NetworkProtocol;
}

// ============================================================
// System Operations
// ============================================================

/**
 * Contract key request.
 */
export interface ContractRequest {
  contract_key: string;
}

/**
 * Contract response.
 */
export interface ContractResponse {
  successful: boolean;
}

/**
 * Support archive format options.
 */
export type SupportArchiveFormat = 'zip' | 'bos' | 'zipencrypted';

// ============================================================
// API Client Types
// ============================================================

/**
 * Miner connection configuration.
 */
export interface MinerConnectionConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  useTls?: boolean;
  timeout?: number;
}

/**
 * API client options.
 */
export interface BraiinsClientOptions {
  defaultTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}
