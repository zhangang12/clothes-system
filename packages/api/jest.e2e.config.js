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
};
