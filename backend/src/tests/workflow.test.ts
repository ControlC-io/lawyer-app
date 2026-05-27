import request from 'supertest';
import { Readable } from 'stream';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';
import { aiService } from '../services/ai.service';
import { emailService } from '../services/email.service';
import { storageService } from '../services/storage.service';

// Mock Prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    workflow: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    workflowExecution: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    workflowExecutionData: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    workflowStep: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    workflowExecutionStep: { create: jest.fn(), createMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    workflowConnection: { findMany: jest.fn() },
    agentConfiguration: { findUnique: jest.fn() },
    apiConfiguration: { findUnique: jest.fn() },
    profile: { findUnique: jest.fn(), findMany: jest.fn() },
    workflowExecutionLog: { create: jest.fn() },
  },
}));

// Mock Workflow Service
jest.mock('../services/workflow.service', () => ({
  workflowService: {
    getExecutionDataSnapshot: jest.fn(),
    advanceWorkflow: jest.fn(),
    cancelReminderForExecutionStep: jest.fn().mockResolvedValue(undefined),
    createExecutionAndStart: jest.fn().mockResolvedValue('exec-123'),
    triggerStepProcessing: jest.fn().mockResolvedValue(undefined),
    triggerFileProcessing: jest.fn().mockResolvedValue(undefined),
  }
}));

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));

// Mock AI Service
jest.mock('../services/ai.service', () => ({
  aiService: {
    callAgentEndpoint: jest.fn(),
  }
}));

// Mock Storage Service (for getExecutionData file field branches)
jest.mock('../services/storage.service', () => ({
  storageService: {
    getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/'),
    getDocumentsBucket: jest.fn().mockReturnValue('documents'),
    getBucketName: jest.fn().mockReturnValue('floowly'),
    downloadFile: jest.fn().mockResolvedValue(Readable.from([Buffer.from('attachment-content')])),
    init: jest.fn(),
    getClient: jest.fn(),
  },
}));

jest.mock('../services/email.service', () => ({
  emailService: {
    sendWorkflowActionEmail: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Workflow Endpoints', () => {
  const mockCompany = { id: 'company-123', name: 'Test Co', is_active: true, api_key: 'test-key' };
  const mockAuthHeaders = { 'x-api-key': 'test-key' };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
  });

  describe('POST /api/workflows/:workflowId/trigger', () => {
    it('should trigger workflow successfully', async () => {
      (workflowService.createExecutionAndStart as jest.Mock).mockResolvedValue('exec-123');
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
        id: 'wf-123',
        name: 'Test Workflow',
        api_enabled: true,
      });
      (prisma.workflowStep.findMany as jest.Mock).mockResolvedValue([
        { id: 'step-start', step_type: 'start' },
        { id: 'step-1', step_type: 'action', name: 'First Step' }
      ]);
      (prisma.workflowExecution.create as jest.Mock).mockResolvedValue({ id: 'exec-123' });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-start', target_step_id: 'step-1' }
      ]);

      const response = await request(app)
        .post('/api/workflows/wf-123/trigger')
        .set(mockAuthHeaders)
        .send({ data: { test: 'value' } });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.execution_id).toBe('exec-123');
      expect(prisma.workflow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ is_archived: false }),
        }),
      );
    });

    it('should return 401 when x-api-key is missing', async () => {
      const response = await request(app)
        .post('/api/workflows/wf-123/trigger')
        .send({ data: {} });
      expect(response.status).toBe(401);
    });

    it('should return 404 when workflow is not found', async () => {
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .post('/api/workflows/wf-123/trigger')
        .set(mockAuthHeaders)
        .send({ data: {} });
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Workflow not found or access denied');
    });

    it('should return 403 when workflow api_enabled is false', async () => {
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
        id: 'wf-123',
        name: 'Test',
        api_enabled: false,
      });
      const response = await request(app)
        .post('/api/workflows/wf-123/trigger')
        .set(mockAuthHeaders)
        .send({ data: {} });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('This workflow does not allow API triggers');
    });

    it('should return 500 when no start step in workflow', async () => {
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
        id: 'wf-123',
        name: 'Test',
        api_enabled: true,
      });
      (workflowService.createExecutionAndStart as jest.Mock).mockRejectedValueOnce(
        new Error('No start step found in workflow')
      );
      const response = await request(app)
        .post('/api/workflows/wf-123/trigger')
        .set(mockAuthHeaders)
        .send({ data: {} });
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('No start step found in workflow');
    });

    it('should trigger and call triggerStepProcessing when first step is automatic', async () => {
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
        id: 'wf-123',
        name: 'Test',
        api_enabled: true,
      });
      (workflowService.createExecutionAndStart as jest.Mock).mockResolvedValue('exec-123');
      const response = await request(app)
        .post('/api/workflows/wf-123/trigger')
        .set(mockAuthHeaders)
        .send({ data: {} });
      expect(response.status).toBe(200);
      expect(response.body.execution_id).toBe('exec-123');
      expect(workflowService.createExecutionAndStart).toHaveBeenCalledWith(
        'company-123',
        'wf-123',
        { data: {}, createdBy: null }
      );
    });

    it('should trigger workflow and delegate to service', async () => {
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
        id: 'wf-123',
        name: 'Test',
        api_enabled: true,
      });
      (workflowService.createExecutionAndStart as jest.Mock).mockResolvedValue('exec-123');
      const response = await request(app)
        .post('/api/workflows/wf-123/trigger')
        .set(mockAuthHeaders)
        .send({ data: { key: 'value' } });
      expect(response.status).toBe(200);
      expect(response.body.execution_id).toBe('exec-123');
      expect(workflowService.createExecutionAndStart).toHaveBeenCalledWith(
        'company-123',
        'wf-123',
        { data: { key: 'value' }, createdBy: null }
      );
    });

    it('should return 200 when start step exists but has no connections', async () => {
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
        id: 'wf-123',
        name: 'Test',
        api_enabled: true,
      });
      (workflowService.createExecutionAndStart as jest.Mock).mockResolvedValue('exec-123');
      const response = await request(app)
        .post('/api/workflows/wf-123/trigger')
        .set(mockAuthHeaders)
        .send({ data: {} });
      expect(response.status).toBe(200);
      expect(response.body.execution_id).toBe('exec-123');
    });
  });

  describe('POST /api/companies/:companyId/workflows/:workflowId/start', () => {
    const jwt = require('jsonwebtoken');
    const mockUser = { id: 'user-1', email: 'user@example.com' };

    beforeEach(() => {
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({ id: 'uc-1', company_id: 'company-123', role: 'user' });
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({ id: 'wf-123', company_id: 'company-123', is_active: true });
      (workflowService.createExecutionAndStart as jest.Mock).mockResolvedValue('exec-123');
    });

    it('should start workflow from UI and return execution id', async () => {
      const response = await request(app)
        .post('/api/companies/company-123/workflows/wf-123/start')
        .set('Authorization', 'Bearer token')
        .send({});
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.execution_id).toBe('exec-123');
      expect(prisma.workflow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ is_archived: false }),
        }),
      );
      expect(workflowService.createExecutionAndStart).toHaveBeenCalledWith(
        'company-123',
        'wf-123',
        { data: {}, createdBy: 'user-1' }
      );
    });

    it('should return 401 when no auth', async () => {
      const response = await request(app)
        .post('/api/companies/company-123/workflows/wf-123/start')
        .send({});
      expect(response.status).toBe(401);
    });

    it('should return 404 when workflow not found', async () => {
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .post('/api/companies/company-123/workflows/wf-123/start')
        .set('Authorization', 'Bearer token')
        .send({});
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Workflow not found or access denied');
    });

    it('should return 403 when workflow is inactive', async () => {
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({ id: 'wf-123', company_id: 'company-123', is_active: false });
      const response = await request(app)
        .post('/api/companies/company-123/workflows/wf-123/start')
        .set('Authorization', 'Bearer token')
        .send({});
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Workflow is not active');
    });
  });

  describe('PUT /api/companies/:companyId/workflows/:workflowId/steps', () => {
    const jwt = require('jsonwebtoken');
    const mockUser = { id: 'user-1', email: 'user@example.com' };

    beforeEach(() => {
      jwt.verify.mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
        id: 'uc-1',
        company_id: 'company-123',
        role: 'company_admin',
      });
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({ id: 'wf-123', company_id: 'company-123' });
      (prisma.workflowStep.update as jest.Mock).mockResolvedValue({ id: 'step-1' });
    });

    it('keeps a non-empty rich-text explanation in step config', async () => {
      (prisma.workflowStep.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'step-1' }])
        .mockResolvedValueOnce([{ id: 'step-1', config: { explanation: '<p>Review this carefully.</p>' } }]);

      const response = await request(app)
        .put('/api/companies/company-123/workflows/wf-123/steps')
        .set('Authorization', 'Bearer token')
        .send({
          steps: [
            {
              id: 'step-1',
              step_type: 'action',
              action_type: 'automatic',
              name: 'Auto step',
              position_x: 100,
              position_y: 200,
              config: { explanation: '<p>Review this carefully.</p>' },
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(prisma.workflowStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-1' },
          data: expect.objectContaining({
            config: expect.objectContaining({
              explanation: '<p>Review this carefully.</p>',
            }),
          }),
        })
      );
    });

    it('strips explanation when rich-text content is empty', async () => {
      (prisma.workflowStep.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'step-1' }])
        .mockResolvedValueOnce([{ id: 'step-1', config: {} }]);

      const response = await request(app)
        .put('/api/companies/company-123/workflows/wf-123/steps')
        .set('Authorization', 'Bearer token')
        .send({
          steps: [
            {
              id: 'step-1',
              step_type: 'action',
              action_type: 'automatic',
              name: 'Auto step',
              position_x: 100,
              position_y: 200,
              config: { explanation: '<p><br></p>' },
            },
          ],
        });

      expect(response.status).toBe(200);
      const updateArgs = (prisma.workflowStep.update as jest.Mock).mock.calls.at(-1)?.[0];
      expect(updateArgs?.data?.config).not.toHaveProperty('explanation');
    });

    it('accepts and normalizes email action configuration', async () => {
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
        id: 'wf-123',
        company_id: 'company-123',
        data_structure: [
          { id: 'user-field-1', name: 'Requester', field_type: 'user' },
          { id: 'file-field-1', name: 'Attachment', field_type: 'file' },
        ],
      });
      (prisma.workflowStep.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 'step-1' }])
        .mockResolvedValueOnce([{ id: 'step-1', config: {} }]);

      const response = await request(app)
        .put('/api/companies/company-123/workflows/wf-123/steps')
        .set('Authorization', 'Bearer token')
        .send({
          steps: [
            {
              id: 'step-1',
              step_type: 'action',
              action_type: 'email',
              name: 'Email step',
              position_x: 100,
              position_y: 200,
              config: {
                email_action: {
                  subject_template: 'Subject {{Requester}}',
                  body_template_html: '<p>Hello {{Requester}}</p>',
                  recipient_sources: ['creator', 'static', 'user_field'],
                  static_recipients: ['notify@example.com'],
                  user_field_ids: ['user-field-1'],
                  attachment_field_ids: ['file-field-1'],
                },
              },
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(prisma.workflowStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-1' },
          data: expect.objectContaining({
            action_type: 'email',
            config: expect.objectContaining({
              email_action: expect.objectContaining({
                recipient_sources: expect.arrayContaining(['creator', 'static', 'user_field']),
                static_recipients: ['notify@example.com'],
                user_field_ids: ['user-field-1'],
                attachment_field_ids: ['file-field-1'],
              }),
            }),
          }),
        })
      );
    });
  });

  describe('POST /api/workflows/executions/:executionId/steps/:stepId/process', () => {
    it('should process automatic step successfully', async () => {
      const mockExecutionStep = {
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step: {
          step_type: 'action',
          action_type: 'automatic',
          config: { api_url: 'http://example.com/api' },
          workflow: { data_structure: [] }
        }
      };
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(mockExecutionStep);
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({});
      (aiService.callAgentEndpoint as jest.Mock).mockResolvedValue({ success: true, data: { result: 'ok' } });

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(aiService.callAgentEndpoint).toHaveBeenCalled();
    });

    it('should process email action, send emails with attachments, and auto-complete step', async () => {
      (storageService.downloadFile as jest.Mock).mockImplementation(() =>
        Promise.resolve(Readable.from(Buffer.from('attachment-content')))
      );
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        status: 'running',
        started_at: new Date('2026-01-01T00:00:00Z'),
        step_id: 'step-email-1',
        company_id: 'company-123',
        step: {
          step_type: 'action',
          action_type: 'email',
          config: {
            email_action: {
              subject_template: 'Subject {{Requester}}',
              body_template_html: '<p>Hello {{Requester}}</p>',
              recipient_sources: ['creator', 'static', 'user_field'],
              static_recipients: ['static@example.com'],
              user_field_ids: ['requester'],
              attachment_field_ids: ['attachment'],
            },
          },
          workflow: {
            data_structure: [
              { id: 'requester', name: 'Requester', field_type: 'user' },
              { id: 'attachment', name: 'Attachment', field_type: 'file' },
            ],
          },
        },
      });
      (prisma.workflowExecution.findFirst as jest.Mock)
        .mockResolvedValueOnce({ company_id: 'company-123' })
        .mockResolvedValueOnce({ created_by: 'creator-1' });
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        {
          values: {
            requester: { value: { id: 'assignee-1' } },
            attachment: { value: 'files/test.pdf', original_name: 'test.pdf' },
          },
        },
      ]);
      (prisma.profile.findUnique as jest.Mock).mockResolvedValue({ email: 'creator@example.com' });
      (prisma.profile.findMany as jest.Mock).mockResolvedValue([{ email: 'assignee@example.com' }]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({ status: 'running' });
      (workflowService.advanceWorkflow as jest.Mock).mockResolvedValue(['step-next-1']);

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.recipients_count).toBe(2);
      expect(response.body.attachments_count).toBe(1);
      expect(emailService.sendWorkflowActionEmail).toHaveBeenCalledTimes(2);
      expect(prisma.workflowExecutionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ex-step-123' },
          data: expect.objectContaining({
            status: 'completed',
            step_data: expect.objectContaining({
              _step_meta: expect.objectContaining({
                closed_by_source: 'system',
              }),
            }),
          }),
        })
      );
      expect(workflowService.advanceWorkflow).toHaveBeenCalledWith(
        'exec-123',
        'ex-step-123',
        'company-123'
      );
    });

    it('should process email action with spaced field names in subject and html body', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        status: 'running',
        started_at: new Date('2026-01-01T00:00:00Z'),
        step_id: 'step-email-1',
        company_id: 'company-123',
        step: {
          step_type: 'action',
          action_type: 'email',
          config: {
            email_action: {
              subject_template: 'Invoice for {{Customer Name}}',
              body_template_html: '<p>Hello {{Customer&nbsp;Name}}</p>',
              recipient_sources: ['creator'],
              static_recipients: [],
              user_field_ids: [],
              attachment_field_ids: [],
            },
          },
          workflow: {
            data_structure: [{ id: 'field-1', name: 'Customer Name', field_type: 'text' }],
          },
        },
      });
      (prisma.workflowExecution.findFirst as jest.Mock)
        .mockResolvedValueOnce({ company_id: 'company-123' })
        .mockResolvedValueOnce({ created_by: 'creator-1' });
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        {
          values: {
            'field-1': { value: 'Acme Corp' },
          },
        },
      ]);
      (prisma.profile.findUnique as jest.Mock).mockResolvedValue({ email: 'creator@example.com' });
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({ status: 'running' });
      (workflowService.advanceWorkflow as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(emailService.sendWorkflowActionEmail).toHaveBeenCalledWith(
        'creator@example.com',
        'Invoice for Acme Corp',
        '<p>Hello Acme Corp</p>',
        expect.any(Object)
      );
    });

    it('should dispatch automatic action without completing when status is running', async () => {
      const mockExecutionStep = {
        id: 'ex-step-123',
        execution_id: 'exec-123',
        status: 'running',
        step: {
          step_type: 'action',
          action_type: 'automatic',
          config: { api_url: 'http://example.com/api' },
          workflow: { data_structure: [] }
        }
      };

      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(mockExecutionStep);
      (aiService.callAgentEndpoint as jest.Mock).mockResolvedValue({ success: true, data: { result: 'ok' } });

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.execution_status).toBe('running');
      expect(response.body.message).toContain('waiting for completion callback');

      expect(prisma.workflowExecutionStep.update).not.toHaveBeenCalled();
      expect(workflowService.advanceWorkflow).not.toHaveBeenCalled();
    });

    it('should not complete/advance on dispatch failure for automatic action', async () => {
      const mockExecutionStep = {
        id: 'ex-step-123',
        execution_id: 'exec-123',
        status: 'running',
        step: {
          step_type: 'action',
          action_type: 'automatic',
          config: { api_url: 'http://example.com/api' },
          workflow: { data_structure: [] }
        }
      };

      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(mockExecutionStep);
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({});
      (aiService.callAgentEndpoint as jest.Mock).mockResolvedValue({
        success: false,
        error: 'dispatch failed',
        details: 'some details'
      });

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.execution_status).toBe('running');
      expect(response.body.message).toContain('waiting for completion callback');

      // Controller may persist dispatch error in step_data, but must not complete/advance.
      expect(workflowService.advanceWorkflow).not.toHaveBeenCalled();
      const updateCalls = (prisma.workflowExecutionStep.update as jest.Mock).mock.calls;
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0][0]).toEqual(expect.objectContaining({ where: { id: 'ex-step-123' } }));
    });

    it('should return 404 when execution step is not found', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);
      expect(response.status).toBe(404);
    });

    it('should return 200 and skip when step is not processable', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step: {
          step_type: 'edit_form',
          action_type: null,
          config: {},
          workflow: { data_structure: [] },
        },
      });
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('not a processable automatic step');
      expect(aiService.callAgentEndpoint).not.toHaveBeenCalled();
    });

    it('should return 400 when agent_id is set but agent config not found', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step: {
          step_type: 'action',
          action_type: 'automatic',
          config: { agent_id: 'agent-missing' },
          workflow: { data_structure: [] },
        },
      });
      (prisma.agentConfiguration.findUnique as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);
      expect(response.status).toBe(400);
      expect(response.body.details).toContain('agent configuration');
    });

    it('should return 400 when api_configuration_id is set but API config not found', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step: {
          step_type: 'action',
          action_type: 'automatic',
          config: { api_configuration_id: 'api-missing' },
          workflow: { data_structure: [] },
        },
      });
      (prisma.apiConfiguration.findUnique as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);
      expect(response.status).toBe(400);
      expect(response.body.details).toContain('API configuration');
    });

    it('should return 400 or 404 when stepId is empty', async () => {
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps//process')
        .set(mockAuthHeaders);
      expect([400, 404]).toContain(response.status);
    });

    it('should process step successfully with api_configuration_id', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step: {
          step_type: 'action',
          action_type: 'automatic',
          config: { api_configuration_id: 'api-1' },
          workflow: { data_structure: [] },
        },
      });
      (prisma.apiConfiguration.findUnique as jest.Mock).mockResolvedValue({
        api_url: 'https://api.example.com/run',
        api_method: 'POST',
        api_headers: [],
        api_data: [],
      });
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({});
      (aiService.callAgentEndpoint as jest.Mock).mockResolvedValue({ success: true, data: {} });
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(aiService.callAgentEndpoint).toHaveBeenCalled();
    });

    it('should return 400 when api_url is missing for automatic step', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step: {
          step_type: 'action',
          action_type: 'automatic',
          config: { api_headers: [], api_data: [] },
          workflow: { data_structure: [] },
        },
      });
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);
      expect(response.status).toBe(400);
      expect(response.body.details).toMatch(/api_url|required/i);
    });

    it('should process step successfully with agent_id and api_url from agent config', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step: {
          step_type: 'action',
          action_type: 'automatic',
          config: { agent_id: 'agent-1' },
          workflow: { data_structure: [] },
        },
      });
      (prisma.agentConfiguration.findUnique as jest.Mock).mockResolvedValue({
        api_url: 'https://agent.example.com',
        api_method: 'POST',
        api_headers: [],
        api_data: [],
      });
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({ key: 'val' });
      (aiService.callAgentEndpoint as jest.Mock).mockResolvedValue({ success: true, data: {} });
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);
      expect(response.status).toBe(200);
      expect(aiService.callAgentEndpoint).toHaveBeenCalledWith(
        'https://agent.example.com',
        'POST',
        expect.any(Object),
        expect.objectContaining({ execution_id: 'exec-123' })
      );
    });

    it('should resolve {{ field }} template in api_data from execution snapshot', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step: {
          step_type: 'action',
          action_type: 'automatic',
          config: {
            api_url: 'https://api.example.com',
            api_headers: [],
            api_data: [{ key: 'bound', value: '{{ myField }}' }],
          },
          workflow: { data_structure: [] },
        },
      });
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({ myField: 'resolved-value' });
      (aiService.callAgentEndpoint as jest.Mock).mockResolvedValue({ success: true, data: {} });
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/process')
        .set(mockAuthHeaders);
      expect(response.status).toBe(200);
      expect(aiService.callAgentEndpoint).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ bound: 'resolved-value' })
      );
    });
  });

  describe('POST /api/workflows/executions/:executionId/steps/:stepId/complete', () => {
    it('should complete step and advance workflow', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-1',
        status: 'running',
        company_id: 'company-123'
      });
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({ data: 'old' });
      (workflowService.advanceWorkflow as jest.Mock).mockResolvedValue(['step-2']);

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/complete')
        .set(mockAuthHeaders)
        .send({ step_data: { data: 'new' } });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.triggered_steps).toEqual(['step-2']);
      expect(prisma.workflowExecutionStep.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          step_data: expect.objectContaining({
            data: 'new',
            _step_meta: expect.objectContaining({
              closed_by_source: 'company_api_key',
              closed_by_name: 'API',
            }),
          }),
        })
      }));
    });

    it('should complete step using getExecutionDataSnapshot when step_data not provided', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-1',
        status: 'running',
        company_id: 'company-123'
      });
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({ snapshot: 'data' });
      (workflowService.advanceWorkflow as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/complete')
        .set(mockAuthHeaders)
        .send({});

      expect(response.status).toBe(200);
      expect(workflowService.getExecutionDataSnapshot).toHaveBeenCalledWith('exec-123');
      expect(prisma.workflowExecutionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            step_data: expect.objectContaining({
              snapshot: 'data',
              _step_meta: expect.objectContaining({
                closed_by_source: 'company_api_key',
                closed_by_name: 'API',
              }),
            }),
          }),
        })
      );
    });

    it('should return 404 when execution step is not found', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/complete')
        .set(mockAuthHeaders)
        .send({ step_data: {} });
      expect(response.status).toBe(404);
    });

    it('should return 400 when step is not running', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-1',
        status: 'pending',
        company_id: 'company-123',
      });
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/complete')
        .set(mockAuthHeaders)
        .send({ step_data: { x: 1 } });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/running|Invalid step status/i);
    });

    it('should return 400 or 404 when stepId is empty', async () => {
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps//complete')
        .set(mockAuthHeaders)
        .send({ step_data: {} });
      expect([400, 404]).toContain(response.status);
    });
  });

  describe('POST /api/workflows/executions/:executionId/steps/:stepId/decision', () => {
    const mockDecisionConnections = (outputs: string[] = ['Approved']) => {
      (prisma.workflowStep.findUnique as jest.Mock).mockResolvedValue({ workflow_id: 'wf-123' });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue(
        outputs.map((output_name, index) => ({
          source_step_id: 'step-decision',
          target_step_id: `step-next-${index}`,
          output_name,
        }))
      );
    };

    it('should make a decision and advance workflow', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-decision',
        status: 'running',
        company_id: 'company-123',
        started_at: new Date(),
        step: { id: 'step-decision', step_type: 'decision' },
      });
      mockDecisionConnections(['Approved']);
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({});
      (workflowService.advanceWorkflow as jest.Mock).mockResolvedValue(['step-next']);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({ status: 'running' });

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/decision')
        .set(mockAuthHeaders)
        .send({ decision_choice: 'Approved' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.decision_choice).toBe('Approved');
      expect(workflowService.advanceWorkflow).toHaveBeenCalledWith('exec-123', 'ex-step-123', 'company-123', 'Approved');
      expect(prisma.workflowExecutionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            decision_choice: 'Approved',
            status: 'completed',
            step_data: expect.objectContaining({
              _step_meta: expect.objectContaining({
                closed_by_source: 'company_api_key',
                closed_by_name: 'API',
              }),
            }),
          }),
        })
      );
    });

    it('should return 400 for invalid decision_choice and not complete the step', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-decision',
        status: 'running',
        company_id: 'company-123',
        started_at: new Date(),
        step: { id: 'step-decision', step_type: 'decision' },
      });
      mockDecisionConnections(['Yes', 'No']);
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/decision')
        .set(mockAuthHeaders)
        .send({ decision_choice: 'Maybe' });

      expect(response.status).toBe(400);
      expect(response.body.valid_choices).toEqual(['Yes', 'No']);
      expect(workflowService.advanceWorkflow).not.toHaveBeenCalled();
      expect(prisma.workflowExecutionStep.update).not.toHaveBeenCalled();
    });

    it('should return 404 when step is not found', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/decision')
        .set(mockAuthHeaders)
        .send({ decision_choice: 'Yes' });
      expect(response.status).toBe(404);
    });

    it('should return 400 when decision_choice is missing', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-decision',
        status: 'running',
        company_id: 'company-123',
        step: { step_type: 'decision' },
      });
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/decision')
        .set(mockAuthHeaders)
        .send({});
      expect(response.status).toBe(400);
    });

    it('should return 400 when step is not a decision step', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-1',
        status: 'running',
        company_id: 'company-123',
        step: { step_type: 'action' },
      });
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/decision')
        .set(mockAuthHeaders)
        .send({ decision_choice: 'Yes' });
      expect(response.status).toBe(400);
    });

    it('should return 400 when step is not running for decision', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-decision',
        status: 'pending',
        company_id: 'company-123',
        step: { step_type: 'decision' },
      });
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/decision')
        .set(mockAuthHeaders)
        .send({ decision_choice: 'Yes' });
      expect(response.status).toBe(400);
    });

    it('should record agent decision and return awaiting human validation when decision_choice is awaiting_validation', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-decision',
        status: 'running',
        company_id: 'company-123',
        step: { id: 'step-decision', step_type: 'decision', decision_node_type: 'Agent_Human' },
      });
      (prisma.workflowStep.findUnique as jest.Mock).mockResolvedValue({ workflow_id: 'wf-123' });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([]);
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({});
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/decision')
        .set(mockAuthHeaders)
        .send({ decision_choice: 'awaiting_validation', decision_reason: 'Need review' });
      expect(response.status).toBe(200);
      expect(response.body.requires_human_validation).toBe(true);
      expect(response.body.agent_decision).toBe('awaiting_validation');
      expect(workflowService.advanceWorkflow).not.toHaveBeenCalled();
      expect(prisma.workflowExecutionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ step_data: expect.objectContaining({ agent_decision_choice: 'awaiting_validation' }) }),
        })
      );
    });

    it('should store Agent+Human agent suggestion via API key without advancing', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-decision',
        status: 'running',
        company_id: 'company-123',
        step: { id: 'step-decision', step_type: 'decision', decision_node_type: 'Agent_Human' },
      });
      mockDecisionConnections(['Yes', 'No']);
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/decision')
        .set(mockAuthHeaders)
        .send({ decision_choice: 'Yes', decision_reason: 'Looks good' });

      expect(response.status).toBe(200);
      expect(response.body.requires_human_validation).toBe(true);
      expect(response.body.agent_decision).toBe('Yes');
      expect(workflowService.advanceWorkflow).not.toHaveBeenCalled();
      expect(prisma.workflowExecutionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            step_data: expect.objectContaining({
              agent_decision_choice: 'Yes',
              agent_decision_reason: 'Looks good',
            }),
          }),
        })
      );
    });

    it('should complete Agent+Human decision and advance when confirmed by user JWT', async () => {
      const jwt = require('jsonwebtoken');
      (jwt.verify as jest.Mock).mockReturnValue({ userId: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        profile: { admin_role: { super_admin: false } },
      });
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'ex-step-123',
        execution_id: 'exec-123',
        step_id: 'step-decision',
        status: 'running',
        company_id: 'company-123',
        started_at: new Date(),
        step: { id: 'step-decision', step_type: 'decision', decision_node_type: 'Agent_Human' },
      });
      mockDecisionConnections(['Yes', 'No']);
      (workflowService.getExecutionDataSnapshot as jest.Mock).mockResolvedValue({});
      (workflowService.advanceWorkflow as jest.Mock).mockResolvedValue(['step-next']);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({ status: 'running' });

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/steps/ex-step-123/decision')
        .set('Authorization', 'Bearer token')
        .send({ decision_choice: 'Yes' });

      expect(response.status).toBe(200);
      expect(response.body.decision_choice).toBe('Yes');
      expect(workflowService.advanceWorkflow).toHaveBeenCalledWith('exec-123', 'ex-step-123', 'company-123', 'Yes');
      expect(prisma.workflowExecutionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            decision_choice: 'Yes',
            status: 'completed',
          }),
        })
      );
    });
  });

  describe('GET /api/workflows/executions/:executionId', () => {
    it('should return execution data', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: { data_structure: [] },
        execution_steps: [],
        execution_data_records: [{ values: {} }]
      });

      const response = await request(app)
        .get('/api/workflows/executions/exec-123')
        .set(mockAuthHeaders);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('exec-123');
    });

    it('should return 404 when execution is not found', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .get('/api/workflows/executions/exec-123')
        .set(mockAuthHeaders);
      expect(response.status).toBe(404);
    });

    it('should return execution with file signed URLs when data_structure has file fields', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [
            { id: 'f1', name: 'File1', field_type: 'file' },
            { id: 'f2', name: 'Files2', field_type: 'array' },
            { id: 'f2-child', name: 'FileItem', field_type: 'file', parent_item_id: 'f2' },
          ],
        },
        execution_steps: [],
        execution_data_records: [
          {
            values: {
              f1: { value: 'path/to/file1.pdf' },
              f2: { value: [{ 'f2-child': { value: 'path/a' } }, { 'f2-child': { value: 'path/b' } }] },
            },
          },
        ],
        current_step: null,
      });
      const response = await request(app)
        .get('/api/workflows/executions/exec-123')
        .set(mockAuthHeaders);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe('exec-123');
    });

    it('should expose closed_by_label as API or public in execution steps', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: { data_structure: [] },
        execution_steps: [
          {
            id: 'step-api',
            step_data: {
              _step_meta: {
                closed_by_source: 'company_api_key',
              },
            },
          },
          {
            id: 'step-portal',
            step_data: {
              _submission_type: 'portal',
            },
          },
        ],
        execution_data_records: [{ values: {} }],
        execution_logs: [],
      });

      const response = await request(app)
        .get('/api/workflows/executions/exec-123')
        .set(mockAuthHeaders);

      expect(response.status).toBe(200);
      expect(response.body.execution_steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'step-api', closed_by_label: 'API' }),
          expect.objectContaining({ id: 'step-portal', closed_by_label: 'public' }),
        ])
      );
    });

    it('should return 400 or 404 when executionId is empty', async () => {
      const response = await request(app)
        .get('/api/workflows/executions//')
        .set(mockAuthHeaders);
      expect([400, 404]).toContain(response.status);
    });

    it('should return 401 when company auth is missing for getExecutionData', async () => {
      const response = await request(app)
        .get('/api/workflows/executions/exec-123');
      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/workflows/executions/:executionId/data', () => {
    it('should update execution data', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [
            { id: 'f1', name: 'Field1', field_type: 'text' }
          ]
        }
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: { f1: { value: 'old' } }
      });

      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .set(mockAuthHeaders)
        .send({ data: { Field1: 'new' } });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.workflowExecutionData.update).toHaveBeenCalled();
    });

    it('should flatten file field payload with original_name on updateExecutionData', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [{ id: 'f-file', name: 'Photo', field_type: 'file' }],
        },
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: {
          'f-file': {
            value: 'executions/exec-123/1_pic.png',
            original_name: 'pic.png',
          },
        },
      });

      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .set(mockAuthHeaders)
        .send({
          data: {
            Photo: {
              value: 'executions/exec-123/1_pic.png',
              original_name: 'renamed.png',
            },
          },
        });

      expect(response.status).toBe(200);
      expect(prisma.workflowExecutionData.update).toHaveBeenCalled();
      const updateArg = (prisma.workflowExecutionData.update as jest.Mock).mock.calls[0][0];
      expect(updateArg.data.values['f-file']).toEqual({
        value: 'executions/exec-123/1_pic.png',
        original_name: 'renamed.png',
      });
      expect(typeof updateArg.data.values['f-file'].value).toBe('string');
    });

    it('should return 404 when execution is not found', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .set(mockAuthHeaders)
        .send({ data: { Field1: 'new' } });
      expect(response.status).toBe(404);
    });

    it('should return 400 when data is missing or not object', async () => {
      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .set(mockAuthHeaders)
        .send({});
      expect(response.status).toBe(400);
    });

    it('should return 400 when execution has no data structure', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: { data_structure: null },
      });
      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .set(mockAuthHeaders)
        .send({ data: { Field1: 'x' } });
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('data structure');
    });

    it('should return 404 when no execution data record found', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: { data_structure: [{ id: 'f1', name: 'Field1' }] },
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .set(mockAuthHeaders)
        .send({ data: { Field1: 'x' } });
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('no execution data');
    });

    it('should return 400 when data contains unmatched fields', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: { data_structure: [{ id: 'f1', name: 'Field1' }] },
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: {},
      });
      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .set(mockAuthHeaders)
        .send({ data: { UnknownField: 'x' } });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/unmatched|do not match data structure/i);
    });

    it('should return 401 when company auth is missing for updateExecutionData', async () => {
      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .send({ data: { Field1: 'x' } });
      expect(response.status).toBe(401);
    });

    it('should update execution data with array field', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [
            { id: 'f1', name: 'Items', field_type: 'array' },
            { id: 'f1-child', name: 'Title', parent_item_id: 'f1' },
          ],
        },
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: {},
      });
      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .set(mockAuthHeaders)
        .send({
          data: {
            Items: [{ Title: 'First' }],
          },
        });
      expect(response.status).toBe(200);
      expect(prisma.workflowExecutionData.update).toHaveBeenCalled();
    });

    it('should normalize user field value to user id when valid', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [
            { id: 'assignee_field', name: 'Assignee', field_type: 'user' },
          ],
        },
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: {},
      });
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
        id: 'uc-1',
        company_id: 'company-123',
        user_id: 'user-123',
      });

      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .set(mockAuthHeaders)
        .send({
          values: {
            assignee_field: { id: 'user-123', email: 'user@example.com' },
          },
        });

      expect(response.status).toBe(200);
      expect(prisma.workflowExecutionData.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            values: expect.objectContaining({
              assignee_field: expect.objectContaining({ value: 'user-123' }),
            }),
          }),
        })
      );
    });

    it('should reject user field values for users outside the company', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: {
          data_structure: [
            { id: 'assignee_field', name: 'Assignee', field_type: 'user' },
          ],
        },
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: {},
      });
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .put('/api/workflows/executions/exec-123/data')
        .set(mockAuthHeaders)
        .send({
          values: {
            assignee_field: 'user-outside-company',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid user field value');
    });
  });

  describe('PATCH /api/workflows/executions/:executionId/data/array-item', () => {
    const mockDataStructure = [
      { id: 'arr1', name: 'documents', field_type: 'array' },
      { id: 'file1', name: 'attachment', field_type: 'file', parent_item_id: 'arr1' },
      { id: 'text1', name: 'description', field_type: 'text', parent_item_id: 'arr1' },
    ];

    it('should update a sub-field in an existing array item', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: { data_structure: mockDataStructure },
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: {
          arr1: {
            value: [
              { _id: 'item-1', file1: { value: 'path/file.pdf', original_name: 'file.pdf' } },
            ],
          },
        },
      });

      const response = await request(app)
        .patch('/api/workflows/executions/exec-123/data/array-item')
        .set(mockAuthHeaders)
        .send({
          field_name: 'documents',
          index: 0,
          sub_field_name: 'description',
          value: 'Invoice Q1',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const updateCall = (prisma.workflowExecutionData.update as jest.Mock).mock.calls[0][0];
      const updatedArr = updateCall.data.values.arr1.value;
      expect(updatedArr[0].text1).toBe('Invoice Q1');
      // File sub-field should be preserved
      expect(updatedArr[0].file1.value).toBe('path/file.pdf');
    });

    it('should return 400 when index is out of range', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: { data_structure: mockDataStructure },
      });
      (prisma.workflowExecutionData.findFirst as jest.Mock).mockResolvedValue({
        id: 'data-123',
        values: { arr1: { value: [{ _id: 'item-1' }] } },
      });

      const response = await request(app)
        .patch('/api/workflows/executions/exec-123/data/array-item')
        .set(mockAuthHeaders)
        .send({ field_name: 'documents', index: 5, sub_field_name: 'description', value: 'x' });

      expect(response.status).toBe(400);
    });

    it('should return 400 when field is not an array', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({
        id: 'exec-123',
        workflow: { data_structure: [{ id: 'f1', name: 'title', field_type: 'text' }] },
      });

      const response = await request(app)
        .patch('/api/workflows/executions/exec-123/data/array-item')
        .set(mockAuthHeaders)
        .send({ field_name: 'title', index: 0, sub_field_name: 'description', value: 'x' });

      expect(response.status).toBe(400);
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .patch('/api/workflows/executions/exec-123/data/array-item')
        .set(mockAuthHeaders)
        .send({ field_name: 'documents' });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/workflows/executions/:executionId/name', () => {
    it('should rename execution', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const response = await request(app)
        .patch('/api/workflows/executions/exec-123/name')
        .set(mockAuthHeaders)
        .send({ name: 'New Name' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 401 when x-api-key is missing', async () => {
      const response = await request(app)
        .patch('/api/workflows/executions/exec-123/name')
        .send({ name: 'New Name' });
      expect(response.status).toBe(401);
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .patch('/api/workflows/executions/exec-123/name')
        .set(mockAuthHeaders)
        .send({});
      expect(response.status).toBe(400);
    });

    it('should return 404 when execution to rename is not found', async () => {
      (prisma.workflowExecution.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      const response = await request(app)
        .patch('/api/workflows/executions/exec-123/name')
        .set(mockAuthHeaders)
        .send({ name: 'New Name' });
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/workflows/executions/:executionId/logs', () => {
    it('should add log entry', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({ id: 'exec-123' });
      (prisma.workflowExecutionLog.create as jest.Mock).mockResolvedValue({ id: 'log-1', created_at: new Date() });

      const response = await request(app)
        .post('/api/workflows/executions/exec-123/logs')
        .set(mockAuthHeaders)
        .send({ log_text: 'Test log', log_type: 'Info' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(prisma.workflowExecutionLog.create).toHaveBeenCalled();
    });

    it('should return 401 when x-api-key is missing', async () => {
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/logs')
        .send({ log_text: 'Test', log_type: 'Info' });
      expect(response.status).toBe(401);
    });

    it('should return 400 when log_text is missing', async () => {
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/logs')
        .set(mockAuthHeaders)
        .send({ log_type: 'Info' });
      expect(response.status).toBe(400);
    });

    it('should return 404 when execution for log is not found', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/logs')
        .set(mockAuthHeaders)
        .send({ log_text: 'Test', log_type: 'Info' });
      expect(response.status).toBe(404);
    });

    it('should return 404 when step_id is provided but step not found', async () => {
      (prisma.workflowExecution.findFirst as jest.Mock).mockResolvedValue({ id: 'exec-123' });
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
      const response = await request(app)
        .post('/api/workflows/executions/exec-123/logs')
        .set(mockAuthHeaders)
        .send({ log_text: 'Test', step_id: 'non-existent-step' });
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Step not found');
    });
  });
});
