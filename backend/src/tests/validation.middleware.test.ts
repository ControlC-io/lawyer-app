import { Request, Response } from 'express';
import { body } from 'express-validator';
import { validate, asyncHandler, errorHandler, notFoundHandler } from '../middleware/validation';

function mockRequest(overrides: Partial<Request> = {}): Request {
  return { body: {}, ...overrides } as Request;
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

describe('validation middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('validate', () => {
    it('calls next() when validation passes', async () => {
      const req = mockRequest({ body: { email: 'a@b.com' } });
      const res = mockResponse();
      const next = mockNext();
      const validations = [body('email').isEmail()];

      await validate(validations)(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 400 with formatted errors when validation fails', async () => {
      const req = mockRequest({ body: { email: 'invalid' } });
      const res = mockResponse();
      const next = mockNext();
      const validations = [body('email').isEmail().withMessage('Invalid email')];

      await validate(validations)(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          details: expect.any(Array),
        })
      );
    });
  });

  describe('asyncHandler', () => {
    it('calls next with error when handler rejects', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      const err = new Error('Async error');
      const handler = asyncHandler(async () => {
        throw err;
      });

      handler(req, res, next);

      await new Promise((r) => setImmediate(r));

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('errorHandler', () => {
    it('returns 409 for Prisma P2002', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      errorHandler({ code: 'P2002' }, req, res, next);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Duplicate entry', code: 'P2002' })
      );
    });

    it('returns 404 for Prisma P2025', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      errorHandler({ code: 'P2025' }, req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Record not found', code: 'P2025' })
      );
    });

    it('returns 400 for ValidationError', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      errorHandler({ name: 'ValidationError', message: 'Bad input' }, req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation error', details: 'Bad input' })
      );
    });

    it('returns 401 for JsonWebTokenError', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      errorHandler({ name: 'JsonWebTokenError', message: 'jwt malformed' }, req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid token' })
      );
    });

    it('returns 401 for TokenExpiredError', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      errorHandler({ name: 'TokenExpiredError' }, req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Token expired' })
      );
    });

    it('returns statusCode and message for default error', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      errorHandler({ statusCode: 418, message: 'Teapot' }, req, res, next);
      expect(res.status).toHaveBeenCalledWith(418);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Teapot' })
      );
    });

    it('uses err.status when statusCode not set', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      errorHandler({ status: 400, message: 'Bad' }, req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Bad' }));
    });

    it('returns 500 when no status or message', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      errorHandler({}, req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal server error' })
      );
    });

    it('includes stack in details when NODE_ENV is development', () => {
      const orig = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      const err = new Error('Dev error');
      errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Dev error', details: expect.any(String) })
      );
      process.env.NODE_ENV = orig;
    });
  });

  describe('notFoundHandler', () => {
    it('returns 404 with route info', () => {
      const req = mockRequest({ method: 'GET', path: '/api/unknown' });
      const res = mockResponse();
      notFoundHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Not found',
          details: expect.stringContaining('GET'),
        })
      );
    });
  });
});
