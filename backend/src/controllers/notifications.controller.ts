import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email.service';
import { notificationService } from '../services/notification.service';

export const notificationsController = {
  /**
   * GET /api/notifications
   * List notifications for current user (JWT)
   */
  async list(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }
      const companyId = req.query.companyId as string | undefined;

      const where: { user_id: string; company_id?: string | null } = { user_id: userId };
      if (companyId !== undefined) where.company_id = companyId || null;

      const notifications = await prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: 100,
      });
      return res.json(notifications);
    } catch (error) {
      console.error('list notifications error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * PATCH /api/notifications/:id/read
   * Mark one notification as read (JWT)
   */
  async markAsRead(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }
      if (!id) {
        return res.status(400).json({ error: 'Missing notification ID' });
      }

      const result = await prisma.notification.updateMany({
        where: { id, user_id: userId },
        data: { is_read: true },
      });
      if (result.count === 0) {
        return res.status(404).json({ error: 'Notification not found', details: 'Notification not found or access denied' });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('markAsRead error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/notifications/mark-all-read
   * Mark all notifications as read for current user (JWT)
   */
  async markAllAsRead(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }

      await prisma.notification.updateMany({
        where: { user_id: userId, is_read: false },
        data: { is_read: true },
      });
      return res.status(204).send();
    } catch (error) {
      console.error('markAllAsRead error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/notifications/assignment
   * Send assignment notification (was: send-assignment-notification)
   */
  async sendAssignmentNotification(req: AuthRequest, res: Response) {
    try {
      const { execution_step_id } = req.body;

      if (!execution_step_id) {
        return res.status(400).json({
          error: 'execution_step_id is required',
        });
      }

      // Fetch step and execution details
      const stepInstance = await prisma.workflowExecutionStep.findUnique({
        where: { id: execution_step_id },
        include: {
          execution: {
            include: {
              workflow: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          step: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!stepInstance) {
        return res.status(404).json({
          error: 'Step instance not found',
        });
      }

      const workflowName = stepInstance.execution.workflow.name || 'Workflow';
      const stepName = stepInstance.step.name || 'Next Step';
      const executionId = stepInstance.execution_id;
      const companyId = stepInstance.company_id!;

      // Identify recipients
      let recipientIds: string[] = [];

      if (stepInstance.assigned_to_user_id) {
        recipientIds.push(stepInstance.assigned_to_user_id);
      }

      if (stepInstance.assigned_to_group_id) {
        const groupMembers = await prisma.profileGroupMember.findMany({
          where: { group_id: stepInstance.assigned_to_group_id },
          select: { profile_id: true },
        });
        recipientIds.push(...groupMembers.map((gm) => gm.profile_id!));
      }

      // Remove duplicates
      recipientIds = [...new Set(recipientIds)];

      if (recipientIds.length === 0) {
        return res.json({
          success: true,
          message: 'No recipients assigned',
        });
      }

      // Fetch recipient profiles
      const profiles = await prisma.profile.findMany({
        where: { id: { in: recipientIds } },
        select: {
          id: true,
          email: true,
          full_name: true,
          notifications_enabled: true,
        },
      });

      const eligibleRecipients = profiles.filter(
        (p) => p.notifications_enabled !== false
      );

      // Create internal notifications for all recipients
      const internalNotifications = recipientIds.map((recipientId) => ({
        user_id: recipientId,
        company_id: companyId,
        title: 'New Task Assigned',
        message: `A new step "${stepName}" has been assigned to you in the workflow "${workflowName}".`,
        type: 'assignment',
        data: {
          execution_id: executionId,
          step_id: stepInstance.step.id,
          execution_step_id,
        },
      }));

      if (internalNotifications.length > 0) {
        await prisma.notification.createMany({
          data: internalNotifications as any,
        });
      }

      if (eligibleRecipients.length === 0) {
        return res.json({
          success: true,
          message: 'Internal notifications created, but all recipients have email notifications disabled',
        });
      }

      // Send emails to eligible recipients
      for (const recipient of eligibleRecipients) {
        try {
          await emailService.sendAssignmentNotification(
            recipient.email,
            workflowName,
            stepName,
            executionId
          );
        } catch (error) {
          console.error(`Error sending email to ${recipient.email}:`, error);
          // Continue with other recipients
        }
      }

      return res.json({
        success: true,
        recipients_emailed: eligibleRecipients.length,
      });
    } catch (error) {
      console.error('Notification error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
