import { Router } from 'express';
import { usersController } from '../controllers/users.controller';
import { getMe, updateMe } from '../controllers/auth';
import { authMiddleware, apiKeyAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/validation';

const router = Router();

/**
 * GET /api/me
 * Get current user profile, companies, and super_admin (JWT required)
 */
router.get('/me', authMiddleware, asyncHandler(getMe));

/**
 * PATCH /api/me
 * Update current user profile (full_name, notifications_enabled)
 */
router.patch('/me', authMiddleware, asyncHandler(updateMe));

/**
 * POST /api/companies/:companyId/invitations
 * Invite a user to a company
 * Auth: JWT (user must be admin)
 */
router.post(
  '/companies/:companyId/invitations',
  authMiddleware,
  asyncHandler(usersController.inviteUser)
);

/**
 * GET /api/invitations/check-email
 * Check if email exists (for sign up vs sign in on accept page)
 * Must be before /invitations/:token to avoid "check-email" as token
 */
router.get(
  '/invitations/check-email',
  asyncHandler(usersController.checkEmailExists)
);

/**
 * GET /api/invitations/:token
 * Get invitation by token (no auth - for accept-invitation page)
 */
router.get(
  '/invitations/:token',
  asyncHandler(usersController.getInvitationByToken)
);

/**
 * POST /api/invitations/:token/accept
 * Accept an invitation
 * Auth: JWT
 */
router.post(
  '/invitations/:token/accept',
  authMiddleware,
  asyncHandler(usersController.acceptInvitation)
);

/**
 * DELETE /api/invitations/:id
 * Cancel an invitation (JWT, company admin)
 */
router.delete(
  '/invitations/:id',
  authMiddleware,
  asyncHandler(usersController.deleteInvitation)
);

/**
 * GET /api/users/:userId
 * Get user information
 * Auth: API Key
 */
router.get(
  '/users/:userId',
  apiKeyAuth,
  asyncHandler(usersController.getUser)
);

export default router;
