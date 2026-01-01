/**
 * Shared Integration Test Utilities
 *
 * Reusable helpers for integration tests that use real services
 * with boundary mocking.
 *
 * @module tests/integration/helpers/integration-test-utils
 */

import type { JobService } from '../../../src/services/job.service';
import type { MinerStatusSummary } from '../../../src/services/miner.service';

/**
 * Wait for a job to reach a terminal state (completed or failed).
 *
 * Polls the job status at 100ms intervals until completion or timeout.
 *
 * @param jobService - The job service instance to poll
 * @param jobId - Job ID to monitor
 * @param timeoutMs - Maximum wait time in milliseconds (default: 10000)
 * @throws Error if job doesn't complete within timeout
 *
 * @example
 * const jobId = await startLongRunningJob();
 * await waitForJobCompletion(jobService, jobId, 30000);
 * const job = await jobService.getJob(jobId);
 * expect(job.status).toBe('completed');
 */
export async function waitForJobCompletion(
  jobService: JobService,
  jobId: string,
  timeoutMs: number = 10000
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const job = await jobService.getJob(jobId);
    if (job && (job.status === 'completed' || job.status === 'failed')) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  }
  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}

/**
 * Hashboard information structure for fixture creation.
 */
export interface HashboardFixture {
  id: string;
  board_name: string;
  model: string;
  enabled: boolean;
  chip_type: string;
  chips_count: number;
  stats: {
    accepted_shares: number;
    rejected_shares: number;
    hardware_errors: number;
    hashrate: { terahash_per_second: number };
  };
  highest_chip_temp: { celsius: number };
}

/**
 * Create a realistic hashboard fixture with sensible defaults.
 *
 * @param id - Hashboard ID (e.g., "hashboard-0")
 * @param hashrateTH - Hashrate in TH/s
 * @param tempC - Temperature in Celsius
 * @returns Complete hashboard object matching Braiins OS API structure
 *
 * @example
 * const board = createHashboard('hashboard-0', 32.5, 65);
 * expect(board.stats.hashrate.terahash_per_second).toBe(32.5);
 */
export function createHashboard(
  id: string,
  hashrateTH: number,
  tempC: number
): HashboardFixture {
  return {
    id,
    board_name: `Board ${id.split('-')[1] ?? '0'}`,
    model: 'S19',
    enabled: true,
    chip_type: 'BM1398',
    chips_count: 126,
    stats: {
      accepted_shares: 1000,
      rejected_shares: 5,
      hardware_errors: 2,
      hashrate: { terahash_per_second: hashrateTH },
    },
    highest_chip_temp: { celsius: tempC },
  };
}

/**
 * Tuner state structure for fixture creation.
 */
export interface TunerStateFixture {
  overall_tuner_state: number;
  mode_state: {
    powertargetmodestate: {
      current_target: { watt: number };
    };
  };
}

/**
 * Create a realistic tuner state fixture.
 *
 * @param powerWatts - Power consumption in watts
 * @returns Complete tuner state object matching Braiins OS API structure
 *
 * @example
 * const tuner = createTunerState(2500);
 * expect(tuner.mode_state.powertargetmodestate.current_target.watt).toBe(2500);
 */
export function createTunerState(powerWatts: number): TunerStateFixture {
  return {
    overall_tuner_state: 2, // TunerState.Stable
    mode_state: {
      powertargetmodestate: {
        current_target: { watt: powerWatts },
      },
    },
  };
}

/**
 * Create a realistic MinerStatusSummary fixture for testing.
 *
 * Provides sensible defaults for all fields matching a typical S19 miner
 * in low power mode. Use overrides parameter to customize specific fields.
 *
 * @param overrides - Partial overrides for specific fields
 * @returns Complete MinerStatusSummary matching production data structures
 *
 * @example
 * // Default S19 miner in low power mode
 * const status = createMinerStatusFixture();
 * expect(status.hashboards.hashboards).toHaveLength(3);
 *
 * @example
 * // Custom configuration
 * const hotMiner = createMinerStatusFixture({
 *   hashboards: {
 *     hashboards: [
 *       createHashboard('hashboard-0', 34.0, 85),
 *       createHashboard('hashboard-1', 33.5, 87)
 *     ]
 *   }
 * });
 */
export function createMinerStatusFixture(
  overrides?: Partial<MinerStatusSummary>
): MinerStatusSummary {
  const base: MinerStatusSummary = {
    id: 'miner-1',
    name: 'Test Miner 1',
    host: '192.168.1.100',
    online: true,
    lastUpdated: new Date().toISOString(),
    hashboards: {
      hashboards: [
        createHashboard('hashboard-0', 32.5, 62),
        createHashboard('hashboard-1', 31.8, 64),
        createHashboard('hashboard-2', 33.2, 63),
      ],
    },
    tunerState: createTunerState(2500), // Low power mode
  };

  return { ...base, ...overrides };
}
