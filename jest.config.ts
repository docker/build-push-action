module.exports = {
  clearMocks: false,
  moduleFileExtensions: ['js', 'ts'],
  setupFiles: ["dotenv/config"],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  verbose: true
}
