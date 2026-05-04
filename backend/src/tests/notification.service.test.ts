import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    profileGroupMember: {
      findMany: jest.fn(),
    },
    workflowExecutionStep: {
      findUnique: jest.fn(),
    },
    workflowExecutionData: {
      findMany: jest.fn(),
    },
    profile: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../services/email.service', () => ({
  emailService: {
    sendAssignmentNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('notification.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('createNotification', () => {
    it('should call prisma.notification.create with user_id, company_id, title, message, type, data, is_read: false', async () => {
      (prisma.notification.create as jest.Mock).mockResolvedValue({} as any);

      await notificationService.createNotification(
        'user-1',
        'company-1',
        'Title',
        'Message',
        'info',
        { key: 'value' }
      );

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          company_id: 'company-1',
          title: 'Title',
          message: 'Message',
          type: 'info',
          data: { key: 'value' },
          is_read: false,
        },
      });
    });

    it('should pass empty object for data when not provided', async () => {
      (prisma.notification.create as jest.Mock).mockResolvedValue({} as any);

      await notificationService.createNotification(
        'user-1',
        null,
        'Title',
        'Message',
        'alert'
      );

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: {},
          company_id: null,
        }),
      });
    });

    it('should throw when prisma.create throws', async () => {
      (prisma.notification.create as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        notificationService.createNotification('u', null, 't', 'm', 'type')
      ).rejects.toThrow('Failed to create notification');
    });
  });

  describe('createGroupNotification', () => {
    it('should create one notification per group member via createMany', async () => {
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([
        { profile_id: 'member-1', group_id: 'g1' } as any,
        { profile_id: 'member-2', group_id: 'g1' } as any,
      ]);
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 2 } as any);

      await notificationService.createGroupNotification(
        'group-1',
        'company-1',
        'Title',
        'Message',
        'info',
        { extra: true }
      );

      expect(prisma.profileGroupMember.findMany).toHaveBeenCalledWith({
        where: { group_id: 'group-1' },
        include: { profile: true },
      });
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            user_id: 'member-1',
            company_id: 'company-1',
            title: 'Title',
            message: 'Message',
            type: 'info',
            data: { extra: true },
            is_read: false,
          },
          {
            user_id: 'member-2',
            company_id: 'company-1',
            title: 'Title',
            message: 'Message',
            type: 'info',
            data: { extra: true },
            is_read: false,
          },
        ],
      });
    });

    it('should not call createMany when group has no members', async () => {
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);

      await notificationService.createGroupNotification(
        'group-1',
        'company-1',
        'Title',
        'Message',
        'info'
      );

      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('should throw when findMany or createMany throws', async () => {
      (prisma.profileGroupMember.findMany as jest.Mock).mockRejectedValue(new Error('DB'));

      await expect(
        notificationService.createGroupNotification(
          'g',
          'c',
          't',
          'm',
          'type'
        )
      ).rejects.toThrow('Failed to create group notifications');
    });
  });

  describe('createAssignmentNotification', () => {
    it('should call createNotification when only assignedUserId is set', async () => {
      (prisma.notification.create as jest.Mock).mockResolvedValue({} as any);

      await notificationService.createAssignmentNotification(
        'user-1',
        null,
        'company-1',
        'Workflow A',
        'Step 1',
        'exec-1'
      );

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          company_id: 'company-1',
          title: 'New Task Assigned',
          message: expect.stringContaining('Step 1'),
          type: 'assignment',
          data: {
            workflow_name: 'Workflow A',
            step_name: 'Step 1',
            execution_id: 'exec-1',
          },
          is_read: false,
        },
      });
      expect(prisma.profileGroupMember.findMany).not.toHaveBeenCalled();
    });

    it('should call createGroupNotification when only assignedGroupId is set', async () => {
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([
        { profile_id: 'p1' } as any,
      ]);
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 } as any);

      await notificationService.createAssignmentNotification(
        null,
        'group-1',
        'company-1',
        'W',
        'S',
        'e1'
      );

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(prisma.profileGroupMember.findMany).toHaveBeenCalledWith({
        where: { group_id: 'group-1' },
        include: { profile: true },
      });
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    });

    it('should call both when both assignedUserId and assignedGroupId are set', async () => {
      (prisma.notification.create as jest.Mock).mockResolvedValue({} as any);
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([
        { profile_id: 'p1' } as any,
      ]);
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 } as any);

      await notificationService.createAssignmentNotification(
        'user-1',
        'group-1',
        'company-1',
        'W',
        'S',
        'e1'
      );

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    });

    it('should not call create or createMany when neither assignedUserId nor assignedGroupId', async () => {
      await notificationService.createAssignmentNotification(
        null,
        null,
        'company-1',
        'W',
        'S',
        'e1'
      );

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(prisma.profileGroupMember.findMany).not.toHaveBeenCalled();
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should call prisma.notification.update with id, user_id, is_read: true', async () => {
      (prisma.notification.update as jest.Mock).mockResolvedValue({} as any);

      await notificationService.markAsRead('notif-1', 'user-1');

      expect(prisma.notification.update).toHaveBeenCalledTimes(1);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: {
          id: 'notif-1',
          user_id: 'user-1',
        },
        data: {
          is_read: true,
        },
      });
    });

    it('should throw when update throws', async () => {
      (prisma.notification.update as jest.Mock).mockRejectedValue(new Error('DB'));

      await expect(
        notificationService.markAsRead('n', 'u')
      ).rejects.toThrow('Failed to mark notification as read');
    });
  });

  describe('getUnreadNotifications', () => {
    it('should call findMany with user_id, is_read: false, orderBy, take and return result', async () => {
      const notifications = [
        { id: 'n1', user_id: 'u1', is_read: false, title: 'A' } as any,
      ];
      (prisma.notification.findMany as jest.Mock).mockResolvedValue(notifications);

      const result = await notificationService.getUnreadNotifications(
        'user-1',
        25
      );

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          user_id: 'user-1',
          is_read: false,
        },
        orderBy: { created_at: 'desc' },
        take: 25,
      });
      expect(result).toEqual(notifications);
    });

    it('should use default limit 50 when not provided', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);

      await notificationService.getUnreadNotifications('user-1');

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('should throw when findMany throws', async () => {
      (prisma.notification.findMany as jest.Mock).mockRejectedValue(new Error('DB'));

      await expect(
        notificationService.getUnreadNotifications('u')
      ).rejects.toThrow('Failed to get unread notifications');
    });
  });

  describe('dispatchAssignmentForExecutionStep', () => {
    beforeEach(() => {
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.profile.findMany as jest.Mock).mockResolvedValue([
        { id: 'recipient-1', email: 'recipient@example.com', notifications_enabled: true },
      ]);
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it('renders subject/content templates using field names and execution link', async () => {
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
        execution_id: 'exec-1',
        company_id: 'company-1',
        assigned_to_user_id: 'recipient-1',
        assigned_to_group_id: null,
        execution: {
          workflow: {
            id: 'wf-1',
            name: 'Workflow A',
            data_structure: [
              { id: 'field-1', name: 'Customer Name' },
            ],
          },
        },
        step: {
          id: 'step-1',
          name: 'Review',
          config: {
            notifications: {
              assignment: {
                enabled: true,
                use_custom_notification: true,
                subject_template: 'Task for {{Customer Name}}',
                content_template: 'Execution: {{execution_link}}',
              },
            },
          },
        },
      });
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        {
          values: {
            'field-1': { value: 'Acme Corp' },
          },
        },
      ]);

      const result = await notificationService.dispatchAssignmentForExecutionStep('ex-step-1');

      expect(result.found).toBe(true);
      expect(prisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              title: 'Task for Acme Corp',
              message: 'Execution: http://localhost/workflows/executions/exec-1',
            }),
          ],
        })
      );
      expect(emailService.sendAssignmentNotification).toHaveBeenCalledWith(
        'recipient@example.com',
        'Workflow A',
        'Review',
        'exec-1',
        expect.objectContaining({
          subject: 'Task for Acme Corp',
          content: 'Execution: http://localhost/workflows/executions/exec-1',
        })
      );
    });

    it('returns empty replacement for missing or ambiguous field names', async () => {
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
        execution_id: 'exec-1',
        company_id: 'company-1',
        assigned_to_user_id: 'recipient-1',
        assigned_to_group_id: null,
        execution: {
          workflow: {
            id: 'wf-1',
            name: 'Workflow A',
            data_structure: [
              { id: 'field-1', name: 'Owner' },
              { id: 'field-2', name: 'Owner' },
            ],
          },
        },
        step: {
          id: 'step-1',
          name: 'Review',
          config: {
            notifications: {
              assignment: {
                enabled: true,
                use_custom_notification: true,
                subject_template: 'For {{Owner}}',
                content_template: 'Missing {{NotExisting}}',
              },
            },
          },
        },
      });
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        {
          values: {
            'field-1': { value: 'Alice' },
            'field-2': { value: 'Bob' },
          },
        },
      ]);

      await notificationService.dispatchAssignmentForExecutionStep('ex-step-1');

      expect(emailService.sendAssignmentNotification).toHaveBeenCalledWith(
        'recipient@example.com',
        'Workflow A',
        'Review',
        'exec-1',
        expect.objectContaining({
          subject: 'For ',
          content: 'Missing ',
        })
      );
    });

    it('infers custom templates when use_custom_notification is omitted but templates are non-empty', async () => {
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
        execution_id: 'exec-1',
        company_id: 'company-1',
        assigned_to_user_id: 'recipient-1',
        assigned_to_group_id: null,
        execution: {
          workflow: {
            id: 'wf-1',
            name: 'Workflow A',
            data_structure: [{ id: 'field-1', name: 'Customer Name' }],
          },
        },
        step: {
          id: 'step-1',
          name: 'Review',
          config: {
            notifications: {
              assignment: {
                enabled: true,
                subject_template: 'Hello {{Customer Name}}',
                content_template: '',
              },
            },
          },
        },
      });
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        { values: { 'field-1': { value: 'Legacy' } } },
      ]);

      await notificationService.dispatchAssignmentForExecutionStep('ex-step-1');

      expect(emailService.sendAssignmentNotification).toHaveBeenCalledWith(
        'recipient@example.com',
        'Workflow A',
        'Review',
        'exec-1',
        expect.objectContaining({
          subject: 'Hello Legacy',
        })
      );
    });

    it('ignores templates when use_custom_notification is false', async () => {
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
        execution_id: 'exec-1',
        company_id: 'company-1',
        assigned_to_user_id: 'recipient-1',
        assigned_to_group_id: null,
        execution: {
          workflow: {
            id: 'wf-1',
            name: 'Workflow A',
            data_structure: [{ id: 'field-1', name: 'Customer Name' }],
          },
        },
        step: {
          id: 'step-1',
          name: 'Review',
          config: {
            notifications: {
              assignment: {
                enabled: true,
                use_custom_notification: false,
                subject_template: 'Ignored {{Customer Name}}',
                content_template: 'Also ignored {{execution_link}}',
              },
            },
          },
        },
      });
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        { values: { 'field-1': { value: 'Acme Corp' } } },
      ]);

      await notificationService.dispatchAssignmentForExecutionStep('ex-step-1');

      expect(emailService.sendAssignmentNotification).toHaveBeenCalledWith(
        'recipient@example.com',
        'Workflow A',
        'Review',
        'exec-1',
        expect.objectContaining({
          subject: 'New task assigned: Review',
          content: 'You have been assigned to complete a step in Workflow A.\nStep: Review',
        })
      );
    });

    it('falls back to default subject/content when no templates are configured', async () => {
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
        execution_id: 'exec-1',
        company_id: 'company-1',
        assigned_to_user_id: 'recipient-1',
        assigned_to_group_id: null,
        execution: {
          workflow: {
            id: 'wf-1',
            name: 'Workflow A',
            data_structure: [],
          },
        },
        step: {
          id: 'step-1',
          name: 'Review',
          config: {},
        },
      });

      await notificationService.dispatchAssignmentForExecutionStep('ex-step-1');

      expect(emailService.sendAssignmentNotification).toHaveBeenCalledWith(
        'recipient@example.com',
        'Workflow A',
        'Review',
        'exec-1',
        expect.objectContaining({
          subject: 'New task assigned: Review',
          content: 'You have been assigned to complete a step in Workflow A.\nStep: Review',
        })
      );
    });
  });
});
