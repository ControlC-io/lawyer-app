import { Router } from 'express';
import { portalController } from '../controllers/portal.controller';
import { filesController } from '../controllers/files.controller';
import { asyncHandler } from '../middleware/validation';

const router = Router();

// -----------------------------------------------------------------------------
// Path segments (mounted at /api/portal)
// Slug format: {uuid6}_{companySlug} or plain company slug. All routes are public.
// -----------------------------------------------------------------------------

const SLUG = ':slug';
const WORKFLOW_ID = ':workflowId';

const paths = {
  portal: (s: string) => `/${s}`,
  logo: (s: string) => `/${s}/logo`,
  workflows: (s: string) => `/${s}/workflows`,
  workflowDetail: (s: string, w: string) => `/${s}/workflows/${w}`,
  upload: (s: string, w: string) => `/${s}/workflows/${w}/upload`,
  submit: (s: string, w: string) => `/${s}/workflows/${w}/submit`,
} as const;

// -----------------------------------------------------------------------------
// Portal identity & branding
// -----------------------------------------------------------------------------

/**
 * GET /api/portal/:slug/logo
 * Stream company portal logo (public). Returns 404 if no uploaded logo.
 */
router.get(paths.logo(SLUG), asyncHandler(portalController.getPortalLogo));

/**
 * GET /api/portal/:slug
 * Company portal metadata: name, slug, logo_url, description, primary color (public).
 */
router.get(paths.portal(SLUG), asyncHandler(portalController.getPortalInfo));

// -----------------------------------------------------------------------------
// Workflows (portal-enabled, active)
// -----------------------------------------------------------------------------

/**
 * GET /api/portal/:slug/workflows
 * List workflows available on this portal (public).
 */
router.get(
  paths.workflows(SLUG),
  asyncHandler(portalController.listPortalWorkflows)
);

/**
 * GET /api/portal/:slug/workflows/:workflowId
 * Workflow detail and first form step config for portal start (public).
 */
router.get(
  paths.workflowDetail(SLUG, WORKFLOW_ID),
  asyncHandler(portalController.getPortalWorkflowDetail)
);

// -----------------------------------------------------------------------------
// Form actions (upload then submit; files relocated on submit)
// -----------------------------------------------------------------------------

/**
 * POST /api/portal/:slug/workflows/:workflowId/upload
 * Upload a file for a portal form field. Stored under portal_uploads/; relocated to execution on submit (public).
 */
router.post(
  paths.upload(SLUG, WORKFLOW_ID),
  filesController.uploadMiddleware,
  asyncHandler(portalController.uploadPortalFile)
);

/**
 * POST /api/portal/:slug/workflows/:workflowId/submit
 * Submit first form step: creates execution, completes step, advances workflow (public).
 */
router.post(
  paths.submit(SLUG, WORKFLOW_ID),
  asyncHandler(portalController.submitPortalWorkflow)
);

export default router;
