import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { archivePurgeService } from '../services/archivePurge.service';

const BULK_DELETE_MAX_IDS = 500;

function assertSuperAdmin(req: AuthRequest, res: Response): boolean {
  if (req.user?.super_admin) return true;
  res.status(403).json({ error: 'Forbidden', details: 'Super admin only' });
  return false;
}

export const adminArchiveController = {
  async listArchived(req: AuthRequest, res: Response) {
    try {
      if (!assertSuperAdmin(req, res)) return;

      const documents = await prisma.file.findMany({
        where: { is_archived: true },
        select: {
          id: true,
          name: true,
          company_id: true,
          mime_type: true,
          archived_datetime: true,
          company: { select: { name: true } },
        },
        orderBy: { archived_datetime: 'desc' },
      });

      return res.json({
        documents: documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          company_id: doc.company_id,
          company_name: doc.company?.name ?? null,
          mime_type: doc.mime_type,
          archived_datetime: doc.archived_datetime,
        })),
      });
    } catch (error) {
      console.error('listArchived error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async bulkDelete(req: AuthRequest, res: Response) {
    try {
      if (!assertSuperAdmin(req, res)) return;

      const { entity, ids } = req.body as { entity?: string; ids?: string[] };
      if (entity !== 'documents') {
        return res.status(400).json({ error: 'Only documents bulk delete is supported' });
      }
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids must be a non-empty array' });
      }
      if (ids.length > BULK_DELETE_MAX_IDS) {
        return res.status(400).json({ error: `Cannot delete more than ${BULK_DELETE_MAX_IDS} items at once` });
      }

      const archivedFiles = await prisma.file.findMany({
        where: { id: { in: ids }, is_archived: true },
        select: { id: true },
      });
      const archivedIds = new Set(archivedFiles.map((f) => f.id));
      const toDelete = ids.filter((id) => archivedIds.has(id));
      const skipped = ids.filter((id) => !archivedIds.has(id)).map((id) => ({ id, reason: 'not_found' as const }));

      const deletedCount = await archivePurgeService.purgeFilesByIds(toDelete);

      return res.json({
        deleted: toDelete.slice(0, deletedCount),
        skipped,
      });
    } catch (error) {
      console.error('bulkDelete error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
};
