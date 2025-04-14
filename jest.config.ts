import type {Config} from '@jest/types';

const config: Config.InitialOptions = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(ts|js)$': 'babel-jest'
  },
  moduleNameMapper: {
    '^execa$': '<rootDir>/src/__mocks__/execa.ts',
    '^@buf/blacksmith_vm-agent.connectrpc_es/(.*)$': '<rootDir>/src/__mocks__/@buf/blacksmith_vm-agent.connectrpc_es/$1',
    '^@buf/blacksmith_vm-agent.bufbuild_es/(.*)$': '<rootDir>/src/__mocks__/@buf/blacksmith_vm-agent.bufbuild_es/$1'
  },
  verbose: true,
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/__tests__/**']
};

export default config;
