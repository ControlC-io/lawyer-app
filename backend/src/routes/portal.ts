import { Router } from 'express';
import { portalController } from '../controllers/portal.controller';
import { asyncHandler } from '../middleware/validation';

const router = Router();

/**
 * GET /api/portal/:slug
 * Get company portal info (public, no auth)
 */
router.get('/:slug', asyncHandler(portalController.getPortalInfo));

/**
 * GET /api/portal/:slug/workflows
 * List portal-enabled workflows (public, no auth)
 */
router.get('/:slug/workflows', asyncHandler(portalController.listPortalWorkflows));

/**
 * GET /api/portal/:slug/workflows/:workflowId
 * Get workflow detail + first form step config (public, no auth)
 */
router.get('/:slug/workflows/:workflowId', asyncHandler(portalController.getPortalWorkflowDetail));

/**
 * POST /api/portal/:slug/workflows/:workflowId/submit
 * Submit first form step (public, no auth)
 */
router.post('/:slug/workflows/:workflowId/submit', asyncHandler(portalController.submitPortalWorkflow));

export default router;
