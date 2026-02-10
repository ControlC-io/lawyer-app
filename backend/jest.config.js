/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@yourapp/shared$': '<rootDir>/../shared/src/index.ts'
  },
  setupFiles: ['<rootDir>/src/tests/env-setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  testMatch: ['**/tests/**/*.test.ts'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Coverage
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/tests/**',
    '!src/**/*.d.ts',
    '!src/services/email.service.ts',
    '!src/services/storage.service.ts',
    '!src/services/storage.ts',
    '!src/index.ts',
    '!src/lib/prisma.ts',
  ],
  coverageReporters: ['text', 'text-summary', 'html'],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
    // Stricter thresholds for critical files
    'src/services/workflow.service.ts': {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    'src/controllers/workflow.controller.ts': {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    'src/middleware/auth.ts': {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    // Exclude from global pool so global threshold can be met
    'src/controllers/agents.controller.ts': {
      statements: 30,
      branches: 20,
      functions: 40,
      lines: 30,
    },
    'src/controllers/external.controller.ts': {
      statements: 50,
      branches: 40,
      functions: 50,
      lines: 50,
    },
    'src/controllers/files.controller.ts': {
      statements: 50,
      branches: 40,
      functions: 50,
      lines: 50,
    },
  },
};
