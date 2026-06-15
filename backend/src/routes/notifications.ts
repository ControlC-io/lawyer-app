import { Router } from 'express';
import { notificationsController } from '../controllers/notifications.controller';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';

const router = Router();

/**
 * GET /api/notifications
 * List notifications for current user
 * Auth: JWT
 */
router.get(
  '/',
  authMiddleware,
  asyncHandler(notificationsController.list)
);

/**
 * PATCH /api/notifications/:id/read
 * Mark one notification as read
 * Auth: JWT
 */
router.patch(
  '/:id/read',
  authMiddleware,
  asyncHandler(notificationsController.markAsRead)
);

/**
 * DELETE /api/notifications/:id
 * Delete one notification for current user
 * Auth: JWT
 */
router.delete(
  '/:id',
  authMiddleware,
  asyncHandler(notificationsController.remove)
);

/**
 * POST /api/notifications/mark-all-read
 * Mark all as read for current user
 * Auth: JWT
 */
router.post(
  '/mark-all-read',
  authMiddleware,
  asyncHandler(notificationsController.markAllAsRead)
);


export default router;
