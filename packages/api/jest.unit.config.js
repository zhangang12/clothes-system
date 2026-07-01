/** @type {import('jest').Config} */
module.exports = {
  displayName: 'unit',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: {
        types: ['jest', 'node'],
        typeRoots: ['/opt/node22/lib/node_modules/@types', './node_modules/@types'],
      },
    }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage/unit',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@i9/types$': '<rootDir>/../../types/src/index.ts',
  },
};
