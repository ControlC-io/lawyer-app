import { prisma } from '../lib/prisma';
import { emailService } from './email.service';

type AssignmentDispatchResult = {
  found: boolean;
  message: string;
  recipients_total: number;
  recipients_notified: number;
  recipients_emailed: number;
};

export type NotificationTemplateContext = {
  executionLink: string;
  fieldValuesByName: Map<string, { value: string; ambiguous: boolean }>;
};

function stringifyTemplateValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function decodeHtmlEntitiesForTemplateToken(input: string): string {
  return input
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function normalizeTemplateTokenKey(token: string): string {
  const withoutTags = token.replace(/<[^>]*>/g, ' ');
  const decoded = decodeHtmlEntitiesForTemplateToken(withoutTags).replace(/\u00A0/g, ' ');
  return decoded.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function normalizeNotificationTemplateVariableTokens(template: string): string {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawToken: string) => {
    const withoutTags = rawToken.replace(/<[^>]*>/g, ' ');
    const decoded = decodeHtmlEntitiesForTemplateToken(withoutTags).replace(/\u00A0/g, ' ');
    const cleaned = decoded.replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return `{{${cleaned}}}`;
  });
}

export function buildDisplayNameByFieldId(rawDataStructure: unknown): Record<string, string> {
  const fields = Array.isArray(rawDataStructure) ? rawDataStructure : [];
  const displayNameByFieldId: Record<string, string> = {};

  for (const field of fields) {
    if (!field || typeof field !== 'object') continue;
    const id = typeof (field as any).id === 'string' ? (field as any).id : '';
    const name = typeof (field as any).name === 'string' ? (field as any).name.trim() : '';
    if (!id || !name) continue;
    displayNameByFieldId[id] = name;
  }

  for (const field of fields) {
    if (!field || typeof field !== 'object') continue;
    const id = typeof (field as any).id === 'string' ? (field as any).id : '';
    const name = typeof (field as any).name === 'string' ? (field as any).name.trim() : '';
    const parentId =
      typeof (field as any).parent_item_id === 'string' ? (field as any).parent_item_id : '';
    if (!id || !name || !parentId) continue;
    const parentName = displayNameByFieldId[parentId];
    if (!parentName) continue;
    displayNameByFieldId[id] = `${parentName}.${name}`;
  }

  return displayNameByFieldId;
}

export function buildFieldValuesByName(
  displayNameByFieldId: Record<string, string>,
  executionDataSnapshot: Record<string, unknown>
): Map<string, { value: string; ambiguous: boolean }> {
  const fieldValuesByName = new Map<string, { value: string; ambiguous: boolean }>();
  for (const [fieldId, displayName] of Object.entries(displayNameByFieldId)) {
    const tokenKey = normalizeTemplateTokenKey(displayName);
    if (!tokenKey) continue;
    const existing = fieldValuesByName.get(tokenKey);
    const value = stringifyTemplateValue(executionDataSnapshot[fieldId]);
    if (!existing) {
      fieldValuesByName.set(tokenKey, { value, ambiguous: false });
      continue;
    }
    fieldValuesByName.set(tokenKey, { value: existing.value, ambiguous: true });
  }
  return fieldValuesByName;
}

export function renderNotificationTemplate(template: string, context: NotificationTemplateContext): string {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawToken: string) => {
    const tokenKey = normalizeTemplateTokenKey(rawToken);
    if (!tokenKey) return '';
    if (tokenKey === 'execution_link') {
      return context.executionLink;
    }
    const entry = context.fieldValuesByName.get(tokenKey);
    if (!entry || entry.ambiguous) return '';
    return entry.value;
  });
}

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
   * Dispatch assignment notifications (in-app + email) for an execution step.
   * Returns a summary and never throws for per-recipient email failures.
   */
  async dispatchAssignmentForExecutionStep(executionStepId: string): Promise<AssignmentDispatchResult> {
    const stepInstance = await prisma.workflowExecutionStep.findUnique({
      where: { id: executionStepId },
      include: {
        execution: {
          include: {
            workflow: {
              select: {
                id: true,
                name: true,
                data_structure: true,
              },
            },
          },
        },
        step: {
          select: {
            id: true,
            name: true,
            config: true,
          },
        },
      },
    });

    if (!stepInstance) {
      return {
        found: false,
        message: 'Step instance not found',
        recipients_total: 0,
        recipients_notified: 0,
        recipients_emailed: 0,
      };
    }

    const workflowName = stepInstance.execution.workflow.name || 'Workflow';
    const stepName = stepInstance.step.name || 'Next Step';
    const executionId = stepInstance.execution_id;
    const companyId = stepInstance.company_id!;
    const executionLink = `${process.env.APP_URL || 'http://localhost'}/executions/${executionId}`;

    const executionDataRows = await prisma.workflowExecutionData.findMany({
      where: { execution_id: executionId },
      select: { values: true },
    });
    const executionDataSnapshot: Record<string, unknown> = {};
    executionDataRows.forEach((row: any) => {
      const values = row?.values && typeof row.values === 'object' ? row.values : {};
      Object.entries(values as Record<string, any>).forEach(([fieldId, fieldData]) => {
        executionDataSnapshot[fieldId] = fieldData?.value ?? fieldData;
      });
    });

    const displayNameByFieldId = buildDisplayNameByFieldId(stepInstance.execution.workflow.data_structure);
    const templateContext: NotificationTemplateContext = {
      executionLink,
      fieldValuesByName: buildFieldValuesByName(displayNameByFieldId, executionDataSnapshot),
    };
    const notificationsConfig =
      stepInstance.step?.config && typeof stepInstance.step.config === 'object'
        ? (stepInstance.step.config as Record<string, any>).notifications
        : undefined;
    const assignmentConfig =
      notificationsConfig && typeof notificationsConfig === 'object' && notificationsConfig.assignment && typeof notificationsConfig.assignment === 'object'
        ? notificationsConfig.assignment
        : {};
    const subjectTemplate =
      typeof assignmentConfig.subject_template === 'string' ? assignmentConfig.subject_template.trim() : '';
    const contentTemplate =
      typeof assignmentConfig.content_template === 'string' ? assignmentConfig.content_template.trim() : '';
    const useCustomNotification =
      typeof assignmentConfig.use_custom_notification === 'boolean'
        ? assignmentConfig.use_custom_notification
        : subjectTemplate.length > 0 || contentTemplate.length > 0;

    const defaultSubject = `New task assigned: ${stepName}`;
    const defaultContent = `You have been assigned to complete a step in ${workflowName}.\nStep: ${stepName}`;
    const defaultInAppMessage = `A new step "${stepName}" has been assigned to you in the workflow "${workflowName}".`;

    let renderedSubject: string;
    let renderedContent: string;
    if (!useCustomNotification) {
      renderedSubject = defaultSubject;
      renderedContent = defaultContent;
    } else {
      renderedSubject = subjectTemplate
        ? renderNotificationTemplate(subjectTemplate, templateContext)
        : defaultSubject;
      renderedContent = contentTemplate
        ? renderNotificationTemplate(contentTemplate, templateContext)
        : defaultContent;
    }

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

    recipientIds = [...new Set(recipientIds)];
    if (recipientIds.length === 0) {
      return {
        found: true,
        message: 'No recipients assigned',
        recipients_total: 0,
        recipients_notified: 0,
        recipients_emailed: 0,
      };
    }

    const profiles = await prisma.profile.findMany({
      where: { id: { in: recipientIds } },
      select: {
        id: true,
        email: true,
        notifications_enabled: true,
      },
    });

    const eligibleRecipients = profiles.filter((p) => p.notifications_enabled !== false);
    const recipientsWithEmail = eligibleRecipients.filter((p) => !!p.email);

    const internalNotifications = recipientIds.map((recipientId) => ({
      user_id: recipientId,
      company_id: companyId,
      title: renderedSubject || 'New Task Assigned',
      message: renderedContent || defaultInAppMessage,
      type: 'assignment',
      data: {
        execution_id: executionId,
        step_id: stepInstance.step.id,
        execution_step_id: executionStepId,
      },
      is_read: false,
    }));

    if (internalNotifications.length > 0) {
      await prisma.notification.createMany({
        data: internalNotifications as any,
      });
    }

    let recipientsEmailed = 0;
    for (const recipient of recipientsWithEmail) {
      try {
        await emailService.sendAssignmentNotification(
          recipient.email!,
          workflowName,
          stepName,
          executionId,
          {
            subject: renderedSubject,
            content: renderedContent,
          }
        );
        recipientsEmailed += 1;
      } catch (error) {
        console.error(
          `[notifications] Error sending assignment email to ${recipient.email}:`,
          error
        );
      }
    }

    if (eligibleRecipients.length === 0) {
      return {
        found: true,
        message: 'Internal notifications created, but all recipients have email notifications disabled',
        recipients_total: recipientIds.length,
        recipients_notified: internalNotifications.length,
        recipients_emailed: 0,
      };
    }

    return {
      found: true,
      message: 'Assignment notifications dispatched',
      recipients_total: recipientIds.length,
      recipients_notified: internalNotifications.length,
      recipients_emailed: recipientsEmailed,
    };
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
