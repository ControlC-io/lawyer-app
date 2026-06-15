import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const notificationService = {
  async createNotification(
    userId: string,
    companyId: string | null,
    title: string,
    message: string,
    type: string,
    data?: Prisma.InputJsonValue,
  ): Promise<void> {
    await prisma.notification.create({
      data: {
        user_id: userId,
        company_id: companyId,
        title,
        message,
        type,
        data: data ?? {},
        is_read: false,
      },
    });
  },

  async createGroupNotification(
    groupId: string,
    companyId: string,
    title: string,
    message: string,
    type: string,
    data?: Prisma.InputJsonValue,
  ): Promise<void> {
    const groupMembers = await prisma.profileGroupMember.findMany({
      where: { group_id: groupId },
      include: { profile: true },
    });

    const notifications = groupMembers
      .filter((member) => member.profile_id)
      .map((member) => ({
        user_id: member.profile_id!,
        company_id: companyId,
        title,
        message,
        type,
        data: data ?? {},
        is_read: false,
      }));

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }
  },

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, user_id: userId },
      data: { is_read: true },
    });
    if (result.count === 0) {
      throw new Error('Notification not found or access denied');
    }
  },

  async getUnreadNotifications(userId: string, companyId?: string | null) {
    return prisma.notification.findMany({
      where: {
        user_id: userId,
        is_read: false,
        ...(companyId !== undefined ? { company_id: companyId } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  },
};
