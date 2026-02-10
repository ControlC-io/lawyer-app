import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    profile: { findUnique: jest.fn(), update: jest.fn() },
    company: { findUnique: jest.fn() },
    userCompany: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    invitation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));

jest.mock('../services/email.service', () => ({
  emailService: { sendInvitation: jest.fn().mockResolvedValue(undefined) },
}));

describe('Users Endpoints', () => {
  const mockCompany = { id: 'company-123', name: 'Test Co', is_active: true, api_key: 'test-key' };
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/users/:userId', () => {
    it('should return user information when API key is valid', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.profile.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        full_name: 'Test User',
        email: 'test@example.com',
        user_companies: [{ 
          id: 'uc-1',
          company_id: 'company-123',
          role: 'user',
          company: { id: 'company-123', name: 'Test Co' }
        }],
        group_memberships: [],
      });

      const response = await request(app)
        .get('/api/users/user-123')
        .set('x-api-key', 'test-key');

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.full_name).toBe('Test User');
    });

    it('should return 401 when API key is missing', async () => {
      const response = await request(app).get('/api/users/user-123');
      expect(response.status).toBe(401);
    });

    it('should return 404 when user profile is not found', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.profile.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/user-123')
        .set('x-api-key', 'test-key');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('should return 403 when user does not belong to company', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.profile.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        full_name: 'Test',
        email: 'test@example.com',
        user_companies: [],
        group_memberships: [],
      });

      const response = await request(app)
        .get('/api/users/user-123')
        .set('x-api-key', 'test-key');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('POST /api/companies/:companyId/invitations', () => {
    const jwt = require('jsonwebtoken');

    it('should return 401 when no JWT', async () => {
      const response = await request(app)
        .post('/api/companies/company-123/invitations')
        .send({ email: 'new@example.com', role: 'user' });
      expect(response.status).toBe(401);
    });

    it('should return 400 when email or companyId missing', async () => {
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'admin@example.com' });

      const response = await request(app)
        .post('/api/companies/company-123/invitations')
        .set('Authorization', 'Bearer token')
        .send({ role: 'user' });
      expect(response.status).toBe(400);
    });

    it('should return 403 when user is not company admin', async () => {
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'admin@example.com' });
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/companies/company-123/invitations')
        .set('Authorization', 'Bearer token')
        .send({ email: 'new@example.com', role: 'user' });
      expect(response.status).toBe(403);
      expect(response.body.error).toContain('company admins');
    });

    it('should return 404 when company not found', async () => {
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'admin@example.com' });
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({ id: 'uc-1', role: 'company_admin' });
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/companies/company-123/invitations')
        .set('Authorization', 'Bearer token')
        .send({ email: 'new@example.com', role: 'user' });
      expect(response.status).toBe(404);
    });

    it('should create invitation and return 200', async () => {
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'admin@example.com' });
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({ id: 'uc-1', role: 'company_admin' });
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: 'company-123', name: 'Test Co' });
      (prisma.invitation.create as jest.Mock).mockResolvedValue({ id: 'inv-1' });

      const response = await request(app)
        .post('/api/companies/company-123/invitations')
        .set('Authorization', 'Bearer token')
        .send({ email: 'new@example.com', role: 'user' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            company_id: 'company-123',
            email: 'new@example.com',
            role: 'user',
          }),
        })
      );
    });
  });

  describe('POST /api/invitations/:token/accept', () => {
    const jwt = require('jsonwebtoken');

    it('should return 401 when no JWT', async () => {
      const response = await request(app)
        .post('/api/invitations/some-token/accept');
      expect(response.status).toBe(401);
    });

    it('should return 400 when token missing', async () => {
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'u@example.com' });

      const response = await request(app)
        .post('/api/invitations//accept')
        .set('Authorization', 'Bearer token');
      expect([400, 404]).toContain(response.status);
    });

    it('should return 404 when invitation not found', async () => {
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'u@example.com' });
      (prisma.invitation.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/invitations/valid-token/accept')
        .set('Authorization', 'Bearer token');
      expect(response.status).toBe(404);
    });

    it('should accept invitation and return 200', async () => {
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', email: 'u@example.com' });
      (prisma.invitation.findFirst as jest.Mock).mockResolvedValue({
        id: 'inv-1',
        company_id: 'company-123',
        role: 'user',
      });
      (prisma.userCompany.create as jest.Mock).mockResolvedValue({ id: 'uc-1' });
      (prisma.invitation.update as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .post('/api/invitations/valid-token/accept')
        .set('Authorization', 'Bearer token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.companyId).toBe('company-123');
      expect(prisma.invitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'accepted' },
        })
      );
    });
  });
});
