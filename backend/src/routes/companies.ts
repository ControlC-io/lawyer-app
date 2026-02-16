import { Router } from 'express';
import { companiesController } from '../controllers/companies.controller';
import { workflowDefinitionController } from '../controllers/workflowDefinition.controller';
import { usersController } from '../controllers/users.controller';
import { filesController } from '../controllers/files.controller';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';
import workflowDefinitionRoutes from './workflowDefinition';

const router = Router();

router.use(authMiddleware);

/** GET /api/companies - list companies (user's or all if super_admin / x-super-admin-api-key) */
router.get('/', asyncHandler(companiesController.listCompanies));

/**
 * More specific routes first (so :companyId does not consume segment)
 */
router.get(
  '/:companyId/executions',
  asyncHandler(companiesController.listExecutions)
);
router.get(
  '/:companyId/execution-steps',
  asyncHandler(companiesController.listExecutionSteps)
);
router.delete(
  '/:companyId/executions/:executionId',
  asyncHandler(companiesController.deleteExecution)
);
router.get(
  '/:companyId/users',
  asyncHandler(usersController.getCompanyUsers)
);
router.delete(
  '/:companyId/users/:userId',
  asyncHandler(companiesController.removeUserFromCompany)
);
router.get(
  '/:companyId/invitations',
  asyncHandler(usersController.getCompanyInvitations)
);
router.get(
  '/:companyId/workflow-categories',
  asyncHandler(workflowDefinitionController.listCategories)
);
router.post(
  '/:companyId/workflow-categories',
  asyncHandler(workflowDefinitionController.createCategory)
);
router.patch(
  '/:companyId/workflow-categories/:categoryId',
  asyncHandler(workflowDefinitionController.updateCategory)
);
router.delete(
  '/:companyId/workflow-categories/:categoryId',
  asyncHandler(workflowDefinitionController.deleteCategory)
);

router.get('/:companyId/my-group-ids', asyncHandler(companiesController.getMyGroupIds));
router.get('/:companyId/groups', asyncHandler(companiesController.listGroups));
router.post('/:companyId/groups', asyncHandler(companiesController.createGroup));
router.patch('/:companyId/groups/:groupId', asyncHandler(companiesController.updateGroup));
router.delete('/:companyId/groups/:groupId', asyncHandler(companiesController.deleteGroup));
router.get('/:companyId/group-members', asyncHandler(companiesController.listAllGroupMembers));
router.get('/:companyId/groups/:groupId/members', asyncHandler(companiesController.listGroupMembers));
router.post('/:companyId/groups/:groupId/members', asyncHandler(companiesController.addGroupMember));
router.delete('/:companyId/groups/:groupId/members/by-profile/:profileId', asyncHandler(companiesController.removeGroupMemberByProfile));
router.delete('/:companyId/groups/:groupId/members/:memberId', asyncHandler(companiesController.removeGroupMember));

router.get('/:companyId/api-configurations', asyncHandler(companiesController.listApiConfigurations));
router.post('/:companyId/api-configurations', asyncHandler(companiesController.createApiConfiguration));
router.patch('/:companyId/api-configurations/:configId', asyncHandler(companiesController.updateApiConfiguration));
router.delete('/:companyId/api-configurations/:configId', asyncHandler(companiesController.deleteApiConfiguration));

router.get('/:companyId/global-variables', asyncHandler(companiesController.listGlobalVariables));
router.post('/:companyId/global-variables', asyncHandler(companiesController.createGlobalVariable));
router.patch('/:companyId/global-variables/:variableId', asyncHandler(companiesController.updateGlobalVariable));
router.delete('/:companyId/global-variables/:variableId', asyncHandler(companiesController.deleteGlobalVariable));

router.get('/:companyId/folders', asyncHandler(companiesController.listFolders));
router.get('/:companyId/folders/:folderId', asyncHandler(companiesController.getFolder));
router.post('/:companyId/folders', asyncHandler(companiesController.createFolder));
router.patch('/:companyId/folders/:folderId', asyncHandler(companiesController.updateFolder));
router.delete('/:companyId/folders/:folderId', asyncHandler(companiesController.deleteFolder));
router.get('/:companyId/folders/:folderId/permissions', asyncHandler(companiesController.listFolderPermissions));
router.post('/:companyId/folders/:folderId/permissions', asyncHandler(companiesController.addFolderPermission));
router.delete('/:companyId/folders/:folderId/permissions/:permissionId', asyncHandler(companiesController.deleteFolderPermission));
router.get('/:companyId/files', asyncHandler(companiesController.listFiles));
router.post('/:companyId/files', asyncHandler(companiesController.createFile));
router.get('/:companyId/files/by-metadata', asyncHandler(companiesController.getFileIdsByMetadata));
router.post('/:companyId/folders/:folderId/upload', filesController.uploadMiddleware, asyncHandler(filesController.uploadCompanyDocument));
router.put('/:companyId/files/:fileId/metadata', asyncHandler(companiesController.updateFileMetadata));
router.delete('/:companyId/files/:fileId', asyncHandler(filesController.deleteCompanyFile));

router.get('/:companyId/agent-permissions', asyncHandler(companiesController.listAgentPermissions));
router.post('/:companyId/agent-permissions', asyncHandler(companiesController.addAgentPermission));
router.patch('/:companyId/agent-permissions/:permissionId', asyncHandler(companiesController.updateAgentPermission));
router.delete('/:companyId/agent-permissions/:permissionId', asyncHandler(companiesController.deleteAgentPermission));

router.get('/:companyId/data-tables', asyncHandler(companiesController.listDataTables));
router.post('/:companyId/data-tables', asyncHandler(companiesController.createDataTable));
router.patch('/:companyId/data-tables/:tableId', asyncHandler(companiesController.updateDataTable));
router.delete('/:companyId/data-tables/:tableId', asyncHandler(companiesController.deleteDataTable));
router.post('/:companyId/data-tables/:tableId/copy', asyncHandler(companiesController.copyDataTable));
router.get('/:companyId/data-tables/:tableId/fields', asyncHandler(companiesController.listDataTableFields));
router.post('/:companyId/data-tables/:tableId/fields', asyncHandler(companiesController.createDataTableField));
router.patch('/:companyId/data-tables/:tableId/fields/:fieldId', asyncHandler(companiesController.updateDataTableField));
router.delete('/:companyId/data-tables/:tableId/fields/:fieldId', asyncHandler(companiesController.deleteDataTableField));
router.get('/:companyId/data-tables/:tableId/records', asyncHandler(companiesController.listDataTableRecords));
router.post('/:companyId/data-tables/:tableId/records', asyncHandler(companiesController.createDataTableRecord));
router.patch('/:companyId/data-tables/:tableId/records/:recordId', asyncHandler(companiesController.updateDataTableRecord));
router.delete('/:companyId/data-tables/:tableId/records/:recordId', asyncHandler(companiesController.deleteDataTableRecord));

router.use('/:companyId/workflows', workflowDefinitionRoutes);

router.get(
  '/:companyId/files-metadata-keys',
  asyncHandler(companiesController.listFilesMetadataKeys)
);
router.post(
  '/:companyId/files-metadata-keys',
  asyncHandler(companiesController.createFilesMetadataKey)
);
router.patch(
  '/:companyId/files-metadata-keys/:keyId',
  asyncHandler(companiesController.updateFilesMetadataKey)
);
router.delete(
  '/:companyId/files-metadata-keys/:keyId',
  asyncHandler(companiesController.deleteFilesMetadataKey)
);

/**
 * GET /api/companies/:companyId
 */
router.get(
  '/:companyId',
  asyncHandler(companiesController.getCompany)
);

/**
 * PATCH /api/companies/:companyId
 */
router.patch(
  '/:companyId',
  asyncHandler(companiesController.updateCompany)
);

export default router;
