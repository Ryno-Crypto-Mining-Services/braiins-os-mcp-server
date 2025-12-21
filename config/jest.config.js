/**
 * Jest Configuration
 *
 * Test runner configuration for unit, integration, and E2E tests.
 */

/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest for TypeScript support
  preset: 'ts-jest',

  // Test environment
  testEnvironment: 'node',

  // Root directories
  roots: ['<rootDir>/../tests', '<rootDir>/../src'],

  // Test file patterns
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],

  // Module paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
    '^@config/(.*)$': '<rootDir>/../src/config/$1',
    '^@utils/(.*)$': '<rootDir>/../src/utils/$1',
    '^@api/(.*)$': '<rootDir>/../src/api/$1',
    '^@mcp/(.*)$': '<rootDir>/../src/mcp/$1',
    '^@cache/(.*)$': '<rootDir>/../src/cache/$1',
    '^@models/(.*)$': '<rootDir>/../src/models/$1',
    '^@types/(.*)$': '<rootDir>/../src/types/$1',
  },

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.json',
      },
    ],
  },

  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/../src/**/*.ts',
    '!<rootDir>/../src/**/*.d.ts',
    '!<rootDir>/../src/types/**',
  ],
  coverageDirectory: '<rootDir>/../coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/../tests/setup.ts'],

  // Test timeout
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Force exit after tests
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks automatically
  restoreMocks: true,
};
