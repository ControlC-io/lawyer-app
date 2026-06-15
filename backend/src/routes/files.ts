import { Router } from 'express';
import { filesController } from '../controllers/files.controller';
import { authMiddleware, optionalAuth } from '../middleware/auth';
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

export default router;
