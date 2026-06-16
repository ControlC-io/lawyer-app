import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

describe('Public Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
  });

  describe('GET /api/health', () => {
    it('should return 200 and status ok when database is connected', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('connected');
    });

    it('should return 500 when database query fails', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.database).toBe('disconnected');
    });
  });

  describe('GET /api/public/config', () => {
    it('should return signupEnabled true when ENABLE_PUBLIC_SIGNUP is "true"', async () => {
      process.env.ENABLE_PUBLIC_SIGNUP = 'true';
      const response = await request(app).get('/api/public/config');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ signupEnabled: true });
    });

    it('should return signupEnabled false when ENABLE_PUBLIC_SIGNUP is not "true"', async () => {
      process.env.ENABLE_PUBLIC_SIGNUP = 'false';
      const response = await request(app).get('/api/public/config');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ signupEnabled: false });
    });

    it('should return signupEnabled false when ENABLE_PUBLIC_SIGNUP is unset', async () => {
      delete process.env.ENABLE_PUBLIC_SIGNUP;
      const response = await request(app).get('/api/public/config');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ signupEnabled: false });
    });
  });
});
