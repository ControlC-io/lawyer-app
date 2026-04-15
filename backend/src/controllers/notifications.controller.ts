import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
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
   * DELETE /api/notifications/:id
   * Delete one notification for current user (JWT)
   */
  async remove(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }
      if (!id) {
        return res.status(400).json({ error: 'Missing notification ID' });
      }

      const result = await prisma.notification.deleteMany({
        where: { id, user_id: userId },
      });
      if (result.count === 0) {
        return res.status(404).json({ error: 'Notification not found', details: 'Notification not found or access denied' });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('delete notification error:', error);
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

      const result = await notificationService.dispatchAssignmentForExecutionStep(execution_step_id);
      if (!result.found) {
        return res.status(404).json({
          error: 'Step instance not found',
        });
      }

      return res.json({
        success: true,
        message: result.message,
        recipients_total: result.recipients_total,
        recipients_notified: result.recipients_notified,
        recipients_emailed: result.recipients_emailed,
      });
    } catch (error) {
      console.error('Notification error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
