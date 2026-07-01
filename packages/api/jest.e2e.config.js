/** @type {import('jest').Config} */
module.exports = {
  displayName: 'e2e',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  testMatch: ['**/test/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@i9/types$': '<rootDir>/../types/src/index.ts',
  },
  globalSetup: './test/setup.ts',
  globalTeardown: './test/teardown.ts',
  // Global setup bootstraps a real NestJS app + DB; give each test suite plenty of time.
  testTimeout: 30000,
  // Run spec files sequentially: they share a single DB and app instance.
  maxWorkers: 1,
  // Close the NestJS app (DB + Redis) cleanly after all suites finish.
  setupFilesAfterEnv: ['./test/jest-setup-after-env.ts'],
};
