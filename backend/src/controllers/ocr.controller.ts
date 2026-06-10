import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { appendFileHistoryEvent, FILE_HISTORY_EVENT_TYPE, normalizeFileHistoryActorId } from '../lib/fileHistory';
import { processDocumentOcr } from '../services/ocr.service';

/**
 * Authorize the caller for a file across every auth mode authMiddleware accepts:
 *   - super admin (JWT or key)  -> any file
 *   - company API key           -> only files in that company
 *   - JWT user                  -> must belong to the file's company
 * Returns null when allowed, otherwise an { status, error } to send back.
 */
async function authorizeFileAccess(
  req: AuthRequest,
  file: { company_id: string | null }
): Promise<{ status: number; error: string } | null> {
  if (req.user?.super_admin) return null;

  if (req.company?.id) {
    return file.company_id === req.company.id
      ? null
      : { status: 403, error: 'Access denied' };
  }

  if (req.user?.id) {
    // A file with no company is not company-scoped, so any authenticated user may read it.
    if (!file.company_id) return null;
    const membership = await prisma.userCompany.findFirst({
      where: { user_id: req.user.id, company_id: file.company_id },
    });
    return membership ? null : { status: 403, error: 'Access denied' };
  }

  return { status: 401, error: 'Unauthorized' };
}

export const ocrController = {
  async triggerOcr(req: AuthRequest, res: Response) {
    try {
      const { fileId } = req.params;

      const file = await prisma.file.findFirst({
        where: { id: fileId },
        select: { id: true, company_id: true, ocr_status: true },
      });
      if (!file) return res.status(404).json({ error: 'File not found' });

      const denied = await authorizeFileAccess(req, file);
      if (denied) return res.status(denied.status).json({ error: denied.error });

      if (file.company_id) {
        await appendFileHistoryEvent({
          companyId: file.company_id,
          fileId,
          eventType: FILE_HISTORY_EVENT_TYPE.OCR_REQUESTED,
          actorId: normalizeFileHistoryActorId(req.user?.id ?? null),
          details: { source: 'manual_trigger' },
        });
      }

      const updated = await prisma.file.update({
        where: { id: fileId },
        data: { ocr_status: 'pending' },
      });

      processDocumentOcr(fileId).catch((err) => {
        console.error(`OCR processing failed for file ${fileId}:`, err);
      });

      return res.status(202).json({
        ocrStatus: updated.ocr_status,
        ocrProcessedAt: updated.ocr_processed_at,
        ocrError: updated.ocr_error,
      });
    } catch (error) {
      console.error('triggerOcr error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async getOcr(req: AuthRequest, res: Response) {
    try {
      const { fileId } = req.params;

      const file = await prisma.file.findFirst({
        where: { id: fileId },
        select: {
          id: true,
          company_id: true,
          ocr_status: true,
          ocr_markdown: true,
          ocr_processed_at: true,
          ocr_provider: true,
          ocr_model: true,
          ocr_error: true,
          ocr_pending_metadata_key_ids: true,
          metadata_ai_extract_status: true,
          metadata_ai_extract_error: true,
        },
      });
      if (!file) return res.status(404).json({ error: 'File not found' });

      const denied = await authorizeFileAccess(req, file);
      if (denied) return res.status(denied.status).json({ error: denied.error });

      if (!file.ocr_status) {
        return res.status(404).json({ error: 'OCR has not been run on this document' });
      }

      return res.json({
        ocrStatus: file.ocr_status,
        ocrMarkdown: file.ocr_markdown,
        ocrProcessedAt: file.ocr_processed_at,
        ocrProvider: file.ocr_provider,
        ocrModel: file.ocr_model,
        ocrError: file.ocr_error,
        ocrPendingMetadataKeyIds: file.ocr_pending_metadata_key_ids,
        metadataAiExtractStatus: file.metadata_ai_extract_status,
        metadataAiExtractError: file.metadata_ai_extract_error,
      });
    } catch (error) {
      console.error('getOcr error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
};
