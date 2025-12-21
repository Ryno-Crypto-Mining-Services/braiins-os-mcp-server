/**
 * Environment Configuration Module
 *
 * Validates and loads configuration from environment variables using Zod.
 * Provides type-safe configuration access throughout the application.
 *
 * @module config/env
 */

import { z } from 'zod';

/**
 * Environment schema with validation rules and defaults.
 */
const envSchema = z.object({
  // Server settings
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Redis settings
  REDIS_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),

  // gRPC settings
  GRPC_DEFAULT_HOST: z.string().default('localhost'),
  GRPC_DEFAULT_PORT: z.string().transform(Number).default('50051'),
  GRPC_USE_TLS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Authentication settings
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRY: z.string().default('1h'),
  OAUTH_CLIENT_ID: z.string().optional(),
  OAUTH_CLIENT_SECRET: z.string().optional(),

  // Rate limiting
  RATE_LIMIT_REQUESTS: z.string().transform(Number).default('1000'),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
});

/**
 * Parsed environment type inferred from schema.
 */
type EnvConfig = z.infer<typeof envSchema>;

/**
 * Application configuration structure.
 */
export interface AppConfig {
  environment: 'development' | 'production' | 'test';
  port: number;
  transport: 'stdio' | 'http';
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  redis: {
    enabled: boolean;
    host: string;
    port: number;
    password?: string;
  };

  grpc: {
    defaultHost: string;
    defaultPort: number;
    useTls: boolean;
  };

  auth: {
    jwtSecret?: string;
    jwtExpiry: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
  };

  rateLimit: {
    requests: number;
    windowMs: number;
  };
}

/**
 * Transforms parsed environment variables into structured config.
 */
function transformToConfig(env: EnvConfig): AppConfig {
  return {
    environment: env.NODE_ENV,
    port: env.PORT,
    transport: env.TRANSPORT,
    logLevel: env.LOG_LEVEL,

    redis: {
      enabled: env.REDIS_ENABLED,
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    },

    grpc: {
      defaultHost: env.GRPC_DEFAULT_HOST,
      defaultPort: env.GRPC_DEFAULT_PORT,
      useTls: env.GRPC_USE_TLS,
    },

    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtExpiry: env.JWT_EXPIRY,
      oauthClientId: env.OAUTH_CLIENT_ID,
      oauthClientSecret: env.OAUTH_CLIENT_SECRET,
    },

    rateLimit: {
      requests: env.RATE_LIMIT_REQUESTS,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
    },
  };
}

/**
 * Loads and validates configuration from environment variables.
 *
 * @throws {Error} If required environment variables are missing or invalid
 * @returns Validated application configuration
 */
export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errorMessages = parsed.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  return transformToConfig(parsed.data);
}

/**
 * Gets a specific config value with type safety.
 * Useful for lazy loading of config values.
 */
export function getConfigValue<K extends keyof AppConfig>(key: K): AppConfig[K] {
  return loadConfig()[key];
}
