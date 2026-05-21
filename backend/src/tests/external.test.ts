import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';
import { emailService } from '../services/email.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    workflowExecutionData: { findMany: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    workflowExecutionStep: { update: jest.fn(), findFirst: jest.fn() },
    workflowExecution: { findFirst: jest.fn() },
    apiConfiguration: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));

// Mock Workflow Service
jest.mock('../services/workflow.service', () => ({
  workflowService: {
    advanceWorkflow: jest.fn().mockResolvedValue([]),
    cancelReminderForExecutionStep: jest.fn().mockResolvedValue(undefined),
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

  const activeStepRow = {
    execution_id: 'exec-123',
    execution_step_id: 'ex-step-123',
    workflow_step_id: 'wf-step-123',
    company_id: 'company-123',
    started_at: new Date(),
    status: 'running',
    external_token_expires_at: null,
    step_config: {},
    data_structure: [],
    workflow_name: 'Test Workflow',
    workflow_name_i18n: null,
    portal_default_language: 'en',
    portal_enabled_languages: ['en'],
  };

  describe('GET /api/external/steps/:token', () => {
    it('should return step data for an active external link', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([activeStepRow]);
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app).get('/api/external/steps/test-token');

      expect(response.status).toBe(200);
      expect(response.body.workflow_name).toBe('Test Workflow');
      expect(response.body.expires_at).toBeNull();
      expect(response.body.step_status).toBe('running');
      expect(response.body.execution_values).toEqual({});
    });

    it('should return execution_values when execution data exists', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([activeStepRow]);
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'data-1',
          values: {
            field_a: { value: 'hello' },
            field_b: { value: 42 },
          },
        },
      ]);

      const response = await request(app).get('/api/external/steps/test-token');

      expect(response.status).toBe(200);
      expect(response.body.execution_values).toEqual({
        field_a: { value: 'hello' },
        field_b: { value: 42 },
      });
    });

    it('should return 410 when external link has expired', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          ...activeStepRow,
          external_token_expires_at: new Date(Date.now() - 60_000),
        },
      ]);

      const response = await request(app).get('/api/external/steps/test-token');

      expect(response.status).toBe(410);
      expect(response.body.expired).toBe(true);
    });

    it('should return 410 when step is no longer running', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          ...activeStepRow,
          status: 'completed',
        },
      ]);

      const response = await request(app).get('/api/external/steps/test-token');

      expect(response.status).toBe(410);
      expect(response.body.expired).toBe(true);
    });
  });

  describe('GET /api/external/steps/:token/api-configurations', () => {
    it('should return API configurations referenced by dynamic fields', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          ...activeStepRow,
          data_structure: [
            { id: 'field-1', options_source: 'dynamic', api_configuration_id: 'cfg-1' },
            { id: 'field-2', options_source: 'static' },
          ],
        },
      ]);
      (prisma.apiConfiguration.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'cfg-1',
          api_url: 'https://example.com/options',
          api_method: 'GET',
          api_headers: [],
          api_params: [],
        },
      ]);

      const response = await request(app).get('/api/external/steps/test-token/api-configurations');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe('cfg-1');
      expect(prisma.apiConfiguration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            company_id: 'company-123',
            id: { in: ['cfg-1'] },
          }),
        })
      );
    });

    it('should return 410 when external link has expired', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          ...activeStepRow,
          external_token_expires_at: new Date(Date.now() - 60_000),
        },
      ]);

      const response = await request(app).get('/api/external/steps/test-token/api-configurations');

      expect(response.status).toBe(410);
      expect(response.body.expired).toBe(true);
    });
  });

  describe('POST /api/external/steps/:token/submit', () => {
    it('should submit external step successfully', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([activeStepRow]);
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([{ id: 'data-1', values: {} }]);

      const response = await request(app)
        .post('/api/external/steps/test-token/submit')
        .send({ data: { field1: 'value1' } });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.workflowExecutionStep.update).toHaveBeenCalled();
      expect(workflowService.advanceWorkflow).toHaveBeenCalledWith(
        'exec-123',
        'ex-step-123',
        'company-123',
        'Submit'
      );
    });

    it('should return 410 when external link has expired on submit', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          ...activeStepRow,
          external_token_expires_at: new Date(Date.now() - 60_000),
        },
      ]);

      const response = await request(app)
        .post('/api/external/steps/test-token/submit')
        .send({ data: {} });

      expect(response.status).toBe(410);
      expect(response.body.expired).toBe(true);
      expect(workflowService.advanceWorkflow).not.toHaveBeenCalled();
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

    it('should reject user field value not in company', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{
        ...activeStepRow,
        step_config: {},
        data_structure: [
          { id: 'assignee_field', field_type: 'user' },
        ],
      }]);
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([{ id: 'data-1', values: {} }]);
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/external/steps/test-token/submit')
        .send({ data: { assignee_field: 'user-outside' } });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid field value');
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
