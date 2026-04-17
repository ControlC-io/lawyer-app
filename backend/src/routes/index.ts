import { Router } from 'express';
import authRoutes from './auth';
import workflowRoutes from './workflow';
import filesRoutes from './files';
import usersRoutes from './users';
import companiesRoutes from './companies';
import agentsRoutes from './agents';
import notificationsRoutes from './notifications';
import publicRoutes from './public';
import externalRoutes from './external';
import portalRoutes from './portal';
import ocrRoutes from './ocr';
import adminRoutes from './admin';

const router = Router();

// Public routes (no auth)
router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/external', externalRoutes);
router.use('/portal', portalRoutes);

// Workflow routes (API key or internal auth)
router.use('/workflows', workflowRoutes);

// File routes (mixed auth)
router.use('/files', filesRoutes);

// OCR routes (JWT auth)
router.use('/files', ocrRoutes);

// User/company routes (JWT or API key)
router.use('/', usersRoutes);

// Companies (JWT, scoped to user's companies)
router.use('/companies', companiesRoutes);

// Agent/AI routes (JWT or API key)
router.use('/agents', agentsRoutes);

// Super admin routes
router.use('/admin', adminRoutes);

// Notification routes (JWT)
router.use('/notifications', notificationsRoutes);

export default router;
