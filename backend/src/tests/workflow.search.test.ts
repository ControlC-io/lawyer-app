import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';

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
});
