import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email.service';
import jwt from 'jsonwebtoken';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    workflowExecutionStep: { findUnique: jest.fn() },
    profileGroupMember: { findMany: jest.fn() },
    profile: { findMany: jest.fn() },
    notification: { createMany: jest.fn() },
  },
}));

jest.mock('../services/email.service', () => ({
  emailService: {
    sendAssignmentNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Notifications Endpoints', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com', profile: {} };
  const mockToken = jwt.sign({ userId: mockUser.id }, process.env.JWT_SECRET || 'test-secret');

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
  });

  describe('POST /api/notifications/assignment', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const response = await request(app)
        .post('/api/notifications/assignment')
        .send({ execution_step_id: 'step-123' });

      expect(response.status).toBe(401);
      expect(prisma.workflowExecutionStep.findUnique).not.toHaveBeenCalled();
    });

    it('should return 400 when execution_step_id is missing', async () => {
      const response = await request(app)
        .post('/api/notifications/assignment')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('execution_step_id is required');
      expect(prisma.workflowExecutionStep.findUnique).not.toHaveBeenCalled();
    });

    it('should return 404 when step instance is not found', async () => {
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/notifications/assignment')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ execution_step_id: 'missing-step' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Step instance not found');
    });

    it('should return 200 with no recipients when step has no assignees', async () => {
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
        execution_id: 'exec-1',
        company_id: 'company-1',
        assigned_to_user_id: null,
        assigned_to_group_id: null,
        execution: {
          workflow: { name: 'My Workflow' },
        },
        step: { id: 'step-1', name: 'Step One' },
      });

      const response = await request(app)
        .post('/api/notifications/assignment')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ execution_step_id: 'ex-step-1' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('No recipients assigned');
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
      expect(emailService.sendAssignmentNotification).not.toHaveBeenCalled();
    });

    it('should return 200 with recipients and call sendAssignmentNotification', async () => {
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
        execution_id: 'exec-1',
        company_id: 'company-1',
        assigned_to_user_id: 'profile-1',
        assigned_to_group_id: null,
        execution: {
          workflow: { name: 'My Workflow' },
        },
        step: { id: 'step-1', name: 'Step One' },
      });
      (prisma.profile.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'profile-1',
          email: 'assignee@example.com',
          full_name: 'Assignee',
          notifications_enabled: true,
        },
      ]);
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const response = await request(app)
        .post('/api/notifications/assignment')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ execution_step_id: 'ex-step-1' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.recipients_emailed).toBe(1);
      expect(prisma.notification.createMany).toHaveBeenCalled();
      expect(emailService.sendAssignmentNotification).toHaveBeenCalledWith(
        'assignee@example.com',
        'My Workflow',
        'Step One',
        'exec-1'
      );
    });

    it('should use group members when assigned_to_group_id is set', async () => {
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
        execution_id: 'exec-1',
        company_id: 'company-1',
        assigned_to_user_id: null,
        assigned_to_group_id: 'group-1',
        execution: { workflow: { name: 'WF' } },
        step: { id: 'step-1', name: 'Step' },
      });
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([
        { profile_id: 'profile-1' },
      ]);
      (prisma.profile.findMany as jest.Mock).mockResolvedValue([
        { id: 'profile-1', email: 'g@x.com', full_name: 'G', notifications_enabled: true },
      ]);
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const response = await request(app)
        .post('/api/notifications/assignment')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ execution_step_id: 'ex-step-1' });

      expect(response.status).toBe(200);
      expect(prisma.profileGroupMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { group_id: 'group-1' } })
      );
    });

    it('should return message when all recipients have notifications_enabled false', async () => {
      (prisma.workflowExecutionStep.findUnique as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
        execution_id: 'exec-1',
        company_id: 'company-1',
        assigned_to_user_id: 'profile-1',
        assigned_to_group_id: null,
        execution: { workflow: { name: 'WF' } },
        step: { id: 'step-1', name: 'Step' },
      });
      (prisma.profile.findMany as jest.Mock).mockResolvedValue([
        { id: 'profile-1', email: 'u@x.com', full_name: 'U', notifications_enabled: false },
      ]);
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      const response = await request(app)
        .post('/api/notifications/assignment')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ execution_step_id: 'ex-step-1' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('email notifications disabled');
      expect(emailService.sendAssignmentNotification).not.toHaveBeenCalled();
    });
  });
});
