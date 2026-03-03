import { Router } from 'express';
import { companiesController } from '../controllers/companies.controller';
import { workflowDefinitionController } from '../controllers/workflowDefinition.controller';
import { usersController } from '../controllers/users.controller';
import { filesController } from '../controllers/files.controller';
import { rolesController } from '../controllers/roles.controller';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';
import { requirePermission } from '../lib/rbac';
import workflowDefinitionRoutes from './workflowDefinition';

const router = Router();

router.use(authMiddleware);

/** GET /api/companies - list companies (user's or all if super_admin / x-super-admin-api-key) */
router.get('/', asyncHandler(companiesController.listCompanies));

/**
 * More specific routes first (so :companyId does not consume segment)
 */
// Roles & RBAC
router.get('/:companyId/roles', asyncHandler(rolesController.listRoles));
router.get('/:companyId/roles/:roleId', asyncHandler(rolesController.getRole));
router.post('/:companyId/roles', requirePermission('users_groups.manage'), asyncHandler(rolesController.createRole));
router.patch('/:companyId/roles/:roleId', requirePermission('users_groups.manage'), asyncHandler(rolesController.updateRole));
router.delete('/:companyId/roles/:roleId', requirePermission('users_groups.manage'), asyncHandler(rolesController.deleteRole));
router.get('/:companyId/my-permissions', asyncHandler(rolesController.getMyPermissions));
router.get('/:companyId/permission-catalogue', asyncHandler(rolesController.getPermissionCatalogue));
router.patch('/:companyId/users/:userId/role', requirePermission('users_groups.manage'), asyncHandler(rolesController.assignUserRole));

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
  requirePermission('users_groups.manage'),
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
  requirePermission('workflows.manage'),
  asyncHandler(workflowDefinitionController.createCategory)
);
router.patch(
  '/:companyId/workflow-categories/:categoryId',
  requirePermission('workflows.manage'),
  asyncHandler(workflowDefinitionController.updateCategory)
);
router.delete(
  '/:companyId/workflow-categories/:categoryId',
  requirePermission('workflows.manage'),
  asyncHandler(workflowDefinitionController.deleteCategory)
);

router.get('/:companyId/my-group-ids', asyncHandler(companiesController.getMyGroupIds));
router.get('/:companyId/groups', asyncHandler(companiesController.listGroups));
router.post('/:companyId/groups', requirePermission('users_groups.manage'), asyncHandler(companiesController.createGroup));
router.patch('/:companyId/groups/:groupId', requirePermission('users_groups.manage'), asyncHandler(companiesController.updateGroup));
router.delete('/:companyId/groups/:groupId', requirePermission('users_groups.manage'), asyncHandler(companiesController.deleteGroup));
router.get('/:companyId/group-members', asyncHandler(companiesController.listAllGroupMembers));
router.get('/:companyId/groups/:groupId/members', asyncHandler(companiesController.listGroupMembers));
router.post('/:companyId/groups/:groupId/members', requirePermission('users_groups.manage'), asyncHandler(companiesController.addGroupMember));
router.delete('/:companyId/groups/:groupId/members/by-profile/:profileId', requirePermission('users_groups.manage'), asyncHandler(companiesController.removeGroupMemberByProfile));
router.delete('/:companyId/groups/:groupId/members/:memberId', requirePermission('users_groups.manage'), asyncHandler(companiesController.removeGroupMember));

router.get('/:companyId/api-configurations', requirePermission('api_config.manage'), asyncHandler(companiesController.listApiConfigurations));
router.post('/:companyId/api-configurations', requirePermission('api_config.manage'), asyncHandler(companiesController.createApiConfiguration));
router.patch('/:companyId/api-configurations/:configId', requirePermission('api_config.manage'), asyncHandler(companiesController.updateApiConfiguration));
router.delete('/:companyId/api-configurations/:configId', requirePermission('api_config.manage'), asyncHandler(companiesController.deleteApiConfiguration));

router.get('/:companyId/global-variables', requirePermission('variables.view'), asyncHandler(companiesController.listGlobalVariables));
router.post('/:companyId/global-variables', requirePermission('variables.manage'), asyncHandler(companiesController.createGlobalVariable));
router.patch('/:companyId/global-variables/:variableId', requirePermission('variables.manage'), asyncHandler(companiesController.updateGlobalVariable));
router.delete('/:companyId/global-variables/:variableId', requirePermission('variables.manage'), asyncHandler(companiesController.deleteGlobalVariable));

router.get('/:companyId/folders', requirePermission('documents.view'), asyncHandler(companiesController.listFolders));
router.get('/:companyId/folders/:folderId', requirePermission('documents.view'), asyncHandler(companiesController.getFolder));
router.post('/:companyId/folders', requirePermission('documents.manage_structure'), asyncHandler(companiesController.createFolder));
router.patch('/:companyId/folders/:folderId', requirePermission('documents.manage_structure'), asyncHandler(companiesController.updateFolder));
router.delete('/:companyId/folders/:folderId', requirePermission('documents.manage_structure'), asyncHandler(companiesController.deleteFolder));
router.get('/:companyId/folders/:folderId/permissions', requirePermission('documents.manage_files'), asyncHandler(companiesController.listFolderPermissions));
router.post('/:companyId/folders/:folderId/permissions', requirePermission('documents.manage_files'), asyncHandler(companiesController.addFolderPermission));
router.delete('/:companyId/folders/:folderId/permissions/:permissionId', requirePermission('documents.manage_files'), asyncHandler(companiesController.deleteFolderPermission));
router.get('/:companyId/files', requirePermission('documents.view'), asyncHandler(companiesController.listFiles));
router.post('/:companyId/files', requirePermission('documents.manage_files'), asyncHandler(companiesController.createFile));
router.get('/:companyId/files/by-metadata', requirePermission('documents.view'), asyncHandler(companiesController.getFileIdsByMetadata));
router.post('/:companyId/folders/:folderId/upload', filesController.uploadMiddleware, asyncHandler(filesController.uploadCompanyDocument));
router.put('/:companyId/files/:fileId/metadata', requirePermission('documents.manage_files'), asyncHandler(companiesController.updateFileMetadata));
router.delete('/:companyId/files/:fileId', requirePermission('documents.manage_files'), asyncHandler(filesController.deleteCompanyFile));

router.get('/:companyId/agent-permissions', asyncHandler(companiesController.listAgentPermissions));
router.post('/:companyId/agent-permissions', requirePermission('workflows.manage'), asyncHandler(companiesController.addAgentPermission));
router.patch('/:companyId/agent-permissions/:permissionId', requirePermission('workflows.manage'), asyncHandler(companiesController.updateAgentPermission));
router.delete('/:companyId/agent-permissions/:permissionId', requirePermission('workflows.manage'), asyncHandler(companiesController.deleteAgentPermission));
router.get('/:companyId/agent-usage', requirePermission('usage.view'), asyncHandler(companiesController.listCompanyAgentUsage));

router.get('/:companyId/data-tables', requirePermission('data.view'), asyncHandler(companiesController.listDataTables));
router.post('/:companyId/data-tables', requirePermission('data.manage_structure'), asyncHandler(companiesController.createDataTable));
router.patch('/:companyId/data-tables/:tableId', requirePermission('data.manage_structure'), asyncHandler(companiesController.updateDataTable));
router.delete('/:companyId/data-tables/:tableId', requirePermission('data.manage_structure'), asyncHandler(companiesController.deleteDataTable));
router.post('/:companyId/data-tables/:tableId/copy', requirePermission('data.manage_structure'), asyncHandler(companiesController.copyDataTable));
router.get('/:companyId/data-tables/:tableId/fields', requirePermission('data.view'), asyncHandler(companiesController.listDataTableFields));
router.post('/:companyId/data-tables/:tableId/fields', requirePermission('data.manage_structure'), asyncHandler(companiesController.createDataTableField));
router.patch('/:companyId/data-tables/:tableId/fields/:fieldId', requirePermission('data.manage_structure'), asyncHandler(companiesController.updateDataTableField));
router.delete('/:companyId/data-tables/:tableId/fields/:fieldId', requirePermission('data.manage_structure'), asyncHandler(companiesController.deleteDataTableField));
router.get('/:companyId/data-tables/:tableId/records', requirePermission('data.view'), asyncHandler(companiesController.listDataTableRecords));
router.post('/:companyId/data-tables/:tableId/records', requirePermission('data.manage_data'), asyncHandler(companiesController.createDataTableRecord));
router.patch('/:companyId/data-tables/:tableId/records/:recordId', requirePermission('data.manage_data'), asyncHandler(companiesController.updateDataTableRecord));
router.delete('/:companyId/data-tables/:tableId/records/:recordId', requirePermission('data.manage_data'), asyncHandler(companiesController.deleteDataTableRecord));

router.use('/:companyId/workflows', workflowDefinitionRoutes);

router.get(
  '/:companyId/files-metadata-keys',
  requirePermission('documents.view'),
  asyncHandler(companiesController.listFilesMetadataKeys)
);
router.post(
  '/:companyId/files-metadata-keys',
  requirePermission('documents.manage_structure'),
  asyncHandler(companiesController.createFilesMetadataKey)
);
router.patch(
  '/:companyId/files-metadata-keys/:keyId',
  requirePermission('documents.manage_structure'),
  asyncHandler(companiesController.updateFilesMetadataKey)
);
router.delete(
  '/:companyId/files-metadata-keys/:keyId',
  requirePermission('documents.manage_structure'),
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
 * POST /api/companies/:companyId/portal-logo
 */
router.post(
  '/:companyId/portal-logo',
  filesController.uploadMiddleware,
  requirePermission('org_settings.manage'),
  asyncHandler(companiesController.uploadPortalLogo)
);

/**
 * DELETE /api/companies/:companyId/portal-logo
 */
router.delete(
  '/:companyId/portal-logo',
  requirePermission('org_settings.manage'),
  asyncHandler(companiesController.deletePortalLogo)
);

/**
 * PATCH /api/companies/:companyId
 */
router.patch(
  '/:companyId',
  requirePermission('org_settings.manage'),
  asyncHandler(companiesController.updateCompany)
);

export default router;
