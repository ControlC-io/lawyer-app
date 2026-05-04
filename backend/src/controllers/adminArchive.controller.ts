import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { archivePurgeService } from '../services/archivePurge.service';

type ArchiveEntity = 'workflows' | 'executions' | 'agents' | 'documents';
type BulkDeleteEntity = 'workflows' | 'executions' | 'documents';

const BULK_DELETE_MAX_IDS = 500;
const BULK_DELETE_ENTITIES: readonly BulkDeleteEntity[] = ['workflows', 'executions', 'documents'];

type BulkSkipReason = 'not_found' | 'workflow_archived';
interface BulkSkipEntry {
  id: string;
  reason: BulkSkipReason;
}

function assertSuperAdmin(req: AuthRequest, res: Response): boolean {
  if (req.user?.super_admin) return true;
  res.status(403).json({ error: 'Forbidden', details: 'Super admin only' });
  return false;
}

export const adminArchiveController = {
  async listArchived(req: AuthRequest, res: Response) {
    try {
      if (!assertSuperAdmin(req, res)) return;
      const entity = (req.query.entity as string | undefined)?.toLowerCase();

      const includeWorkflows = !entity || entity === 'workflows';
      const includeExecutions = !entity || entity === 'executions';
      const includeAgents = !entity || entity === 'agents';
      const includeDocuments = !entity || entity === 'documents';

      const [workflows, executions, agents, documents] = await Promise.all([
        includeWorkflows
          ? prisma.workflow.findMany({
              where: { is_archived: true },
              select: {
                id: true,
                name: true,
                company_id: true,
                archived_datetime: true,
                updated_at: true,
                company: { select: { name: true } },
              },
              orderBy: { archived_datetime: 'desc' },
            })
          : Promise.resolve([]),
        includeExecutions
          ? prisma.workflowExecution.findMany({
              where: { is_archived: true },
              select: {
                id: true,
                name: true,
                status: true,
                company_id: true,
                workflow_id: true,
                archived_datetime: true,
                created_at: true,
                workflow: { select: { name: true, is_archived: true } },
                company: { select: { name: true } },
              },
              orderBy: { archived_datetime: 'desc' },
            })
          : Promise.resolve([]),
        includeAgents
          ? prisma.agentConfiguration.findMany({
              where: { is_archived: true },
              select: {
                id: true,
                name: true,
                agent_type: true,
                archived_datetime: true,
                updated_at: true,
              },
              orderBy: { archived_datetime: 'desc' },
            })
          : Promise.resolve([]),
        includeDocuments
          ? prisma.file.findMany({
              where: { is_archived: true },
              select: {
                id: true,
                name: true,
                company_id: true,
                storage_path: true,
                mime_type: true,
                size_bytes: true,
                archived_datetime: true,
                created_at: true,
                company: { select: { name: true } },
              },
              orderBy: { archived_datetime: 'desc' },
            })
          : Promise.resolve([]),
      ]);

      return res.json({
        workflows: workflows.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          company_id: workflow.company_id,
          company_name: workflow.company?.name ?? null,
          archived_datetime: workflow.archived_datetime,
          updated_at: workflow.updated_at,
        })),
        workflow_executions: executions.map((execution) => ({
          id: execution.id,
          name: execution.name,
          status: execution.status,
          workflow_id: execution.workflow_id,
          workflow_name: execution.workflow?.name ?? null,
          workflow_archived: execution.workflow?.is_archived ?? false,
          company_id: execution.company_id,
          company_name: execution.company?.name ?? null,
          archived_datetime: execution.archived_datetime,
          created_at: execution.created_at,
        })),
        agent_configurations: agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          agent_type: agent.agent_type,
          archived_datetime: agent.archived_datetime,
          updated_at: agent.updated_at,
        })),
        documents: documents.map((file) => ({
          id: file.id,
          name: file.name,
          company_id: file.company_id,
          company_name: file.company?.name ?? null,
          storage_path: file.storage_path,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes != null ? Number(file.size_bytes) : 0,
          archived_datetime: file.archived_datetime,
          created_at: file.created_at,
        })),
      });
    } catch (error) {
      console.error('listArchived error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async unarchiveRecord(req: AuthRequest, res: Response) {
    try {
      if (!assertSuperAdmin(req, res)) return;
      const { entity, id } = req.params as { entity: ArchiveEntity; id: string };

      if (!entity || !id) {
        return res.status(400).json({ error: 'Missing entity or id' });
      }
      if (!['workflows', 'executions', 'agents', 'documents'].includes(entity)) {
        return res.status(400).json({ error: 'Invalid entity', details: 'Allowed: workflows, executions, agents, documents' });
      }

      if (entity === 'executions') {
        const execution = await prisma.workflowExecution.findUnique({
          where: { id },
          select: {
            id: true,
            is_archived: true,
            workflow: { select: { is_archived: true } },
          },
        });
        if (!execution || !execution.is_archived) {
          return res.status(404).json({ error: 'Archived execution not found' });
        }
        if (execution.workflow?.is_archived) {
          return res.status(409).json({
            error: 'Cannot unarchive execution',
            details: 'Unarchive the parent workflow first',
          });
        }
      }

      let count = 0;
      const unarchiveData = { is_archived: false, archived_datetime: null };

      switch (entity) {
        case 'workflows': {
          const result = await prisma.workflow.updateMany({
            where: { id, is_archived: true },
            data: unarchiveData,
          });
          count = result.count;
          break;
        }
        case 'executions': {
          const result = await prisma.workflowExecution.updateMany({
            where: { id, is_archived: true },
            data: {
              ...unarchiveData,
              // ensure step pointer starts from a clean state after archival
              current_step_id: null,
            },
          });
          count = result.count;
          break;
        }
        case 'agents': {
          const result = await prisma.agentConfiguration.updateMany({
            where: { id, is_archived: true },
            data: unarchiveData,
          });
          count = result.count;
          break;
        }
        case 'documents': {
          const result = await prisma.file.updateMany({
            where: { id, is_archived: true },
            data: unarchiveData,
          });
          count = result.count;
          break;
        }
      }

      if (count === 0) {
        return res.status(404).json({ error: 'Archived record not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('unarchiveRecord error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async bulkDeleteArchived(req: AuthRequest, res: Response) {
    try {
      if (!assertSuperAdmin(req, res)) return;

      const entity = req.params.entity as string | undefined;
      if (!entity || !BULK_DELETE_ENTITIES.includes(entity as BulkDeleteEntity)) {
        return res.status(400).json({
          error: 'Invalid entity',
          details: `Allowed: ${BULK_DELETE_ENTITIES.join(', ')}`,
        });
      }

      const rawIds = (req.body as { ids?: unknown })?.ids;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return res.status(400).json({ error: 'Missing ids', details: 'Provide a non-empty array of ids' });
      }
      if (rawIds.length > BULK_DELETE_MAX_IDS) {
        return res.status(400).json({
          error: 'Too many ids',
          details: `Max ${BULK_DELETE_MAX_IDS} ids per request`,
        });
      }
      const ids = Array.from(
        new Set(
          rawIds.filter((value): value is string => typeof value === 'string' && value.length > 0),
        ),
      );
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Missing ids', details: 'Ids must be non-empty strings' });
      }

      const skipped: BulkSkipEntry[] = [];
      const typedEntity = entity as BulkDeleteEntity;

      if (typedEntity === 'workflows') {
        const archived = await prisma.workflow.findMany({
          where: { id: { in: ids }, is_archived: true },
          select: { id: true },
        });
        const archivedSet = new Set(archived.map((row) => row.id));
        for (const id of ids) {
          if (!archivedSet.has(id)) skipped.push({ id, reason: 'not_found' });
        }
        const candidateIds = ids.filter((id) => archivedSet.has(id));
        const result = await archivePurgeService.purgeWorkflowsByIds(candidateIds);
        for (const blockedId of result.blocked) {
          skipped.push({ id: blockedId, reason: 'workflow_archived' });
        }
        return res.json({ deleted: result.purged, skipped });
      }

      if (typedEntity === 'executions') {
        const archived = await prisma.workflowExecution.findMany({
          where: { id: { in: ids }, is_archived: true },
          select: { id: true, workflow: { select: { is_archived: true } } },
        });
        const archivedById = new Map(archived.map((row) => [row.id, row]));
        const deletable: string[] = [];
        for (const id of ids) {
          const row = archivedById.get(id);
          if (!row) {
            skipped.push({ id, reason: 'not_found' });
            continue;
          }
          if (row.workflow?.is_archived) {
            skipped.push({ id, reason: 'workflow_archived' });
            continue;
          }
          deletable.push(id);
        }
        await archivePurgeService.purgeExecutionsByIds(deletable);
        return res.json({ deleted: deletable, skipped });
      }

      // documents
      const archived = await prisma.file.findMany({
        where: { id: { in: ids }, is_archived: true },
        select: { id: true },
      });
      const archivedSet = new Set(archived.map((row) => row.id));
      for (const id of ids) {
        if (!archivedSet.has(id)) skipped.push({ id, reason: 'not_found' });
      }
      const deletable = ids.filter((id) => archivedSet.has(id));
      await archivePurgeService.purgeFilesByIds(deletable);
      return res.json({ deleted: deletable, skipped });
    } catch (error) {
      console.error('bulkDeleteArchived error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
};
