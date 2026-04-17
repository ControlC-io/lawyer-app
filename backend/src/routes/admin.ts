import { Router } from 'express';
import { adminArchiveController } from '../controllers/adminArchive.controller';
import { authMiddleware, requireSuperAdmin } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';

const router = Router();

router.get(
  '/archived',
  authMiddleware,
  requireSuperAdmin,
  asyncHandler(adminArchiveController.listArchived),
);

router.post(
  '/archived/:entity/:id/unarchive',
  authMiddleware,
  requireSuperAdmin,
  asyncHandler(adminArchiveController.unarchiveRecord),
);

export default router;
