// Mock external services
jest.mock('../services/storage', () => ({
  storageService: {
    init: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn().mockReturnValue({}),
  }
}));

jest.mock('../services/email.service', () => ({
  emailService: {
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendInvitation: jest.fn().mockResolvedValue(undefined),
  }
}));

// Set up env variables for testing
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
