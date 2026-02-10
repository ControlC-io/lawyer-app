import { Router } from 'express';
import { externalController } from '../controllers/external.controller';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';

const router = Router();

/**
 * GET /api/external/steps/:token
 * Get step config and workflow data_structure by token (no auth - for form load)
 */
router.get(
  '/steps/:token',
  asyncHandler(externalController.getStepByToken)
);

/**
 * POST /api/external/steps/:token/submit
 * Submit external step (no auth - token validated in controller)
 */
router.post(
  '/steps/:token/submit',
  asyncHandler(externalController.submitExternalStep)
);

/**
 * POST /api/external/steps/:stepId/send-link
 * Send external form link via email
 * Auth: JWT
 */
router.post(
  '/steps/:stepId/send-link',
  authMiddleware,
  asyncHandler(externalController.sendExternalFormLink)
);

export default router;
