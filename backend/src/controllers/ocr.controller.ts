import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { processDocumentOcr } from '../services/ocr.service';

export const ocrController = {
  async triggerOcr(req: AuthRequest, res: Response) {
    try {
      const { fileId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const file = await prisma.file.findFirst({
        where: { id: fileId },
        select: { id: true, company_id: true, ocr_status: true },
      });
      if (!file) return res.status(404).json({ error: 'File not found' });

      if (file.company_id) {
        const membership = await prisma.userCompany.findFirst({
          where: { user_id: userId, company_id: file.company_id },
        });
        if (!membership && !req.user?.super_admin) {
          return res.status(403).json({ error: 'Access denied' });
        }
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
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

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

      if (file.company_id) {
        const membership = await prisma.userCompany.findFirst({
          where: { user_id: userId, company_id: file.company_id },
        });
        if (!membership && !req.user?.super_admin) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

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
