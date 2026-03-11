import { Router } from 'express';
import { workflowController } from '../controllers/workflow.controller';
import { apiKeyAuth, authMiddleware, internalAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';

const router = Router();

/**
 * POST /api/workflows/:workflowId/trigger
 * Trigger a workflow execution
 * Auth: API Key (company)
 */
router.post(
  '/:workflowId/trigger',
  apiKeyAuth,
  asyncHandler(workflowController.triggerWorkflow)
);

/**
 * POST /api/workflows/executions/:executionId/steps/:stepId/process
 * Process an automatic step (called by triggers or manually)
 * Auth: JWT, Internal API Key, or API Key
 */
router.post(
  '/executions/:executionId/steps/:stepId/process',
  (req, res, next) => {
    const internalKey = req.headers['x-internal-api-key'];
    if (internalKey) return internalAuth(req, res, next);
    return authMiddleware(req, res, next);
  },
  asyncHandler(workflowController.processAutomaticStep)
);

/**
 * POST /api/workflows/executions/:executionId/steps/:stepId/complete
 * Complete a step and advance the workflow
 * Auth: API Key
 */
router.post(
  '/executions/:executionId/steps/:stepId/complete',
  apiKeyAuth,
  asyncHandler(workflowController.completeStep)
);

/**
 * POST /api/workflows/executions/:executionId/steps/:stepId/decision
 * Make a decision on a decision node
 * Auth: API Key
 */
router.post(
  '/executions/:executionId/steps/:stepId/decision',
  apiKeyAuth,
  asyncHandler(workflowController.makeDecision)
);

/**
 * GET /api/workflows/executions/:executionId
 * Get execution data with all related information
 * Auth: JWT or API Key
 */
router.get(
  '/executions/:executionId',
  authMiddleware,
  asyncHandler(workflowController.getExecutionData)
);

/**
 * PUT /api/workflows/executions/:executionId/data
 * Update execution data
 * Auth: API Key
 */
router.put(
  '/executions/:executionId/data',
  apiKeyAuth,
  asyncHandler(workflowController.updateExecutionData)
);

/**
 * PATCH /api/workflows/executions/:executionId/data/array-item
 * Update a single sub-field in an existing array item
 * Auth: API Key
 */
router.patch(
  '/executions/:executionId/data/array-item',
  apiKeyAuth,
  asyncHandler(workflowController.patchArrayItem)
);

/**
 * PATCH /api/workflows/executions/:executionId/name
 * Rename an execution
 * Auth: API Key
 */
router.patch(
  '/executions/:executionId/name',
  apiKeyAuth,
  asyncHandler(workflowController.renameExecution)
);

/**
 * POST /api/workflows/executions/:executionId/logs
 * Add a log entry to an execution
 * Auth: API Key
 */
router.post(
  '/executions/:executionId/logs',
  apiKeyAuth,
  asyncHandler(workflowController.addExecutionLog)
);

/**
 * PATCH /api/workflows/executions/:executionId/steps/:stepId
 * Update execution step (e.g. reassign)
 * Auth: API Key
 */
router.patch(
  '/executions/:executionId/steps/:stepId',
  apiKeyAuth,
  asyncHandler(workflowController.updateExecutionStep)
);

export default router;
