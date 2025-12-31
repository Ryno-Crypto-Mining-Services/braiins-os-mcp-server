/**
 * Shared validation utilities for MCP tools
 *
 * Consolidates common validation logic to ensure consistency across tools
 * and reduce code duplication.
 *
 * @module mcp/tools/validators
 */

/**
 * Safety constants for miner operations
 */
export const SAFETY_CONSTANTS = {
  /** Minimum fan speed to prevent overheating (30%) */
  MIN_FAN_SPEED: 30,
  /** Warning threshold for low fan speeds (40%) */
  WARNING_FAN_SPEED: 40,
  /** Maximum power limit in watts */
  MAX_POWER_LIMIT: 10000,
  /** Minimum power limit in watts */
  MIN_POWER_LIMIT: 0,
} as const;

/**
 * Validation result type
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Warning message (validation passes but user should be cautious) */
  warning?: string;
}

/**
 * Validate fan speed for safety.
 * Ensures fan speeds are within safe operating ranges to prevent hardware damage.
 *
 * @param fanSpeed - Fan speed percentage (0-100)
 * @param allowDangerous - Whether to allow dangerous fan speeds below 30% (default: false)
 * @returns Validation result with error or warning
 *
 * @example
 * ```typescript
 * const result = validateFanSpeed(25);
 * if (!result.valid) {
 *   throw new Error(result.error);
 * }
 * if (result.warning) {
 *   console.warn(result.warning);
 * }
 * ```
 */
export function validateFanSpeed(
  fanSpeed: number,
  allowDangerous = false
): ValidationResult {
  // Validate range
  if (fanSpeed < 0 || fanSpeed > 100) {
    return {
      valid: false,
      error: 'Fan speed must be between 0 and 100 percent',
    };
  }

  // Safety check: prevent overheating
  if (fanSpeed < SAFETY_CONSTANTS.MIN_FAN_SPEED) {
    if (allowDangerous) {
      return {
        valid: true,
        warning: `Fan speed ${fanSpeed}% is below safety minimum (${SAFETY_CONSTANTS.MIN_FAN_SPEED}%). Monitor temperatures closely to prevent hardware damage.`,
      };
    }
    return {
      valid: false,
      error: `Fan speed must be at least ${SAFETY_CONSTANTS.MIN_FAN_SPEED}% to prevent overheating`,
    };
  }

  // Warning for low but safe speeds
  if (fanSpeed < SAFETY_CONSTANTS.WARNING_FAN_SPEED) {
    return {
      valid: true,
      warning: `Fan speed ${fanSpeed}% is low. Monitor temperatures closely.`,
    };
  }

  return { valid: true };
}

/**
 * Validate fan speed range for auto mode.
 * Ensures minFanSpeed <= maxFanSpeed and both are safe.
 *
 * @param minFanSpeed - Minimum fan speed percentage
 * @param maxFanSpeed - Maximum fan speed percentage
 * @param allowDangerous - Whether to allow dangerous fan speeds (default: false)
 * @returns Validation result
 */
export function validateFanSpeedRange(
  minFanSpeed: number,
  maxFanSpeed: number,
  allowDangerous = false
): ValidationResult {
  // Validate min speed
  const minResult = validateFanSpeed(minFanSpeed, allowDangerous);
  if (!minResult.valid) {
    return {
      valid: false,
      error: `Invalid minFanSpeed: ${minResult.error}`,
    };
  }

  // Validate max speed
  const maxResult = validateFanSpeed(maxFanSpeed, true); // Max can be any safe value
  if (!maxResult.valid) {
    return {
      valid: false,
      error: `Invalid maxFanSpeed: ${maxResult.error}`,
    };
  }

  // Ensure min <= max
  if (minFanSpeed > maxFanSpeed) {
    return {
      valid: false,
      error: `minFanSpeed (${minFanSpeed}%) must be less than or equal to maxFanSpeed (${maxFanSpeed}%)`,
    };
  }

  // Return warning from min speed if present
  return minResult.warning
    ? {
        valid: true,
        warning: minResult.warning,
      }
    : { valid: true };
}

/**
 * Validate power limit.
 * Ensures power limit is within hardware capabilities.
 *
 * @param powerLimit - Power limit in watts
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validatePowerLimit(3000);
 * if (!result.valid) {
 *   throw new Error(result.error);
 * }
 * ```
 */
export function validatePowerLimit(powerLimit: number): ValidationResult {
  if (powerLimit < SAFETY_CONSTANTS.MIN_POWER_LIMIT) {
    return {
      valid: false,
      error: `Power limit must be at least ${SAFETY_CONSTANTS.MIN_POWER_LIMIT} watts`,
    };
  }

  if (powerLimit > SAFETY_CONSTANTS.MAX_POWER_LIMIT) {
    return {
      valid: false,
      error: `Power limit must not exceed ${SAFETY_CONSTANTS.MAX_POWER_LIMIT} watts`,
    };
  }

  return { valid: true };
}

/**
 * Validate IANA timezone string.
 * Uses Intl.DateTimeFormat to check if timezone is valid.
 *
 * @param timezone - IANA timezone string (e.g., 'America/New_York', 'UTC')
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateTimezone('America/New_York');
 * if (!result.valid) {
 *   throw new Error(result.error);
 * }
 * ```
 */
export function validateTimezone(timezone: string): ValidationResult {
  try {
    // Attempt to create a DateTimeFormat with the timezone
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid timezone '${timezone}'. Must be a valid IANA timezone (e.g., 'America/New_York', 'UTC')`,
    };
  }
}

/**
 * Validate batch size for operations affecting multiple miners.
 * Prevents overwhelming the system with too many concurrent operations.
 *
 * @param count - Number of miners in batch
 * @param maxBatchSize - Maximum allowed batch size (default: 100)
 * @returns Validation result
 */
export function validateBatchSize(
  count: number,
  maxBatchSize = 100
): ValidationResult {
  if (count < 1) {
    return {
      valid: false,
      error: 'At least one miner ID is required',
    };
  }

  if (count > maxBatchSize) {
    return {
      valid: false,
      error: `Maximum ${maxBatchSize} miners per batch. Got ${count}`,
    };
  }

  // Warning for large batches
  if (count > maxBatchSize * 0.5) {
    return {
      valid: true,
      warning: `Large batch size (${count} miners). This operation may take several minutes.`,
    };
  }

  return { valid: true };
}

/**
 * Validate cron expression format.
 * Supports standard 5-field cron format: minute hour day month weekday
 *
 * @param cron - Cron expression to validate
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = validateCronExpression('0 2 * * *'); // 2 AM daily
 * if (!result.valid) {
 *   throw new Error(result.error);
 * }
 * ```
 */
export function validateCronExpression(cron: string): ValidationResult {
  // Regex for standard 5-field cron format
  const cronRegex =
    /^(\*|([0-9]|[1-5][0-9])|\*\/([0-9]|[1-5][0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|[12][0-9]|3[01])|\*\/([1-9]|[12][0-9]|3[01])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|[0-6]|\*\/[0-6])$/;

  if (!cronRegex.test(cron)) {
    return {
      valid: false,
      error: "Invalid cron expression. Expected format: 'minute hour day month weekday' (e.g., '0 2 * * *')",
    };
  }

  return { valid: true };
}
