import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';
import { emailService } from '../services/email.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    workflowExecutionData: { findMany: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    workflowExecutionStep: { update: jest.fn(), findFirst: jest.fn() },
    workflowExecution: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));

// Mock Workflow Service
jest.mock('../services/workflow.service', () => ({
  workflowService: {
    advanceWorkflow: jest.fn().mockResolvedValue([]),
  }
}));

// Mock Email Service
jest.mock('../services/email.service', () => ({
  emailService: {
    sendExternalFormLink: jest.fn().mockResolvedValue(undefined),
  }
}));

describe('External Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/external/steps/:token/submit', () => {
    it('should submit external step successfully', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{
        execution_id: 'exec-123',
        execution_step_id: 'ex-step-123',
        workflow_step_id: 'wf-step-123',
        company_id: 'company-123',
        step_config: {}
      }]);
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([{ id: 'data-1', values: {} }]);

      const response = await request(app)
        .post('/api/external/steps/test-token/submit')
        .send({ data: { field1: 'value1' } });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.workflowExecutionStep.update).toHaveBeenCalled();
      expect(workflowService.advanceWorkflow).toHaveBeenCalled();
    });

    it('should return 404 for invalid token', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .post('/api/external/steps/invalid-token/submit')
        .send({ data: {} });

      expect(response.status).toBe(404);
    });

    it('should return 400 when token is missing', async () => {
      const response = await request(app)
        .post('/api/external/steps//submit')
        .send({ data: {} });
      expect([400, 404]).toContain(response.status);
    });
  });

  describe('POST /api/external/steps/:stepId/send-link', () => {
    it('should return 401 when no JWT', async () => {
      const response = await request(app)
        .post('/api/external/steps/step-123/send-link')
        .send({ email: 'a@b.com', token: 't', executionId: 'e1', companyId: 'c1' });
      expect(response.status).toBe(401);
    });

    it('should send external form link when JWT valid', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({ userId: 'user-123' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-123', email: 'u@example.com' });
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: 'company-123', name: 'Test Co' });

      const response = await request(app)
        .post('/api/external/steps/step-123/send-link')
        .set('Authorization', 'Bearer token')
        .send({
          email: 'customer@example.com',
          token: 'form-token',
          executionId: 'exec-123',
          companyId: 'company-123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(emailService.sendExternalFormLink).toHaveBeenCalledWith(
        'customer@example.com',
        'Action Required',
        'form-token'
      );
    });

    it('should return 400 when required params missing', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({ userId: 'user-123' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-123', email: 'u@example.com' });

      const response = await request(app)
        .post('/api/external/steps/step-123/send-link')
        .set('Authorization', 'Bearer token')
        .send({ email: 'a@b.com' });

      expect(response.status).toBe(400);
    });

    it('should return 404 when company not found for send-link', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({ userId: 'user-123' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-123', email: 'u@example.com' });
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/external/steps/step-123/send-link')
        .set('Authorization', 'Bearer token')
        .send({
          email: 'a@b.com',
          token: 't',
          executionId: 'e1',
          companyId: 'nonexistent',
        });

      expect(response.status).toBe(404);
    });
  });
});
