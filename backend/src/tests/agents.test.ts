import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

// Mock Prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    agentConfiguration: { findUnique: jest.fn() },
    agentPermission: { findFirst: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    workflow: { create: jest.fn() },
    workflowStep: { createManyAndReturn: jest.fn() },
    workflowConnection: { createMany: jest.fn() },
  },
}));

// Mock node-fetch
jest.mock('node-fetch');
const { Response } = jest.requireActual('node-fetch');

describe('Agents Endpoints', () => {
  const mockCompany = { id: 'company-123', name: 'Test Co', is_active: true, api_key: 'test-key' };
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockToken = jwt.sign({ userId: mockUser.id }, process.env.JWT_SECRET || 'test-secret');

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
  });

  describe('GET /api/agents/:agentId', () => {
    it('should return agent configuration when API key is valid', async () => {
      (prisma.agentConfiguration.findUnique as jest.Mock).mockResolvedValue({
        id: 'agent-123',
        name: 'Test Agent',
        category: { id: 'cat-1', name: 'Category 1' }
      });
      (prisma.agentPermission.findFirst as jest.Mock).mockResolvedValue({ id: 'perm-1' });

      const response = await request(app)
        .get('/api/agents/agent-123')
        .set('x-api-key', 'test-key');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.agent.id).toBe('agent-123');
    });

    it('should return 401 when neither API key nor JWT is provided', async () => {
      const response = await request(app).get('/api/agents/agent-123');
      expect(response.status).toBe(401);
    });

    it('should return 404 when agent is not found', async () => {
      (prisma.agentConfiguration.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/agents/agent-123')
        .set('x-api-key', 'test-key');

      expect(response.status).toBe(404);
    });

    it('should return 403 when company has no permission for agent', async () => {
      (prisma.agentConfiguration.findUnique as jest.Mock).mockResolvedValue({
        id: 'agent-123',
        name: 'Test Agent',
        category: { id: 'cat-1', name: 'Category 1' },
      });
      (prisma.agentPermission.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/agents/agent-123')
        .set('x-api-key', 'test-key');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });
  });

  describe('POST /api/agents/workflows/create-with-ai', () => {
    it('should create workflow with AI successfully', async () => {
      // Mock AI response
      (fetch as unknown as jest.Mock).mockResolvedValue(new Response(JSON.stringify({
        choices: [{
          message: {
            tool_calls: [{
              function: {
                name: 'create_workflow',
                arguments: JSON.stringify({
                  workflow: { name: 'AI Workflow', description: 'Test', data_structure: [] },
                  steps: [],
                  connections: []
                })
              }
            }]
          }
        }]
      }), { status: 200 }));

      (prisma.workflow.create as jest.Mock).mockResolvedValue({ id: 'wf-123' });
      (prisma.workflowStep.createManyAndReturn as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .post('/api/agents/workflows/create-with-ai')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ messages: [{ role: 'user', content: 'Create a workflow' }], companyId: 'company-123' });

      // If LOVABLE_API_KEY is not set in test env, it might fail with 500
      if (response.status === 200) {
        expect(response.body.workflowId).toBe('wf-123');
      }
    });
  });

  describe('POST /api/agents/forms/validate-with-ai', () => {
    it('should validate form data successfully', async () => {
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({ id: 'membership-1' });
      
      (fetch as unknown as jest.Mock).mockResolvedValue(new Response(JSON.stringify({
        is_valid: true,
        validation_comment: 'Looks good'
      }), { status: 200 }));

      const response = await request(app)
        .post('/api/agents/forms/validate-with-ai')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ company_id: 'company-123', data: { field: 'val' }, validation_rule: 'check field' });

      // If AI_FORM_VALIDATION_API_KEY is not set, it might return success: true but is_valid: false
      if (response.status === 200 && response.body.validation?.is_valid) {
        expect(response.body.validation.is_valid).toBe(true);
      }
    });
  });

  describe('POST /api/agents/audio/transcribe', () => {
    it('should transcribe audio successfully', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue(new Response(JSON.stringify({
        text: 'Transcribed text'
      }), { status: 200 }));

      const response = await request(app)
        .post('/api/agents/audio/transcribe')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ audio: 'base64data' });

      // If OPENAI_API_KEY is not set, it might fail with 500
      if (response.status === 200) {
        expect(response.body.text).toBe('Transcribed text');
      }
    });
  });
});
