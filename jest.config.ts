module.exports = {
  clearMocks: false,
  moduleFileExtensions: ['js', 'ts'],
  setupFiles: ['dotenv/config'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  moduleNameMapper: {
    '^csv-parse/sync': '<rootDir>/node_modules/csv-parse/dist/cjs/sync.cjs'
  },
  verbose: true
};
