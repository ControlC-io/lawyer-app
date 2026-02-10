import { Router } from 'express';
import { register, login, changePassword } from '../controllers/auth';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';

const router = Router();

router.post('/register', register);
router.post('/login', login);

/**
 * POST /api/auth/change-password
 * Change password (JWT required)
 */
router.post('/change-password', authMiddleware, asyncHandler(changePassword));

export default router;
