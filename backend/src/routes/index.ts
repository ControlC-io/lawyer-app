import { Router } from 'express';
import authRoutes from './auth';
import filesRoutes from './files';
import usersRoutes from './users';
import companiesRoutes from './companies';
import notificationsRoutes from './notifications';
import publicRoutes from './public';
import ocrRoutes from './ocr';
import adminRoutes from './admin';

const router = Router();

// Public routes (no auth)
router.use('/auth', authRoutes);
router.use('/public', publicRoutes);

// File routes (mixed auth)
router.use('/files', filesRoutes);

// OCR routes (JWT auth)
router.use('/files', ocrRoutes);

// User/company routes (JWT or API key)
router.use('/', usersRoutes);

// Companies (JWT, scoped to user's companies)
router.use('/companies', companiesRoutes);

// Super admin routes
router.use('/admin', adminRoutes);

// Notification routes (JWT)
router.use('/notifications', notificationsRoutes);

export default router;
