import { Response } from 'express';
import { AuthRequest, resolveCompanyForRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email.service';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export const usersController = {
  /**
   * POST /api/companies/:companyId/invitations
   * Invite a user to a company (was: invite-user)
   */
  async inviteUser(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const { email, role } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          details: 'User authentication required',
        });
      }

      if (!email || !companyId) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'email and companyId are required',
        });
      }

      // Verify user has admin role in the company
      const userCompany = await prisma.userCompany.findFirst({
        where: {
          user_id: userId,
          company_id: companyId,
          role: { in: ['company_admin'] },
        },
      });

      if (!userCompany) {
        return res.status(403).json({
          error: 'Only company admins can invite users',
        });
      }

      // Get company name
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });

      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Generate invitation token
      const invitationToken = crypto.randomUUID();

      // Create invitation
      try {
        await prisma.invitation.create({
          data: {
            company_id: companyId,
            email: email.toLowerCase(),
            role: (role || 'user') as any,
            token: invitationToken,
            invited_by: userId,
          },
        });
      } catch (error: any) {
        if (error.code === 'P2002') {
          return res.status(400).json({
            error: 'An invitation for this email already exists for this company',
          });
        }
        throw error;
      }

      // Send invitation email
      try {
        await emailService.sendInvitation(email, company.name, invitationToken);
      } catch (error) {
        console.error('Error sending invitation email:', error);
        // Don't fail if email sending fails
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error inviting user:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/invitations/:token
   * Get invitation by token (no auth - for accept-invitation page)
   */
  async getInvitationByToken(req: AuthRequest, res: Response) {
    try {
      const { token } = req.params;
      if (!token) {
        return res.status(400).json({
          error: 'Missing token',
          details: 'Token is required',
        });
      }

      const invitation = await prisma.invitation.findFirst({
        where: { token, status: 'pending' },
        include: {
          company: { select: { id: true, name: true } },
        },
      });

      if (!invitation) {
        return res.status(404).json({
          error: 'Invitation not found or already accepted',
          details: 'Invalid or expired token',
        });
      }

      return res.json({
        email: invitation.email,
        company_id: invitation.company_id,
        company_name: invitation.company?.name,
        role: invitation.role,
      });
    } catch (error) {
      console.error('Error getting invitation:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/invitations/check-email
   * Check if email exists (for sign up vs sign in on accept page)
   */
  async checkEmailExists(req: AuthRequest, res: Response) {
    try {
      const email = req.query.email as string;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          error: 'Missing email',
          details: 'Query parameter email is required',
        });
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
        select: { id: true },
      });

      return res.json({ exists: !!user });
    } catch (error) {
      console.error('Error checking email:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/invitations/:token/accept
   * Accept an invitation (was: accept-invitation)
   */
  async acceptInvitation(req: AuthRequest, res: Response) {
    try {
      const { token } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          details: 'User authentication required',
        });
      }

      if (!token) {
        return res.status(400).json({
          error: 'Missing token',
        });
      }

      // Fetch invitation
      const invitation = await prisma.invitation.findFirst({
        where: {
          token,
          status: 'pending',
        },
      });

      if (!invitation) {
        return res.status(404).json({
          error: 'Invitation not found or already accepted',
        });
      }

      // Add user to company
      try {
        await prisma.userCompany.create({
          data: {
            user_id: userId,
            company_id: invitation.company_id,
            role: invitation.role,
          },
        });
      } catch (error: any) {
        // If already exists, that's fine
        if (error.code !== 'P2002') {
          throw error;
        }
      }

      // Mark invitation as accepted
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted' },
      });

      return res.json({
        success: true,
        companyId: invitation.company_id,
      });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/users/:userId
   * Get user information (was: get-user)
   */
  async getUser(req: AuthRequest, res: Response) {
    try {
      if (!(await resolveCompanyForRequest(req, res))) return;
      const { userId } = req.params;
      const companyId = req.company!.id;

      if (!userId) {
        return res.status(400).json({
          error: 'Missing user ID',
          details: 'user_id is required',
        });
      }

      // Fetch user profile
      const profile = await prisma.profile.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          full_name: true,
          created_at: true,
          updated_at: true,
          user_companies: {
            where: { company_id: companyId },
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  created_at: true,
                },
              },
            },
          },
          group_memberships: {
            where: {
              group: {
                company_id: companyId,
              },
            },
            include: {
              group: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  company_id: true,
                  created_at: true,
                  updated_at: true,
                },
              },
            },
          },
        },
      });

      if (!profile) {
        return res.status(404).json({
          error: 'User not found',
        });
      }

      // Verify user belongs to company
      const belongsToCompany = profile.user_companies.length > 0;

      if (!belongsToCompany) {
        return res.status(403).json({
          error: 'Access denied',
          details: 'The user does not belong to the company associated with this API key',
        });
      }

      // Format response
      const userData = {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        user_company: profile.user_companies.map((uc) => ({
          id: uc.id,
          company_id: uc.company_id,
          role: uc.role,
          created_at: uc.created_at,
          companies: uc.company,
        })),
        profile_group_members: profile.group_memberships.map((gm) => ({
          id: gm.id,
          group_id: gm.group_id,
          created_at: gm.created_at,
          profile_groups: gm.group,
        })),
      };

      return res.json({
        success: true,
        user: userData,
      });
    } catch (error) {
      console.error('Error getting user:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/companies/:companyId/users
   * List users (profiles) in the company (JWT, user must belong to company)
   */
  async getCompanyUsers(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID' });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { user_id: userId, company_id: companyId },
      });
      if (!userCompany) {
        return res.status(403).json({ error: 'Forbidden', details: 'You do not have access to this company' });
      }

      const userCompanies = await prisma.userCompany.findMany({
        where: { company_id: companyId },
        include: {
          profile: {
            select: { id: true, email: true, full_name: true },
          },
        },
      });

      const users = (userCompanies || [])
        .map((uc) => (uc.profile ? { ...uc.profile, role: uc.role } : null))
        .filter(Boolean)
        .sort((a, b) => ((a as any).full_name || '').localeCompare((b as any).full_name || ''));

      return res.json(users);
    } catch (error) {
      console.error('getCompanyUsers error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/companies/:companyId/invitations
   * List pending invitations for the company (JWT, company admin)
   */
  async getCompanyInvitations(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID' });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { user_id: userId, company_id: companyId, role: 'company_admin' },
      });
      if (!userCompany) {
        return res.status(403).json({ error: 'Forbidden', details: 'Company admin required' });
      }

      const invitations = await prisma.invitation.findMany({
        where: { company_id: companyId, status: 'pending' },
        orderBy: { created_at: 'desc' },
      });

      return res.json(invitations);
    } catch (error) {
      console.error('getCompanyInvitations error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * DELETE /api/invitations/:id
   * Cancel an invitation (JWT, company admin of the invitation's company)
   */
  async deleteInvitation(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Missing invitation ID' });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }

      const invitation = await prisma.invitation.findUnique({
        where: { id },
        select: { company_id: true },
      });
      if (!invitation) {
        return res.status(404).json({ error: 'Invitation not found', details: 'Invitation not found' });
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { user_id: userId, company_id: invitation.company_id, role: 'company_admin' },
      });
      if (!userCompany) {
        return res.status(403).json({ error: 'Forbidden', details: 'Company admin required' });
      }

      await prisma.invitation.deleteMany({
        where: { id, company_id: invitation.company_id },
      });

      return res.status(204).send();
    } catch (error) {
      console.error('deleteInvitation error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
