import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { canUserAccessFolder, getUserFolderPermissionLevel, getUserGroupIdsInCompany } from '../lib/folderAccess';
import { canUserAccessFileByMetadata } from '../lib/documentAccess';
import { appendFileHistoryEvent, FILE_HISTORY_EVENT_TYPE, normalizeFileHistoryActorId } from '../lib/fileHistory';
import { getDocumentProxyUrl } from '../lib/documentUrl';
import { storageService } from '../services/storage.service';
import multer from 'multer';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Sanitize filename for storage
 */
function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    return 'file';
  }

  let sanitized = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f,;=+&%$#@!~`{}[\]()]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!sanitized || sanitized.length === 0) {
    sanitized = 'file';
  }

  return sanitized;
}

export const filesController = {
  /**
   * Multer middleware for file upload
   */
  uploadMiddleware: upload.single('file'),

  /** Flat company documents upload: 1–25 files, field name `file` (repeatable). */
  uploadFlatDocumentsMiddleware: upload.array('file', 25),

  /**
   * POST /api/files/signed-url
   * Get a signed URL for file access (was: get-signed-url).
   * For the documents bucket we return a proxy URL (same as document-url) so clients never get MinIO internal URLs.
   */
  async getSignedUrl(req: AuthRequest, res: Response) {
    try {
      const { bucket, path, expiresIn, filename } = req.body;

      if (!bucket || !path) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'bucket and path are required',
        });
      }

      const documentsBucket = storageService.getDocumentsBucket();
      if (bucket === documentsBucket) {
        const signedUrl = getDocumentProxyUrl(path, false, typeof filename === 'string' ? filename : undefined);
        return res.json({ signedUrl });
      }

      const rawExpiration =
        typeof expiresIn === 'number'
          ? expiresIn
          : typeof expiresIn === 'string'
          ? parseInt(expiresIn, 10)
          : undefined;
      const expirationSeconds =
        typeof rawExpiration === 'number' && Number.isFinite(rawExpiration)
          ? rawExpiration
          : undefined;

      const signedUrl = await storageService.getSignedUrl(
        bucket,
        path,
        expirationSeconds
      );

      return res.json({ signedUrl });
    } catch (error) {
      console.error('Error creating signed URL:', error);
      return res.status(500).json({
        error: 'Failed to create signed URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/files/document-url
   * Get a short-lived URL to stream a company document (for preview/download).
   * Auth: JWT required. User must have access to the file's company.
   */
  async getDocumentUrl(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }
      const { fileId, download } = req.body;
      if (!fileId || typeof fileId !== 'string') {
        return res.status(400).json({ error: 'Missing fileId' });
      }
      const fileRecord = await prisma.file.findFirst({
        where: { id: fileId, is_archived: false },
        select: { storage_path: true, company_id: true, folder_id: true },
      });
      if (!fileRecord || !fileRecord.company_id) {
        return res.status(404).json({ error: 'File not found' });
      }
      const userCompany = await prisma.userCompany.findFirst({
        where: { user_id: userId, company_id: fileRecord.company_id },
      });
      if (!userCompany) {
        return res.status(403).json({ error: 'Forbidden', details: 'No access to this file' });
      }
      const isCompanyAdmin = userCompany.role === 'company_admin';
      const userGroupIds = await getUserGroupIdsInCompany(userId, fileRecord.company_id);
      if (fileRecord.folder_id) {
        const allowed = await canUserAccessFolder(userId, fileRecord.company_id, fileRecord.folder_id, isCompanyAdmin, userGroupIds);
        if (!allowed) {
          return res.status(403).json({ error: 'You do not have access to this folder' });
        }
      } else {
        // Flat files: check document permission rules
        const level = await canUserAccessFileByMetadata({ userId, companyId: fileRecord.company_id, fileId, isCompanyAdmin, userGroupIds });
        if (!level) {
          return res.status(403).json({ error: 'You do not have access to this file' });
        }
      }
      const url = getDocumentProxyUrl(fileRecord.storage_path, Boolean(download));
      return res.json({ url });
    } catch (error) {
      console.error('Error creating document URL:', error);
      return res.status(500).json({
        error: 'Failed to create document URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/files/document?token=...
   * Stream a document using a short-lived JWT (no auth header; for img/iframe/download).
   */
  async streamDocument(req: AuthRequest, res: Response) {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.status(400).json({ error: 'Missing token' });
      }
      let payload: { path: string; download?: boolean; filename?: string; exp?: number };
      try {
        payload = jwt.verify(token, JWT_SECRET) as { path: string; download?: boolean; filename?: string; exp?: number };
      } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      const path = payload.path;
      if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: 'Invalid token payload' });
      }
      const bucket = storageService.getDocumentsBucket();
      const stream = await storageService.downloadFile(bucket, path);
      const stat = await storageService.getFileStat(bucket, path).catch(() => null);
      const contentType = stat?.contentType || 'application/octet-stream';
      const filename =
        typeof payload.filename === 'string' && payload.filename.length > 0
          ? payload.filename
          : path.split('/').pop()?.replace(/^\d+_/, '') || 'download';
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        payload.download ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`
      );
      stream.pipe(res);
    } catch (error) {
      console.error('Error streaming document:', error);
      if (!res.headersSent) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        const isNotFound = msg.includes('does not exist') || msg.includes('NoSuchKey') || msg.includes('Not Found');
        return res.status(isNotFound ? 404 : 500).json({
          error: isNotFound ? 'File not found in storage' : 'Failed to stream document',
          details: msg,
        });
      }
    }
  },

  /**
   * POST /api/files/documents/upload
   * Upload a file to the documents bucket at a given path (JWT required)
   * Body: path (string), file (multipart)
   */
  async uploadDocument(req: AuthRequest, res: Response) {
    try {
      const path = req.body?.path as string;
      const file = req.file;
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      if (!path || typeof path !== 'string') return res.status(400).json({ error: 'Missing path' });
      if (!file) return res.status(400).json({ error: 'Missing file' });
      const sanitized = sanitizeFileName(file.originalname);
      const storagePath = path.replace(/^\/+/, '').replace(/\.\./g, '');
      await storageService.uploadFile(
        storageService.getDocumentsBucket(),
        storagePath,
        file.buffer,
        file.mimetype
      );
      return res.status(201).json({ path: storagePath });
    } catch (error) {
      console.error('uploadDocument error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * POST /api/companies/:companyId/folders/:folderId/upload
   * Upload a document to a folder (JWT, user must belong to company)
   */
  async uploadCompanyDocument(req: AuthRequest, res: Response) {
    try {
      const { companyId, folderId } = req.params;
      const file = req.file;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }
      if (!companyId || !folderId) {
        return res.status(400).json({ error: 'Missing company ID or folder ID' });
      }
      if (!file) {
        return res.status(400).json({ error: 'Missing file', details: 'File is required' });
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { user_id: userId, company_id: companyId },
      });
      if (!userCompany) {
        return res.status(403).json({ error: 'Forbidden', details: 'You do not have access to this company' });
      }

      const folder = await prisma.folder.findFirst({
        where: { id: folderId, company_id: companyId },
      });
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found', details: 'Folder not found or access denied' });
      }

      const isCompanyAdmin = userCompany.role === 'company_admin';
      const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);
      const allowed = await canUserAccessFolder(userId, companyId, folderId, isCompanyAdmin, userGroupIds);
      if (!allowed) {
        return res.status(403).json({ error: 'You do not have access to this folder' });
      }
      const level = await getUserFolderPermissionLevel(userId, companyId, folderId, isCompanyAdmin, userGroupIds);
      if (level !== 'write') {
        return res.status(403).json({ error: 'Write permission required to upload in this folder' });
      }

      const sanitized = sanitizeFileName(file.originalname);
      const storagePath = `companies/${companyId}/${folderId}/${Date.now()}_${sanitized}`;

      await storageService.uploadFile(
        storageService.getDocumentsBucket(),
        storagePath,
        file.buffer,
        file.mimetype
      );

      const fileRecord = await prisma.file.create({
        data: {
          folder_id: folderId,
          company_id: companyId,
          name: file.originalname,
          storage_path: storagePath,
          mime_type: file.mimetype,
          size_bytes: BigInt(file.size),
          uploaded_by: userId,
        },
      });

      await appendFileHistoryEvent({
        companyId,
        fileId: fileRecord.id,
        eventType: FILE_HISTORY_EVENT_TYPE.FILE_UPLOADED,
        actorId: normalizeFileHistoryActorId(userId),
        details: { name: file.originalname, source: 'folder_upload' },
      });

      // Trigger OCR if requested
      const ocrRequested = req.body?.ocr === 'true' || req.body?.ocr === true;
      if (ocrRequested) {
        await appendFileHistoryEvent({
          companyId,
          fileId: fileRecord.id,
          eventType: FILE_HISTORY_EVENT_TYPE.OCR_REQUESTED,
          actorId: normalizeFileHistoryActorId(userId),
          details: { source: 'folder_upload' },
        });
        const { processDocumentOcr } = require('../services/ocr.service');
        processDocumentOcr(fileRecord.id).catch((err: Error) => {
          console.error(`OCR processing failed for file ${fileRecord.id}:`, err);
        });
      }

      return res.status(201).json({
        ...fileRecord,
        size_bytes: fileRecord.size_bytes?.toString(),
      });
    } catch (error) {
      console.error('uploadCompanyDocument error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * DELETE /api/companies/:companyId/files/:fileId
   * Delete a document (JWT, user must belong to company)
   */
  async deleteCompanyFile(req: AuthRequest, res: Response) {
    try {
      const { companyId, fileId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }
      if (!companyId || !fileId) {
        return res.status(400).json({ error: 'Missing company ID or file ID' });
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { user_id: userId, company_id: companyId },
      });
      if (!userCompany) {
        return res.status(403).json({ error: 'Forbidden', details: 'You do not have access to this company' });
      }

      const fileRecord = await prisma.file.findFirst({
        where: { id: fileId, company_id: companyId, is_archived: false },
      });
      if (!fileRecord) {
        return res.status(404).json({ error: 'File not found', details: 'File not found or access denied' });
      }

      const isCompanyAdmin = userCompany.role === 'company_admin';
      const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);
      if (fileRecord.folder_id) {
        // Folder-based files: check folder permissions
        const allowed = await canUserAccessFolder(userId, companyId, fileRecord.folder_id, isCompanyAdmin, userGroupIds);
        if (!allowed) {
          return res.status(403).json({ error: 'You do not have access to this folder' });
        }
        const level = await getUserFolderPermissionLevel(userId, companyId, fileRecord.folder_id, isCompanyAdmin, userGroupIds);
        if (level !== 'write') {
          return res.status(403).json({ error: 'Write permission required to delete files in this folder' });
        }
      } else {
        // Flat files: check document permission rules for write access
        const level = await canUserAccessFileByMetadata({ userId, companyId, fileId, isCompanyAdmin, userGroupIds });
        if (level !== 'write') {
          return res.status(403).json({ error: 'Write permission required to delete this file' });
        }
      }

      await prisma.file.updateMany({
        where: { id: fileId, company_id: companyId },
        data: {
          is_archived: true,
          archived_datetime: new Date(),
        },
      });

      return res.status(204).send();
    } catch (error) {
      console.error('deleteCompanyFile error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
