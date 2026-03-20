import { Router } from 'express';
import { workflowDefinitionController } from '../controllers/workflowDefinition.controller';
import { asyncHandler } from '../middleware/validation';
import { requirePermission } from '../lib/rbac';

// mergeParams: true so that when mounted at /:companyId/workflows, req.params.companyId is available
const router = Router({ mergeParams: true });

/** GET /api/companies/:companyId/workflows - list workflows */
router.get('/', asyncHandler(workflowDefinitionController.listWorkflows));
/** POST /api/companies/:companyId/workflows - create workflow */
router.post('/', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.createWorkflow));

/** Nested routes (must be before /:workflowId so they match first) */
router.put('/:workflowId/steps', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.putSteps));
router.put('/:workflowId/connections', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.putConnections));
router.get('/:workflowId/steps/:stepId/execution-usage', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.getStepExecutionUsage));
router.delete('/:workflowId/steps/:stepId', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.deleteStep));
router.get('/:workflowId/statuses', asyncHandler(workflowDefinitionController.listStatuses));
router.post('/:workflowId/statuses', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.createStatus));
router.patch('/:workflowId/statuses/:statusId', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.updateStatus));
router.delete('/:workflowId/statuses/:statusId', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.deleteStatus));
router.get('/:workflowId/permissions', asyncHandler(workflowDefinitionController.listPermissions));
router.post('/:workflowId/permissions', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.addPermission));
router.delete('/:workflowId/permissions/:permissionId', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.deletePermission));

/** GET /api/companies/:companyId/workflows/:workflowId - get one workflow */
router.get('/:workflowId', asyncHandler(workflowDefinitionController.getWorkflow));
/** POST /api/companies/:companyId/workflows/:workflowId/start - start execution from UI (JWT; only is_active checked) */
router.post('/:workflowId/start', asyncHandler(workflowDefinitionController.startWorkflow));
/** PATCH /api/companies/:companyId/workflows/:workflowId */
router.patch('/:workflowId', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.updateWorkflow));
/** DELETE /api/companies/:companyId/workflows/:workflowId */
router.delete('/:workflowId', requirePermission('workflows.manage'), asyncHandler(workflowDefinitionController.deleteWorkflow));

export default router;
