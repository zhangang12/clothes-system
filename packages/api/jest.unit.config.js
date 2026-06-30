/** @type {import('jest').Config} */
module.exports = {
  displayName: 'unit',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage/unit',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@i9/types$': '<rootDir>/../../types/src/index.ts',
  },
};
