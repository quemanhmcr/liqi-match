module.exports = {
  displayName: 'native',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  preset: 'jest-expo',
  resolver: 'react-native-worklets/jest/resolver',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  slowTestThreshold: 3,
  testMatch: [
    '<rootDir>/src/**/*.test.tsx',
    '<rootDir>/src/**/*.native.test.ts',
  ],
};
