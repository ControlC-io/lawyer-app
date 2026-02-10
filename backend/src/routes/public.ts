import { Router } from 'express';
import { publicController } from '../controllers/public.controller';
import { asyncHandler } from '../middleware/validation';

const router = Router();

/**
 * POST /api/public/feedback
 * Send feedback (no auth required)
 */
router.post(
  '/feedback',
  asyncHandler(publicController.sendFeedback)
);

/**
 * POST /api/public/demo-request
 * Request a demo (no auth required)
 */
router.post(
  '/demo-request',
  asyncHandler(publicController.requestDemo)
);

export default router;
