import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';
import jwt from 'jsonwebtoken';
const mockJwtVerify = jwt.verify as jest.Mock;

const jwtUser = {
  id: 'user-1',
  email: 'u@example.com',
  company_id: 'company-1',
  super_admin: false,
};

jest.mock('../lib/prisma', () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    profileGroupMember: { findMany: jest.fn() },
    workflow: { findFirst: jest.fn() },
    workflowExecution: { findMany: jest.fn() },
    workflowPermission: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../services/workflow.service', () => ({
  workflowService: {
    searchExecutionsByData: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));

const FIELD_EVENT_ID = '11111111-1111-1111-1111-111111111111';
const FIELD_EVENT_NAME = '22222222-2222-2222-2222-222222222222';
const FIELD_ITEMS = '33333333-3333-3333-3333-333333333333';
const CHILD_SKU = '44444444-4444-4444-4444-444444444444';
const CHILD_QTY = '55555555-5555-5555-5555-555555555555';

const baseDataStructure = [
  { id: FIELD_EVENT_ID, name: 'event_id', field_type: 'number' },
  { id: FIELD_EVENT_NAME, name: 'event_name', field_type: 'text' },
  { id: FIELD_ITEMS, name: 'items', field_type: 'array' },
  { id: CHILD_SKU, name: 'sku', field_type: 'text', parent_item_id: FIELD_ITEMS },
  { id: CHILD_QTY, name: 'qty', field_type: 'number', parent_item_id: FIELD_ITEMS },
];

const mockCompany = { id: 'company-1', name: 'Test Co', is_active: true, api_key: 'test-key' };
const apiKeyHeaders = { 'x-api-key': 'test-key' };

describe('POST /api/workflows/:workflowId/executions/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
    (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
      id: 'wf-1',
      company_id: 'company-1',
      is_public: true,
      visibility_scope: 'all_company',
      data_structure: baseDataStructure,
    });
  });

  it('returns matching executions for a single scalar filter', async () => {
    (workflowService.searchExecutionsByData as jest.Mock).mockResolvedValue({
      total: 1,
      executionIds: ['exec-1'],
    });
    (prisma.workflowExecution.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'exec-1',
        workflow_id: 'wf-1',
        name: 'first',
        status: 'running',
        current_step_id: 'step-a',
        created_at: new Date('2026-05-01T00:00:00Z'),
        started_at: new Date('2026-05-01T00:00:00Z'),
        completed_at: null,
        workflow: { data_structure: baseDataStructure },
        execution_data_records: [
          { values: { [FIELD_EVENT_ID]: { value: 1234 }, [FIELD_EVENT_NAME]: { value: 'test' } } },
        ],
      },
    ]);

    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: 1234 } });

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.limit).toBe(50);
    expect(response.body.offset).toBe(0);
    expect(response.body.executions).toHaveLength(1);
    expect(response.body.executions[0]).toMatchObject({
      id: 'exec-1',
      workflow_id: 'wf-1',
      execution_data_mapped: { event_id: 1234, event_name: 'test', items: null },
    });

    expect(workflowService.searchExecutionsByData).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-1',
        companyId: 'company-1',
        filters: [{ kind: 'scalar', fieldId: FIELD_EVENT_ID, value: 1234 }],
        limit: 50,
        offset: 0,
        includeArchived: false,
      })
    );
  });

  it('returns 400 invalid_filters when filters is missing', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_filters');
  });

  it('returns 400 invalid_filters when filters is empty', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: {} });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_filters');
  });

  it('returns 400 invalid_filters when filters is not an object', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: [1, 2] });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_filters');
  });

  it('returns 400 unknown_fields with the unknown names', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { evnet_id: 1, also_wrong: 'x' } });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('unknown_fields');
    expect(response.body.unknown.sort()).toEqual(['also_wrong', 'evnet_id']);
  });

  it('returns 400 invalid_field_value when scalar gets an object', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: { contains: 1 } } });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_field_value');
    expect(response.body.field).toBe('event_id');
  });

  it('returns 400 invalid_field_value when array field gets a primitive', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { items: 'oops' } });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_field_value');
    expect(response.body.field).toBe('items');
  });

  it('returns 400 invalid_pagination for limit > 200', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: 1 }, limit: 500 });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_pagination');
  });

  it('returns 400 invalid_pagination for negative offset', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: 1 }, offset: -1 });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_pagination');
  });

  it('passes valid limit/offset through to the service', async () => {
    (workflowService.searchExecutionsByData as jest.Mock).mockResolvedValue({
      total: 42,
      executionIds: [],
    });

    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: 1 }, limit: 10, offset: 20 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 42, limit: 10, offset: 20, executions: [] });
    expect(workflowService.searchExecutionsByData).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 20 })
    );
  });

  it('translates an array filter into a service ResolvedSearchFilter (kind: array)', async () => {
    (workflowService.searchExecutionsByData as jest.Mock).mockResolvedValue({
      total: 0,
      executionIds: [],
    });

    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { items: { sku: 'ABC-1', qty: 10 } } });

    expect(response.status).toBe(200);
    expect(workflowService.searchExecutionsByData).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          {
            kind: 'array',
            fieldId: FIELD_ITEMS,
            children: expect.arrayContaining([
              { childId: CHILD_SKU, value: 'ABC-1' },
              { childId: CHILD_QTY, value: 10 },
            ]),
          },
        ],
      })
    );
  });

  it('rejects unknown child field name in an array filter', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { items: { not_a_child: 'x' } } });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_field_value');
    expect(response.body.field).toBe('items');
  });

  it('rejects empty child object in an array filter', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { items: {} } });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_field_value');
    expect(response.body.field).toBe('items');
  });

  it('returns 401 with no auth headers', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .send({ filters: { event_id: 1 } });
    expect(response.status).toBe(401);
  });

  it('JWT user with workflow visibility (all_company) → 200', async () => {
    mockJwtVerify.mockReturnValue(jwtUser);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'u@example.com',
      profile: { admin_role: { super_admin: false } },
    });
    (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({ role: 'member' });
    (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);
    (workflowService.searchExecutionsByData as jest.Mock).mockResolvedValue({ total: 0, executionIds: [] });

    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set('Authorization', 'Bearer test-jwt')
      .send({ filters: { event_id: 1 } });

    expect(response.status).toBe(200);
  });

  it('JWT user without workflow visibility → 403', async () => {
    (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
      id: 'wf-1',
      company_id: 'company-1',
      is_public: false,
      visibility_scope: 'restricted',
      data_structure: baseDataStructure,
    });
    mockJwtVerify.mockReturnValue(jwtUser);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'u@example.com',
      profile: { admin_role: { super_admin: false } },
    });
    (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({ role: 'member' });
    (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.workflowPermission.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set('Authorization', 'Bearer test-jwt')
      .send({ filters: { event_id: 1 } });

    expect(response.status).toBe(403);
  });

  it('Super admin via x-super-admin-api-key → resolves company from workflow', async () => {
    process.env.SUPER_ADMIN_API_KEY = 'sa-secret';
    (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
      id: 'wf-1',
      company_id: 'company-1',
      is_public: false,
      visibility_scope: 'restricted',
      data_structure: baseDataStructure,
    });
    (workflowService.searchExecutionsByData as jest.Mock).mockResolvedValue({ total: 0, executionIds: [] });

    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set('x-super-admin-api-key', 'sa-secret')
      .send({ filters: { event_id: 1 } });

    expect(response.status).toBe(200);
    expect(workflowService.searchExecutionsByData).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1' })
    );
  });

  it('honors includeArchived for company API key callers', async () => {
    (workflowService.searchExecutionsByData as jest.Mock).mockResolvedValue({ total: 0, executionIds: [] });

    await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: 1 }, includeArchived: true });

    expect(workflowService.searchExecutionsByData).toHaveBeenCalledWith(
      expect.objectContaining({ includeArchived: true })
    );
  });

  it('ignores includeArchived for JWT users', async () => {
    mockJwtVerify.mockReturnValue(jwtUser);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'u@example.com',
      profile: { admin_role: { super_admin: false } },
    });
    (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({ role: 'member' });
    (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);
    (workflowService.searchExecutionsByData as jest.Mock).mockResolvedValue({ total: 0, executionIds: [] });

    await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set('Authorization', 'Bearer test-jwt')
      .send({ filters: { event_id: 1 }, includeArchived: true });

    expect(workflowService.searchExecutionsByData).toHaveBeenCalledWith(
      expect.objectContaining({ includeArchived: false })
    );
  });

  it('JWT user with no company_id on token resolves companyId from the workflow', async () => {
    // Real JWT users have only {id, email, super_admin} on req.user — no company_id.
    mockJwtVerify.mockReturnValue({ id: 'user-1', email: 'u@example.com', super_admin: false });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'u@example.com',
      profile: { admin_role: { super_admin: false } },
    });
    (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({ role: 'member' });
    (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);
    (workflowService.searchExecutionsByData as jest.Mock).mockResolvedValue({ total: 0, executionIds: [] });

    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set('Authorization', 'Bearer test-jwt')
      .send({ filters: { event_id: 1 } });

    expect(response.status).toBe(200);
    expect(workflowService.searchExecutionsByData).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1' }),
    );
  });

  it('returns 404 workflow_not_found when the workflow does not exist', async () => {
    (prisma.workflow.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/workflows/wf-missing/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: 1 } });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('workflow_not_found');
    expect(workflowService.searchExecutionsByData).not.toHaveBeenCalled();
  });

  it('returns 404 when an API-key caller targets a workflow in another company', async () => {
    // Lookup is scoped to req.company.id, so a foreign workflow returns null → 404.
    (prisma.workflow.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/workflows/wf-foreign/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: 1 } });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('workflow_not_found');
    // The lookup must have been scoped by company_id (no cross-company enumeration).
    expect(prisma.workflow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ company_id: 'company-1' }),
      })
    );
  });

  it('rejects null as a scalar filter value with invalid_field_value', async () => {
    // null cannot be expressed in jsonpath equality (`@ == null` is unknown), so the
    // boundary rejects it explicitly rather than silently returning empty results.
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_name: null } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_field_value');
    expect(response.body.field).toBe('event_name');
    expect(response.body.reason).toMatch(/non-null/i);
    expect(workflowService.searchExecutionsByData).not.toHaveBeenCalled();
  });

  it('rejects null as a child filter value with invalid_field_value', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { items: { sku: null } } });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_field_value');
    expect(response.body.field).toBe('items');
    expect(response.body.reason).toMatch(/non-null/i);
  });

  it('accepts pagination boundary limit=1', async () => {
    (workflowService.searchExecutionsByData as jest.Mock).mockResolvedValue({
      total: 0,
      executionIds: [],
    });

    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: 1 }, limit: 1, offset: 0 });

    expect(response.status).toBe(200);
    expect(workflowService.searchExecutionsByData).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1, offset: 0 })
    );
  });

  it('accepts pagination boundary limit=200', async () => {
    (workflowService.searchExecutionsByData as jest.Mock).mockResolvedValue({
      total: 0,
      executionIds: [],
    });

    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: 1 }, limit: 200 });

    expect(response.status).toBe(200);
    expect(workflowService.searchExecutionsByData).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 })
    );
  });

  it('rejects pagination limit=0 below the boundary', async () => {
    const response = await request(app)
      .post('/api/workflows/wf-1/executions/search')
      .set(apiKeyHeaders)
      .send({ filters: { event_id: 1 }, limit: 0 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_pagination');
  });
});
