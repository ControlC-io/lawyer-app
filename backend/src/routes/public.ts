import { Router } from 'express';
import { publicController } from '../controllers/public.controller';
import { asyncHandler } from '../middleware/validation';

const router = Router();

/**
 * GET /api/public/config
 * Public config (signupEnabled, etc.) - no auth required
 */
router.get('/config', asyncHandler(publicController.getConfig));

export default router;
