import { Request, Response } from 'express';
import {
  authMiddleware,
  internalAuth,
  apiKeyAuth,
  externalStepAuth,
  optionalAuth,
  AuthRequest,
  SUPER_ADMIN_API_USER_ID,
} from '../middleware/auth';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    workflowExecutionStep: { findFirst: jest.fn() },
  },
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

const jwt = require('jsonwebtoken');

function mockRequest(overrides: Partial<Request> = {}): AuthRequest {
  return {
    headers: {},
    params: {},
    ...overrides,
  } as AuthRequest;
}

function mockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnThis();
  res.json = jest.fn().mockReturnThis();
  return res;
}

function mockNext() {
  return jest.fn();
}

describe('auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.JWT_SECRET = 'test-secret';
    process.env.INTERNAL_API_KEY = 'internal-secret';
    delete process.env.SUPER_ADMIN_API_KEY;
  });

  describe('authMiddleware', () => {
    it('calls next() with super_admin user when x-super-admin-api-key matches', async () => {
      process.env.SUPER_ADMIN_API_KEY = 'super-secret-key';
      const req = mockRequest({ headers: { 'x-super-admin-api-key': 'super-secret-key' } });
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(req.user).toEqual({
        id: SUPER_ADMIN_API_USER_ID,
        email: 'superadmin@api',
        super_admin: true,
      });
      expect(next).toHaveBeenCalled();
      expect(prisma.company.findUnique).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 401 when x-super-admin-api-key is wrong', async () => {
      process.env.SUPER_ADMIN_API_KEY = 'super-secret-key';
      const req = mockRequest({ headers: { 'x-super-admin-api-key': 'wrong-key' } });
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('ignores x-super-admin-api-key when SUPER_ADMIN_API_KEY env is not set', async () => {
      const req = mockRequest({ headers: { 'x-super-admin-api-key': 'any-key' } });
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('calls next() when API key is valid and company is active', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: 'company-1',
        name: 'Acme',
        is_active: true,
      });
      const req = mockRequest({ headers: { 'x-api-key': 'valid-key' } });
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { api_key: 'valid-key' } });
      expect(req.company).toEqual({ id: 'company-1', name: 'Acme' });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 401 when API key company not found', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      const req = mockRequest({ headers: { 'x-api-key': 'unknown-key' } });
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('returns 401 when API key company is inactive', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: 'company-1',
        name: 'Acme',
        is_active: false,
      });
      const req = mockRequest({ headers: { 'x-api-key': 'key' } });
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when API key lookup throws', async () => {
      (prisma.company.findUnique as jest.Mock).mockRejectedValue(new Error('DB error'));
      const req = mockRequest({ headers: { 'x-api-key': 'key' } });
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('calls next() when JWT is valid and user found', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'u@example.com',
      });
      const req = mockRequest({
        headers: { authorization: 'Bearer token' },
      });
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('token', expect.any(String));
      expect(req.user).toEqual({ id: 'user-1', email: 'u@example.com' });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 401 when JWT is invalid or expired', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });
      const req = mockRequest({ headers: { authorization: 'Bearer bad-token' } });
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when JWT valid but user not found', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const req = mockRequest({ headers: { authorization: 'Bearer token' } });
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when no API key and no valid JWT', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized: Missing or invalid authentication',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('internalAuth', () => {
    it('returns 500 when INTERNAL_API_KEY is not configured', () => {
      jest.isolateModules(() => {
        const orig = process.env.INTERNAL_API_KEY;
        delete process.env.INTERNAL_API_KEY;
        const { internalAuth: internalAuthReloaded } = require('../middleware/auth');
        const req = mockRequest();
        const res = mockResponse();
        const next = mockNext();

        internalAuthReloaded(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Internal API key not configured',
        });
        expect(next).not.toHaveBeenCalled();
        process.env.INTERNAL_API_KEY = orig;
      });
    });

    it('calls next() when internal key is valid', () => {
      const req = mockRequest({ headers: { 'x-internal-api-key': 'internal-secret' } });
      const res = mockResponse();
      const next = mockNext();

      internalAuth(req, res, next);

      expect(req.isInternal).toBe(true);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 401 when internal key is invalid', () => {
      const req = mockRequest({ headers: { 'x-internal-api-key': 'wrong-key' } });
      const res = mockResponse();
      const next = mockNext();

      internalAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized: Invalid internal API key',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('apiKeyAuth', () => {
    it('returns 401 when API key is missing', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Missing API key' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when company not found', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      const req = mockRequest({ headers: { 'x-api-key': 'unknown' } });
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid API key' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when company is inactive', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: 'c1',
        name: 'Co',
        is_active: false,
      });
      const req = mockRequest({ headers: { 'x-api-key': 'key' } });
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Company inactive' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next() when API key is valid and company active', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: 'c1',
        name: 'Company',
        is_active: true,
      });
      const req = mockRequest({ headers: { 'x-api-key': 'key' } });
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(req.company).toEqual({ id: 'c1', name: 'Company' });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 500 when prisma throws', async () => {
      (prisma.company.findUnique as jest.Mock).mockRejectedValue(new Error('DB'));
      const req = mockRequest({ headers: { 'x-api-key': 'key' } });
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('externalStepAuth', () => {
    it('returns 401 when token is missing', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await externalStepAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Missing token' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 404 when step not found for token', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
      const req = mockRequest({ params: { token: 'some-token' } });
      const res = mockResponse();
      const next = mockNext();

      await externalStepAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid or expired token' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next() when step found for token', async () => {
      const executionStep = {
        id: 'es-1',
        execution: { id: 'e1', company_id: 'c1' },
        step: { id: 's1', step_type: 'edit_form' },
      };
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(executionStep);
      const req = mockRequest({ params: { token: 'valid-token' } }) as AuthRequest & {
        executionStep?: unknown;
      };
      const res = mockResponse();
      const next = mockNext();

      await externalStepAuth(req, res, next);

      expect(req.executionStep).toEqual(executionStep);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 500 when prisma throws', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockRejectedValue(
        new Error('DB error')
      );
      const req = mockRequest({ params: { token: 't' } });
      const res = mockResponse();
      const next = mockNext();

      await externalStepAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('calls next() when API key is valid', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        id: 'c1',
        name: 'Co',
        is_active: true,
      });
      const req = mockRequest({ headers: { 'x-api-key': 'key' } });
      const res = mockResponse();
      const next = mockNext();

      await optionalAuth(req, res, next);

      expect(req.company).toEqual({ id: 'c1', name: 'Co' });
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() when JWT is valid', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'u@example.com',
      });
      const req = mockRequest({ headers: { authorization: 'Bearer token' } });
      const res = mockResponse();
      const next = mockNext();

      await optionalAuth(req, res, next);

      expect(req.user).toEqual({ id: 'user-1', email: 'u@example.com' });
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() when JWT is invalid (continues without auth)', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      const req = mockRequest({ headers: { authorization: 'Bearer bad' } });
      const res = mockResponse();
      const next = mockNext();

      await optionalAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() when no headers (no auth)', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await optionalAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
