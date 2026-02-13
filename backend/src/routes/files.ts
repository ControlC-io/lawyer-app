import { Router } from 'express';
import { filesController } from '../controllers/files.controller';
import { apiKeyAuth, authMiddleware, internalAuth, optionalAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';

const router = Router();

/**
 * POST /api/files/documents/upload
 * Upload a file to documents bucket at given path (JWT)
 */
router.post(
  '/documents/upload',
  authMiddleware,
  filesController.uploadMiddleware,
  asyncHandler(filesController.uploadDocument)
);

/**
 * POST /api/workflows/executions/:executionId/files
 * Upload a file for an execution
 * Auth: API Key
 */
router.post(
  '/workflows/executions/:executionId/files',
  apiKeyAuth,
  asyncHandler(filesController.uploadExecutionFile)
);

/**
 * POST /api/files/upload
 * Upload an external file (with token)
 * Auth: None (token validation in controller)
 */
router.post(
  '/upload',
  filesController.uploadMiddleware,
  asyncHandler(filesController.uploadExternalFile)
);

/**
 * POST /api/files/signed-url
 * Get a signed URL for file access
 * Auth: Optional (can be used with or without auth)
 */
router.post(
  '/signed-url',
  optionalAuth,
  asyncHandler(filesController.getSignedUrl)
);

/**
 * POST /api/files/document-url
 * Get a short-lived URL to stream a company document (preview/download).
 * Auth: JWT required.
 */
router.post(
  '/document-url',
  authMiddleware,
  asyncHandler(filesController.getDocumentUrl)
);

/**
 * GET /api/files/document?token=...
 * Stream a document (no auth; token is short-lived JWT).
 */
router.get(
  '/document',
  asyncHandler(filesController.streamDocument)
);

/**
 * POST /api/workflows/executions/:executionId/steps/:stepId/process-file
 * Process a file step
 * Auth: Internal API Key or API Key
 */
router.post(
  '/workflows/executions/:executionId/steps/:stepId/process-file',
  (req, res, next) => {
    const internalKey = req.headers['x-internal-api-key'];
    if (internalKey) {
      return internalAuth(req, res, next);
    }
    return apiKeyAuth(req, res, next);
  },
  asyncHandler(filesController.processFileStep)
);

export default router;
