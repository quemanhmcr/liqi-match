module.exports = {
  displayName: 'unit',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(gif|jpe?g|png|webp)$': '<rootDir>/src/test/file-mock.cjs',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.unit.ts'],
  slowTestThreshold: 1,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testPathIgnorePatterns: ['\\.native\\.test\\.ts$'],
  testTimeout: 5_000,
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' },
          target: 'es2022',
          transform: { hidden: { jest: true } },
        },
        module: { type: 'commonjs' },
        sourceMaps: 'inline',
      },
    ],
  },
};
