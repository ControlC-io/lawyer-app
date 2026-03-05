import { Response } from 'express';
import { AuthRequest, resolveCompanyForRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { canUserAccessFolder, getUserFolderPermissionLevel, getUserGroupIdsInCompany } from '../lib/folderAccess';
import { canUserAccessFileByMetadata } from '../lib/documentAccess';
import { getDocumentProxyUrl } from '../lib/documentUrl';
import { storageService } from '../services/storage.service';
import { workflowService } from '../services/workflow.service';
import multer from 'multer';
import fetch from 'node-fetch';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const DOCUMENT_TOKEN_EXPIRY = 5 * 60; // 5 minutes

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

  /**
   * POST /api/workflows/executions/:executionId/files
   * Upload a file for an execution (was: upload-execution-file)
   */
  async uploadExecutionFile(req: AuthRequest, res: Response) {
    try {
      if (!(await resolveCompanyForRequest(req, res))) return;
      const { executionId } = req.params;
      const { field_name, file_url, file_base64, file_name, mime_type } = req.body;
      const companyId = req.company!.id;

      if (!executionId || !field_name) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'execution_id and field_name are required',
        });
      }

      if (!file_url && !file_base64) {
        return res.status(400).json({
          error: 'Missing required field',
          details: 'Either file_url or file_base64 is required',
        });
      }

      if (file_url && file_base64) {
        return res.status(400).json({
          error: 'Invalid request',
          details: 'Cannot provide both file_url and file_base64',
        });
      }

      // Verify execution belongs to company
      const execution = await prisma.workflowExecution.findFirst({
        where: {
          id: executionId,
          company_id: companyId,
        },
        include: {
          workflow: {
            select: {
              data_structure: true,
            },
          },
        },
      });

      if (!execution) {
        return res.status(404).json({
          error: 'Execution not found or access denied',
        });
      }

      const workflow = execution.workflow;
      if (!workflow.data_structure || !Array.isArray(workflow.data_structure)) {
        return res.status(400).json({
          error: 'Workflow data structure not found',
        });
      }

      // Find field by name
      const field = (workflow.data_structure as any[]).find(
        (f: any) => f.name === field_name
      );

      if (!field) {
        return res.status(404).json({
          error: 'Field not found',
          details: `Field "${field_name}" not found in the workflow data structure`,
        });
      }

      const fieldId = field.id;

      // Prepare file data
      let fileBuffer: Buffer;
      let fileName: string;
      let detectedMimeType: string | null = mime_type || null;

      if (file_url) {
        // Download file from URL
        try {
          const fileResponse = await fetch(file_url);
          if (!fileResponse.ok) {
            return res.status(400).json({
              error: 'Failed to download file',
              details: `HTTP ${fileResponse.status}: ${fileResponse.statusText}`,
            });
          }

          fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
          fileName = file_name || new URL(file_url).pathname.split('/').pop() || 'uploaded_file';
          detectedMimeType = detectedMimeType || fileResponse.headers.get('content-type') || null;
        } catch (error) {
          return res.status(400).json({
            error: 'Failed to download file from URL',
            details: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      } else if (file_base64) {
        // Decode base64
        try {
          let base64Data = file_base64;
          if (file_base64.includes(',')) {
            const parts = file_base64.split(',');
            if (parts.length === 2) {
              const mimeMatch = parts[0].match(/data:([^;]+)/);
              if (mimeMatch && !detectedMimeType) {
                detectedMimeType = mimeMatch[1];
              }
              base64Data = parts[1];
            }
          }

          fileBuffer = Buffer.from(base64Data, 'base64');
          fileName = file_name || 'uploaded_file';
        } catch (error) {
          return res.status(400).json({
            error: 'Failed to decode base64 file',
            details: error instanceof Error ? error.message : 'Invalid base64 data',
          });
        }
      } else {
        return res.status(400).json({ error: 'No file data provided' });
      }

      // Sanitize filename
      const timestamp = Date.now();
      const sanitizedFileName = sanitizeFileName(fileName);
      const storagePath = `executions/${executionId}/${timestamp}_${sanitizedFileName}`;

      // Upload to MinIO
      await storageService.uploadFile(
        storageService.getDocumentsBucket(),
        storagePath,
        fileBuffer,
        detectedMimeType || undefined
      );

      // Fetch existing execution data
      const executionDataRow = await prisma.workflowExecutionData.findFirst({
        where: { execution_id: executionId },
      });

      if (!executionDataRow) {
        return res.status(404).json({
          error: 'Execution data not found',
        });
      }

      // Update execution data with file path
      const currentValues = (executionDataRow.values || {}) as Record<string, any>;
      const fieldType = field.field_type || 'file';
      const isMultipleFiles = fieldType === 'multiple_files';

      let updatedFieldValue: any;

      if (isMultipleFiles) {
        const currentFileArray = Array.isArray(currentValues[fieldId]?.value)
          ? currentValues[fieldId].value
          : currentValues[fieldId]?.value
          ? [currentValues[fieldId].value]
          : [];
        const currentOriginalNames = Array.isArray(currentValues[fieldId]?.original_name)
          ? currentValues[fieldId].original_name
          : currentValues[fieldId]?.original_name
          ? [currentValues[fieldId].original_name]
          : [];

        updatedFieldValue = {
          ...currentValues[fieldId],
          value: [...currentFileArray, storagePath],
          original_name: [...currentOriginalNames, fileName],
        };
      } else {
        updatedFieldValue = {
          ...currentValues[fieldId],
          value: storagePath,
          original_name: fileName,
        };
      }

      const updatedValues = {
        ...currentValues,
        [fieldId]: updatedFieldValue,
      };

      await prisma.workflowExecutionData.update({
        where: { id: executionDataRow.id },
        data: { values: updatedValues },
      });

      return res.json({
        success: true,
        message: 'File uploaded and execution data updated successfully',
        file_path: storagePath,
        field_name,
        field_id: fieldId,
      });
    } catch (error) {
      console.error('Error uploading execution file:', error);
      return res.status(500).json({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/files/upload
   * Upload an external file (was: upload-external-file)
   */
  async uploadExternalFile(req: AuthRequest, res: Response) {
    try {
      const file = req.file;
      const { token } = req.body;

      if (!token || !file) {
        return res.status(400).json({
          error: 'Token and file are required',
        });
      }

      // Validate token via database
      const stepInfo = await prisma.$queryRaw<Array<{ execution_id: string }>>`
        SELECT execution_id 
        FROM public.workflow_execution_steps 
        WHERE external_token = ${token}
        LIMIT 1
      `;

      if (!stepInfo || stepInfo.length === 0) {
        return res.status(404).json({
          error: 'Invalid or expired token',
        });
      }

      const { execution_id } = stepInfo[0];

      // Sanitize filename
      const sanitizedFileName = sanitizeFileName(file.originalname);
      const filePath = `executions/${execution_id}/${Date.now()}_${sanitizedFileName}`;

      // Upload to MinIO
      await storageService.uploadFile(
        storageService.getDocumentsBucket(),
        filePath,
        file.buffer,
        file.mimetype
      );

      return res.json({
        success: true,
        path: filePath,
        fullPath: `documents/${filePath}`,
        original_name: file.originalname,
      });
    } catch (error) {
      console.error('Error uploading external file:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal Error',
      });
    }
  },

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
        where: { id: fileId },
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
   * POST /api/workflows/executions/:executionId/steps/:stepId/process-file
   * Process a file step (was: process-file-step)
   */
  async processFileStep(req: AuthRequest, res: Response) {
    try {
      const { executionId, stepId } = req.params;
      const { workflow_step_id } = req.body;

      if (!executionId || !stepId || !workflow_step_id) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'execution_id, execution_step_id, and workflow_step_id are required',
        });
      }

      // Fetch step configuration
      const workflowStep = await prisma.workflowStep.findUnique({
        where: { id: workflow_step_id },
        select: { config: true },
      });

      if (!workflowStep) {
        return res.status(404).json({ error: 'Workflow step not found' });
      }

      // Fetch execution data
      const executionData = await prisma.workflowExecutionData.findFirst({
        where: { execution_id: executionId },
      });

      if (!executionData) {
        return res.status(404).json({ error: 'Execution data not found' });
      }

      // Fetch execution for company_id
      const execution = await prisma.workflowExecution.findUnique({
        where: { id: executionId },
        select: { company_id: true },
      });

      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      // Fetch execution step
      const executionStep = await prisma.workflowExecutionStep.findFirst({
        where: { id: stepId },
        select: { assigned_to_user_id: true },
      });

      if (!executionStep) {
        return res.status(404).json({ error: 'Execution step not found' });
      }

      const config = (workflowStep.config as any) || {};
      const sourceFileId = config.source_file_id;
      const metadataConfig = config.api_data
        ? typeof config.api_data === 'string'
          ? JSON.parse(config.api_data)
          : config.api_data
        : [];

      if (!sourceFileId || sourceFileId === 'none') {
        return res.status(400).json({ error: 'Source file not configured' });
      }

      // Resolve source file from execution data
      const allValues = (executionData.values || {}) as Record<string, any>;
      const fileValueWrapper = allValues[sourceFileId];

      if (!fileValueWrapper) {
        return res.status(400).json({
          error: `File data not found for field ${sourceFileId}`,
        });
      }

      let sourceFilePath: string;
      if (typeof fileValueWrapper === 'object' && fileValueWrapper.value !== undefined) {
        sourceFilePath = fileValueWrapper.value;
      } else if (typeof fileValueWrapper === 'string') {
        sourceFilePath = fileValueWrapper;
      } else {
        return res.status(400).json({
          error: `Unexpected file value format for field ${sourceFileId}`,
        });
      }

      // Download file from MinIO
      const fileStream = await storageService.downloadFile(
        storageService.getDocumentsBucket(),
        sourceFilePath
      );

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of fileStream) {
        chunks.push(Buffer.from(chunk));
      }
      const fileBuffer = Buffer.concat(chunks);

      // Extract original filename
      const originalFileName =
        sourceFilePath.split('?')[0].split('/').pop()?.replace(/^\d+_/, '') ||
        'unknown_file';

      // Upload to new location
      const newPath = `companies/${execution.company_id}/${Date.now()}_${originalFileName}`;
      const fileStat = await storageService.getFileStat(
        storageService.getDocumentsBucket(),
        sourceFilePath
      );

      await storageService.uploadFile(
        storageService.getDocumentsBucket(),
        newPath,
        fileBuffer,
        fileStat.contentType
      );

      // Resolve metadata
      const metadataValues: Array<{ keyId: string; value: string }> = [];

      if (metadataConfig.length > 0) {
        const metadataKeys = await prisma.filesMetadataKey.findMany({
          where: { company_id: execution.company_id! },
          select: { id: true, name: true },
        });

        const keyMap = new Map<string, string>();
        for (const key of metadataKeys) {
          if (key.name != null) {
            keyMap.set(key.name, key.id);
          }
        }

        for (const item of metadataConfig) {
          const keyName = item.key;
          const keyId = keyMap.get(keyName);

          if (!keyId) {
            console.warn(`Metadata key not found: ${keyName}`);
            continue;
          }

          let value = item.value;

          if (
            item.mode === 'bind' &&
            value.startsWith('{{') &&
            value.endsWith('}}')
          ) {
            const bindId = value.slice(2, -2);
            const bindValueWrapper = allValues[bindId];
            if (bindValueWrapper !== undefined) {
              value =
                typeof bindValueWrapper === 'object' && bindValueWrapper.value !== undefined
                  ? bindValueWrapper.value
                  : bindValueWrapper;
            } else {
              value = null;
            }
          }

          if (value !== null && value !== undefined) {
            metadataValues.push({ keyId, value: String(value) });
          }
        }
      }

      // Create file record
      const newFile = await prisma.file.create({
        data: {
          name: originalFileName,
          folder_id: null,
          storage_path: newPath,
          size_bytes: BigInt(fileBuffer.length),
          mime_type: fileStat.contentType || null,
          company_id: execution.company_id!,
          uploaded_by: executionStep.assigned_to_user_id,
        },
      });

      // Insert metadata values
      if (metadataValues.length > 0) {
        await prisma.filesMetadataValue.createMany({
          data: metadataValues.map((m) => ({
            files_id: newFile.id,
            metadata_id: m.keyId,
            value: m.value,
            company_id: execution.company_id!,
          })),
        });
      }

      // Mark step as completed
      await prisma.workflowExecutionStep.update({
        where: { id: stepId },
        data: {
          status: 'completed',
          completed_at: new Date(),
          step_data: {
            success: true,
            new_file_id: newFile.id,
            original_file_id: sourceFilePath,
          },
        },
      });

      // Advance workflow
      const executionStepFull = await prisma.workflowExecutionStep.findUnique({
        where: { id: stepId },
        select: { step_id: true, company_id: true },
      });

      if (executionStepFull) {
        await workflowService.advanceWorkflow(
          executionId,
          executionStepFull.step_id,
          executionStepFull.company_id!
        );
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error processing file step:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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

      // Trigger OCR if requested
      const ocrRequested = req.body?.ocr === 'true' || req.body?.ocr === true;
      if (ocrRequested) {
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
        where: { id: fileId, company_id: companyId },
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

      // Delete from storage (ignore if object doesn't exist)
      try {
        await storageService.deleteFile(storageService.getDocumentsBucket(), fileRecord.storage_path);
      } catch {
        // Object may not exist in storage; proceed with DB cleanup
      }
      await prisma.filesMetadataValue.deleteMany({ where: { files_id: fileId } });
      await prisma.file.delete({ where: { id: fileId } });

      return res.status(204).send();
    } catch (error) {
      console.error('deleteCompanyFile error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
