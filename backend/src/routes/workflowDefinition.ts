import { Router } from 'express';
import { workflowDefinitionController } from '../controllers/workflowDefinition.controller';
import { asyncHandler } from '../middleware/validation';

const router = Router();

/** GET /api/companies/:companyId/workflows - list workflows */
router.get('/', asyncHandler(workflowDefinitionController.listWorkflows));
/** POST /api/companies/:companyId/workflows - create workflow */
router.post('/', asyncHandler(workflowDefinitionController.createWorkflow));

/** Nested routes (must be before /:workflowId so they match first) */
router.put('/:workflowId/steps', asyncHandler(workflowDefinitionController.putSteps));
router.put('/:workflowId/connections', asyncHandler(workflowDefinitionController.putConnections));
router.get('/:workflowId/statuses', asyncHandler(workflowDefinitionController.listStatuses));
router.post('/:workflowId/statuses', asyncHandler(workflowDefinitionController.createStatus));
router.patch('/:workflowId/statuses/:statusId', asyncHandler(workflowDefinitionController.updateStatus));
router.delete('/:workflowId/statuses/:statusId', asyncHandler(workflowDefinitionController.deleteStatus));
router.get('/:workflowId/permissions', asyncHandler(workflowDefinitionController.listPermissions));
router.post('/:workflowId/permissions', asyncHandler(workflowDefinitionController.addPermission));
router.delete('/:workflowId/permissions/:permissionId', asyncHandler(workflowDefinitionController.deletePermission));

/** GET /api/companies/:companyId/workflows/:workflowId - get one workflow */
router.get('/:workflowId', asyncHandler(workflowDefinitionController.getWorkflow));
/** PATCH /api/companies/:companyId/workflows/:workflowId */
router.patch('/:workflowId', asyncHandler(workflowDefinitionController.updateWorkflow));
/** DELETE /api/companies/:companyId/workflows/:workflowId */
router.delete('/:workflowId', asyncHandler(workflowDefinitionController.deleteWorkflow));

export default router;
