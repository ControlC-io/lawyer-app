import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { archivePurgeService } from '../services/archivePurge.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    workflow: { findMany: jest.fn() },
    workflowExecution: { findMany: jest.fn() },
    file: { findMany: jest.fn() },
  },
}));

jest.mock('../services/archivePurge.service', () => ({
  archivePurgeService: {
    purgeWorkflowsByIds: jest.fn(),
    purgeExecutionsByIds: jest.fn(),
    purgeFilesByIds: jest.fn(),
  },
}));

describe('POST /api/admin/archived/:entity/bulk-delete', () => {
  const superAdminApiKey = 'test-super-admin-key';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPER_ADMIN_API_KEY = superAdminApiKey;
  });

  describe('authorization', () => {
    it('returns 401 without any credentials', async () => {
      const response = await request(app)
        .post('/api/admin/archived/workflows/bulk-delete')
        .send({ ids: ['wf-1'] });
      expect(response.status).toBe(401);
    });

    it('returns 401 when super-admin api key is wrong', async () => {
      const response = await request(app)
        .post('/api/admin/archived/workflows/bulk-delete')
        .set('x-super-admin-api-key', 'nope')
        .send({ ids: ['wf-1'] });
      expect(response.status).toBe(401);
    });
  });

  describe('validation', () => {
    it('rejects unknown entity', async () => {
      const response = await request(app)
        .post('/api/admin/archived/agents/bulk-delete')
        .set('x-super-admin-api-key', superAdminApiKey)
        .send({ ids: ['x'] });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid entity');
    });

    it('rejects empty ids array', async () => {
      const response = await request(app)
        .post('/api/admin/archived/workflows/bulk-delete')
        .set('x-super-admin-api-key', superAdminApiKey)
        .send({ ids: [] });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing ids');
    });

    it('rejects when ids are not strings', async () => {
      const response = await request(app)
        .post('/api/admin/archived/workflows/bulk-delete')
        .set('x-super-admin-api-key', superAdminApiKey)
        .send({ ids: [1, 2, 3] });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing ids');
    });

    it('rejects when ids array exceeds the cap', async () => {
      const ids = Array.from({ length: 501 }, (_, index) => `id-${index}`);
      const response = await request(app)
        .post('/api/admin/archived/workflows/bulk-delete')
        .set('x-super-admin-api-key', superAdminApiKey)
        .send({ ids });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Too many ids');
    });
  });

  describe('workflows', () => {
    it('deletes archived workflows and reports skipped not_found ids', async () => {
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([
        { id: 'wf-1' },
        { id: 'wf-2' },
      ]);
      (archivePurgeService.purgeWorkflowsByIds as jest.Mock).mockResolvedValue({
        purged: ['wf-1', 'wf-2'],
        blocked: [],
      });

      const response = await request(app)
        .post('/api/admin/archived/workflows/bulk-delete')
        .set('x-super-admin-api-key', superAdminApiKey)
        .send({ ids: ['wf-1', 'wf-2', 'wf-missing'] });

      expect(response.status).toBe(200);
      expect(response.body.deleted).toEqual(['wf-1', 'wf-2']);
      expect(response.body.skipped).toEqual([{ id: 'wf-missing', reason: 'not_found' }]);
      expect(prisma.workflow.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['wf-1', 'wf-2', 'wf-missing'] }, is_archived: true },
        select: { id: true },
      });
      expect(archivePurgeService.purgeWorkflowsByIds).toHaveBeenCalledWith(['wf-1', 'wf-2']);
    });

    it('forwards blocked workflows from the service as skipped entries', async () => {
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([
        { id: 'wf-1' },
        { id: 'wf-2' },
      ]);
      (archivePurgeService.purgeWorkflowsByIds as jest.Mock).mockResolvedValue({
        purged: ['wf-1'],
        blocked: ['wf-2'],
      });

      const response = await request(app)
        .post('/api/admin/archived/workflows/bulk-delete')
        .set('x-super-admin-api-key', superAdminApiKey)
        .send({ ids: ['wf-1', 'wf-2'] });

      expect(response.status).toBe(200);
      expect(response.body.deleted).toEqual(['wf-1']);
      expect(response.body.skipped).toEqual([
        { id: 'wf-2', reason: 'workflow_archived' },
      ]);
    });

    it('deduplicates the supplied ids before querying', async () => {
      (prisma.workflow.findMany as jest.Mock).mockResolvedValue([{ id: 'wf-1' }]);
      (archivePurgeService.purgeWorkflowsByIds as jest.Mock).mockResolvedValue({
        purged: ['wf-1'],
        blocked: [],
      });

      const response = await request(app)
        .post('/api/admin/archived/workflows/bulk-delete')
        .set('x-super-admin-api-key', superAdminApiKey)
        .send({ ids: ['wf-1', 'wf-1', 'wf-1'] });

      expect(response.status).toBe(200);
      expect(prisma.workflow.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['wf-1'] }, is_archived: true },
        select: { id: true },
      });
      expect(archivePurgeService.purgeWorkflowsByIds).toHaveBeenCalledWith(['wf-1']);
    });
  });

  describe('executions', () => {
    it('deletes archived executions and skips ones whose workflow is still archived', async () => {
      (prisma.workflowExecution.findMany as jest.Mock).mockResolvedValue([
        { id: 'exec-1', workflow: { is_archived: false } },
        { id: 'exec-2', workflow: { is_archived: true } },
      ]);
      (archivePurgeService.purgeExecutionsByIds as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .post('/api/admin/archived/executions/bulk-delete')
        .set('x-super-admin-api-key', superAdminApiKey)
        .send({ ids: ['exec-1', 'exec-2', 'exec-missing'] });

      expect(response.status).toBe(200);
      expect(response.body.deleted).toEqual(['exec-1']);
      expect(response.body.skipped).toEqual(
        expect.arrayContaining([
          { id: 'exec-2', reason: 'workflow_archived' },
          { id: 'exec-missing', reason: 'not_found' },
        ]),
      );
      expect(archivePurgeService.purgeExecutionsByIds).toHaveBeenCalledWith(['exec-1']);
    });
  });

  describe('documents', () => {
    it('deletes archived files and reports missing ids', async () => {
      (prisma.file.findMany as jest.Mock).mockResolvedValue([{ id: 'file-1' }]);
      (archivePurgeService.purgeFilesByIds as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .post('/api/admin/archived/documents/bulk-delete')
        .set('x-super-admin-api-key', superAdminApiKey)
        .send({ ids: ['file-1', 'file-missing'] });

      expect(response.status).toBe(200);
      expect(response.body.deleted).toEqual(['file-1']);
      expect(response.body.skipped).toEqual([{ id: 'file-missing', reason: 'not_found' }]);
      expect(archivePurgeService.purgeFilesByIds).toHaveBeenCalledWith(['file-1']);
    });
  });
});
