import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { superAdminAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';

const router = Router();

router.use(superAdminAuth);

router.get('/companies', asyncHandler(adminController.listCompanies));
router.get('/executions', asyncHandler(adminController.listExecutions));
router.get('/workflows', asyncHandler(adminController.listWorkflows));
router.get('/files', asyncHandler(adminController.listFiles));
router.get('/folders', asyncHandler(adminController.listFolders));
router.get('/data-tables', asyncHandler(adminController.listDataTables));
router.get('/global-variables', asyncHandler(adminController.listGlobalVariables));
router.get('/groups', asyncHandler(adminController.listGroups));
router.get('/users', asyncHandler(adminController.listUsers));
router.get('/api-configurations', asyncHandler(adminController.listApiConfigurations));
router.get('/agent-configurations', asyncHandler(adminController.listAgentConfigurations));
router.get('/agent-usage', asyncHandler(adminController.listAgentUsage));
router.get('/roles', asyncHandler(adminController.listRoles));

export default router;
