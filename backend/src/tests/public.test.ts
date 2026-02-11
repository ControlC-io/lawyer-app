import request from 'supertest';
import { app } from '../app';
import { emailService } from '../services/email.service';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../services/email.service', () => ({
  emailService: {
    sendFeedback: jest.fn().mockResolvedValue(undefined),
    sendDemoRequest: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Public Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    (emailService.sendFeedback as jest.Mock).mockResolvedValue(undefined);
    (emailService.sendDemoRequest as jest.Mock).mockResolvedValue(undefined);
  });

  describe('GET /health', () => {
    it('should return 200 and status ok when database is connected', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('connected');
    });

    it('should return 500 when database query fails', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      const response = await request(app).get('/health');
      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.database).toBe('disconnected');
    });
  });

  describe('POST /api/public/feedback', () => {
    it('should return 400 when userEmail is missing', async () => {
      const response = await request(app)
        .post('/api/public/feedback')
        .send({ feedback: 'Some feedback' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
      expect(emailService.sendFeedback).not.toHaveBeenCalled();
    });

    it('should return 400 when feedback is missing', async () => {
      const response = await request(app)
        .post('/api/public/feedback')
        .send({ userEmail: 'user@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
      expect(emailService.sendFeedback).not.toHaveBeenCalled();
    });

    it('should return 200 and call sendFeedback with valid body', async () => {
      const response = await request(app)
        .post('/api/public/feedback')
        .send({
          userEmail: 'user@example.com',
          userName: 'Test User',
          feedback: 'Great product!',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Feedback sent successfully');
      expect(emailService.sendFeedback).toHaveBeenCalledWith(
        'user@example.com',
        'Feedback from Test User',
        'Great product!'
      );
    });

    it('should use userEmail as subject fallback when userName is missing', async () => {
      await request(app)
        .post('/api/public/feedback')
        .send({
          userEmail: 'user@example.com',
          feedback: 'Feedback text',
        });

      expect(emailService.sendFeedback).toHaveBeenCalledWith(
        'user@example.com',
        'Feedback from user@example.com',
        'Feedback text'
      );
    });

    it('should return 500 when sendFeedback throws', async () => {
      (emailService.sendFeedback as jest.Mock).mockRejectedValue(new Error('Email failed'));

      const response = await request(app)
        .post('/api/public/feedback')
        .send({ userEmail: 'u@x.com', feedback: 'text' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Email failed');
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

  describe('POST /api/public/demo-request', () => {
    it('should return 400 when firstName is missing', async () => {
      const response = await request(app)
        .post('/api/public/demo-request')
        .send({
          lastName: 'Doe',
          email: 'jane@example.com',
          companyName: 'Acme',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
      expect(emailService.sendDemoRequest).not.toHaveBeenCalled();
    });

    it('should return 400 when any required field is missing', async () => {
      const response = await request(app)
        .post('/api/public/demo-request')
        .send({ firstName: 'Jane' });

      expect(response.status).toBe(400);
      expect(response.body.details).toContain('firstName');
      expect(emailService.sendDemoRequest).not.toHaveBeenCalled();
    });

    it('should return 200 and call sendDemoRequest with valid body', async () => {
      const response = await request(app)
        .post('/api/public/demo-request')
        .send({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          companyName: 'Acme Corp',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Demo request sent successfully');
      expect(emailService.sendDemoRequest).toHaveBeenCalledWith(
        'Jane Doe',
        'jane@example.com',
        'Acme Corp'
      );
    });

    it('should return 500 when sendDemoRequest throws', async () => {
      (emailService.sendDemoRequest as jest.Mock).mockRejectedValue(new Error('SMTP error'));

      const response = await request(app)
        .post('/api/public/demo-request')
        .send({
          firstName: 'J',
          lastName: 'D',
          email: 'j@x.com',
          companyName: 'Co',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('SMTP error');
    });
  });
});
