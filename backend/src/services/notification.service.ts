import { prisma } from '../lib/prisma';

export const notificationService = {
  /**
   * Create a notification for a user
   * @param userId User ID
   * @param companyId Company ID
   * @param title Notification title
   * @param message Notification message
   * @param type Notification type
   * @param data Additional data
   */
  async createNotification(
    userId: string,
    companyId: string | null,
    title: string,
    message: string,
    type: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          user_id: userId,
          company_id: companyId,
          title,
          message,
          type,
          data: data || {},
          is_read: false,
        },
      });
      console.log(`Notification created for user ${userId}`);
    } catch (error) {
      console.error('Error creating notification:', error);
      throw new Error('Failed to create notification');
    }
  },

  /**
   * Create notifications for a group
   * @param groupId Group ID
   * @param companyId Company ID
   * @param title Notification title
   * @param message Notification message
   * @param type Notification type
   * @param data Additional data
   */
  async createGroupNotification(
    groupId: string,
    companyId: string,
    title: string,
    message: string,
    type: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      // Get all members of the group
      const groupMembers = await prisma.profileGroupMember.findMany({
        where: { group_id: groupId },
        include: { profile: true },
      });

      // Create notification for each member
      const notifications = groupMembers.map((member) => ({
        user_id: member.profile_id!,
        company_id: companyId,
        title,
        message,
        type,
        data: data || {},
        is_read: false,
      }));

      if (notifications.length > 0) {
        await prisma.notification.createMany({
          data: notifications,
        });
        console.log(`Notifications created for ${notifications.length} group members`);
      }
    } catch (error) {
      console.error('Error creating group notifications:', error);
      throw new Error('Failed to create group notifications');
    }
  },

  /**
   * Create assignment notification
   * @param assignedUserId Assigned user ID (optional)
   * @param assignedGroupId Assigned group ID (optional)
   * @param companyId Company ID
   * @param workflowName Workflow name
   * @param stepName Step name
   * @param executionId Execution ID
   */
  async createAssignmentNotification(
    assignedUserId: string | null,
    assignedGroupId: string | null,
    companyId: string,
    workflowName: string,
    stepName: string,
    executionId: string
  ): Promise<void> {
    const title = 'New Task Assigned';
    const message = `You have been assigned to complete "${stepName}" in workflow "${workflowName}"`;
    const type = 'assignment';
    const data = {
      workflow_name: workflowName,
      step_name: stepName,
      execution_id: executionId,
    };

    try {
      if (assignedUserId) {
        await this.createNotification(
          assignedUserId,
          companyId,
          title,
          message,
          type,
          data
        );
      }

      if (assignedGroupId) {
        await this.createGroupNotification(
          assignedGroupId,
          companyId,
          title,
          message,
          type,
          data
        );
      }
    } catch (error) {
      console.error('Error creating assignment notification:', error);
      // Don't throw - notifications are not critical
    }
  },

  /**
   * Mark notification as read
   * @param notificationId Notification ID
   * @param userId User ID (for verification)
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      await prisma.notification.update({
        where: {
          id: notificationId,
          user_id: userId, // Ensure user owns the notification
        },
        data: {
          is_read: true,
        },
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw new Error('Failed to mark notification as read');
    }
  },

  /**
   * Get unread notifications for a user
   * @param userId User ID
   * @param limit Maximum number of notifications to return
   */
  async getUnreadNotifications(userId: string, limit: number = 50) {
    try {
      return await prisma.notification.findMany({
        where: {
          user_id: userId,
          is_read: false,
        },
        orderBy: {
          created_at: 'desc',
        },
        take: limit,
      });
    } catch (error) {
      console.error('Error getting unread notifications:', error);
      throw new Error('Failed to get unread notifications');
    }
  },
};
