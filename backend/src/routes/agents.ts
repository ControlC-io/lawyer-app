import { Router } from 'express';
import { agentsController } from '../controllers/agents.controller';
import { authMiddleware, apiKeyAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';

const router = Router();

/**
 * Categories and configurations (JWT) - must be before /:agentId
 */
router.get('/categories', authMiddleware, asyncHandler(agentsController.listCategories));
router.post('/categories', authMiddleware, asyncHandler(agentsController.createCategory));
router.patch('/categories/:categoryId', authMiddleware, asyncHandler(agentsController.updateCategory));
router.delete('/categories/:categoryId', authMiddleware, asyncHandler(agentsController.deleteCategory));

router.get('/configurations', authMiddleware, asyncHandler(agentsController.listConfigurations));
router.get('/configurations/:configId', authMiddleware, asyncHandler(agentsController.getConfigurationById));
router.post('/configurations', authMiddleware, asyncHandler(agentsController.createConfiguration));
router.patch('/configurations/:configId', authMiddleware, asyncHandler(agentsController.updateConfiguration));
router.delete('/configurations/:configId', authMiddleware, asyncHandler(agentsController.deleteConfiguration));

router.get('/usage', authMiddleware, asyncHandler(agentsController.listAgentUsage));
router.post('/usage', authMiddleware, asyncHandler(agentsController.createAgentUsage));

/**
 * GET /api/agents/:agentId
 * Get agent configuration
 * Auth: API Key
 */
router.get(
  '/:agentId',
  apiKeyAuth,
  asyncHandler(agentsController.getAgent)
);

/**
 * POST /api/workflows/create-with-ai
 * Create workflow using AI
 * Auth: JWT
 */
router.post(
  '/workflows/create-with-ai',
  authMiddleware,
  asyncHandler(agentsController.createWorkflowWithAI)
);

/**
 * POST /api/forms/validate-with-ai
 * Validate form data using AI
 * Auth: JWT
 */
router.post(
  '/forms/validate-with-ai',
  authMiddleware,
  asyncHandler(agentsController.validateWithAI)
);

/**
 * POST /api/audio/transcribe
 * Transcribe audio
 * Auth: JWT
 */
router.post(
  '/audio/transcribe',
  authMiddleware,
  asyncHandler(agentsController.transcribeAudio)
);

export default router;
