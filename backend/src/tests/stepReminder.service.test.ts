import { stepReminderService } from '../services/stepReminder.service';
import { prisma } from '../lib/prisma';
import { notificationService } from '../services/notification.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    stepReminderJob: {
      create: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../services/notification.service', () => ({
  notificationService: {
    dispatchAssignmentForExecutionStep: jest.fn().mockResolvedValue({
      found: true,
      message: 'mocked',
      recipients_total: 1,
      recipients_notified: 1,
      recipients_emailed: 0,
    }),
  },
}));

describe('stepReminder.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates one job per schedule reminder', async () => {
    (prisma.stepReminderJob.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.stepReminderJob.createMany as jest.Mock).mockResolvedValue({ count: 2 });

    await stepReminderService.scheduleForExecutionStep('exec-step-1', 'company-1', {
      assignmentEnabled: true,
      reminderMode: 'schedule',
      reminderDelayMinutes: 60,
      repeatEveryMinutes: 60,
      scheduleMinutes: [60, 180],
      maxCount: undefined,
    });

    expect(prisma.stepReminderJob.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ reminder_key: 'schedule-0', mode: 'schedule' }),
          expect.objectContaining({ reminder_key: 'schedule-1', mode: 'schedule' }),
        ]),
      })
    );
  });

  it('stops repeat reminder when max count is reached', async () => {
    (prisma.stepReminderJob.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'job-1',
        execution_step_id: 'exec-step-1',
        mode: 'repeat',
        status: 'pending',
        next_run_at: new Date(),
        repeat_every_minutes: 120,
        max_count: 1,
        sent_count: 0,
        schedule_minutes: [],
        schedule_index: null,
        execution_step: { id: 'exec-step-1', status: 'running', company_id: 'company-1' },
      },
    ]);
    (prisma.stepReminderJob.update as jest.Mock).mockResolvedValue({});

    const processed = await stepReminderService.processDueReminders();

    expect(processed).toBe(1);
    expect(prisma.stepReminderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: 'sent',
          sent_count: 1,
        }),
      })
    );
    expect(notificationService.dispatchAssignmentForExecutionStep).toHaveBeenCalledWith('exec-step-1');
  });
});
