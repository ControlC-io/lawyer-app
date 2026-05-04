import { prisma } from '../lib/prisma';
import { notificationService } from './notification.service';

type ReminderMode = 'none' | 'repeat' | 'schedule';

type StepNotificationSettings = {
  assignmentEnabled: boolean;
  reminderMode: ReminderMode;
  reminderDelayMinutes: number;
  repeatEveryMinutes: number;
  maxCount?: number;
  scheduleMinutes: number[];
};

type StepNotificationInput = {
  step_type?: string | null;
  action_type?: string | null;
  decision_node_type?: string | null;
  config?: unknown;
};

function parsePositiveInteger(value: unknown, fallbackValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : fallbackValue;
}

function supportsStepNotifications(step: StepNotificationInput): boolean {
  const stepType = step.step_type || '';
  const actionType = step.action_type || 'manual';
  const decisionType = step.decision_node_type || 'Human';
  if (stepType === 'edit_form') return true;
  if (stepType === 'action') return actionType === 'manual';
  if (stepType === 'decision') return decisionType === 'Human' || decisionType === 'Agent_Human' || decisionType === 'Agent + Human';
  return false;
}

export function resolveStepNotificationSettings(step: StepNotificationInput): StepNotificationSettings {
  if (!supportsStepNotifications(step)) {
    return {
      assignmentEnabled: true,
      reminderMode: 'none',
      reminderDelayMinutes: 24 * 60,
      repeatEveryMinutes: 24 * 60,
      maxCount: undefined,
      scheduleMinutes: [24 * 60],
    };
  }

  const config = (step.config && typeof step.config === 'object' ? step.config : {}) as Record<string, any>;
  const notifications =
    config.notifications && typeof config.notifications === 'object' ? config.notifications : {};
  const assignment =
    notifications.assignment && typeof notifications.assignment === 'object'
      ? notifications.assignment
      : {};
  const reminder =
    notifications.reminder && typeof notifications.reminder === 'object' ? notifications.reminder : {};
  const reminderMode: ReminderMode =
    reminder.mode === 'repeat' ? 'repeat' : reminder.mode === 'schedule' || reminder.mode === 'once' ? 'schedule' : 'none';
  const scheduleMinutesRaw = Array.isArray(reminder.schedule_minutes)
    ? reminder.schedule_minutes
    : reminder.delay_minutes
      ? [reminder.delay_minutes]
      : [];
  const scheduleMinutes = scheduleMinutesRaw
    .map((value: unknown) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value > 0)
    .map((value: number) => Math.round(value))
    .sort((a: number, b: number) => a - b)
    .filter((value: number, index: number, arr: number[]) => index === 0 || value !== arr[index - 1]);

  const assignmentEnabled = assignment.enabled !== false;
  const effectiveReminderMode: ReminderMode = assignmentEnabled ? reminderMode : 'none';

  return {
    assignmentEnabled,
    reminderMode: effectiveReminderMode,
    reminderDelayMinutes:
      effectiveReminderMode === 'repeat' ? parsePositiveInteger(reminder.delay_minutes, 24 * 60) : 24 * 60,
    repeatEveryMinutes:
      effectiveReminderMode === 'repeat' ? parsePositiveInteger(reminder.repeat_every_minutes, 24 * 60) : 24 * 60,
    maxCount:
      effectiveReminderMode === 'repeat' && reminder.max_count !== null && reminder.max_count !== undefined
        ? parsePositiveInteger(reminder.max_count, 1)
        : undefined,
    scheduleMinutes:
      effectiveReminderMode === 'schedule' && scheduleMinutes.length > 0 ? scheduleMinutes : [24 * 60],
  };
}

let reminderWorkerTimer: NodeJS.Timeout | null = null;

export const stepReminderService = {
  async scheduleForExecutionStep(
    executionStepId: string,
    companyId: string,
    settings: StepNotificationSettings
  ): Promise<void> {
    await prisma.stepReminderJob.deleteMany({
      where: { execution_step_id: executionStepId },
    });

    if (settings.reminderMode === 'none') {
      return;
    }

    if (settings.reminderMode === 'repeat') {
      const nextRunAt = new Date(Date.now() + settings.reminderDelayMinutes * 60_000);
      await prisma.stepReminderJob.create({
        data: {
          execution_step_id: executionStepId,
          reminder_key: 'repeat',
          company_id: companyId,
          mode: settings.reminderMode,
          status: 'pending',
          next_run_at: nextRunAt,
          repeat_every_minutes: settings.repeatEveryMinutes,
          max_count: settings.maxCount ?? null,
          sent_count: 0,
          schedule_minutes: [],
          schedule_index: null,
          last_error: null,
        },
      });
      return;
    }

    const schedule = settings.scheduleMinutes.length > 0 ? settings.scheduleMinutes : [24 * 60];
    await prisma.stepReminderJob.createMany({
      data: schedule.map((delayMinutes, index) => ({
        execution_step_id: executionStepId,
        reminder_key: `schedule-${index}`,
        company_id: companyId,
        mode: 'schedule',
        status: 'pending',
        next_run_at: new Date(Date.now() + delayMinutes * 60_000),
        repeat_every_minutes: null,
        max_count: null,
        sent_count: 0,
        schedule_minutes: schedule,
        schedule_index: index,
        last_error: null,
      })),
    });
  },

  async cancelForExecutionStep(executionStepId: string): Promise<void> {
    await prisma.stepReminderJob.updateMany({
      where: { execution_step_id: executionStepId, status: 'pending' },
      data: { status: 'cancelled' },
    });
  },

  async cancelForExecution(executionId: string): Promise<void> {
    await prisma.stepReminderJob.updateMany({
      where: {
        status: 'pending',
        execution_step: { execution_id: executionId },
      },
      data: { status: 'cancelled' },
    });
  },

  async processDueReminders(limit = 50): Promise<number> {
    const now = new Date();
    const dueJobs = await prisma.stepReminderJob.findMany({
      where: {
        status: 'pending',
        next_run_at: { lte: now },
      },
      orderBy: { next_run_at: 'asc' },
      take: limit,
      include: {
        execution_step: {
          select: {
            id: true,
            status: true,
            company_id: true,
          },
        },
      },
    });

    let processedCount = 0;

    for (const job of dueJobs) {
      const executionStep = job.execution_step;
      if (!executionStep || executionStep.status !== 'running') {
        await prisma.stepReminderJob.update({
          where: { id: job.id },
          data: { status: 'cancelled', last_error: null },
        });
        continue;
      }

      try {
        await notificationService.dispatchAssignmentForExecutionStep(job.execution_step_id);
        const nextSentCount = (job.sent_count || 0) + 1;
        const now = new Date();

        if (job.mode === 'repeat' && job.repeat_every_minutes && job.repeat_every_minutes > 0) {
          const reachedMax = typeof job.max_count === 'number' && nextSentCount >= job.max_count;
          if (reachedMax) {
            await prisma.stepReminderJob.update({
              where: { id: job.id },
              data: {
                status: 'sent',
                sent_count: nextSentCount,
                last_sent_at: now,
                attempt_count: { increment: 1 },
                last_error: null,
              },
            });
          } else {
            const nextRunAt = new Date(Date.now() + job.repeat_every_minutes * 60_000);
            await prisma.stepReminderJob.update({
              where: { id: job.id },
              data: {
                status: 'pending',
                next_run_at: nextRunAt,
                sent_count: nextSentCount,
                last_sent_at: now,
                attempt_count: { increment: 1 },
                last_error: null,
              },
            });
          }
        } else if (job.mode === 'schedule') {
          await prisma.stepReminderJob.update({
            where: { id: job.id },
            data: {
              status: 'sent',
              sent_count: nextSentCount,
              last_sent_at: now,
              attempt_count: { increment: 1 },
              last_error: null,
            },
          });
        } else {
          await prisma.stepReminderJob.update({
            where: { id: job.id },
            data: {
              status: 'sent',
              sent_count: nextSentCount,
              last_sent_at: now,
              attempt_count: { increment: 1 },
              last_error: null,
            },
          });
        }
        processedCount += 1;
      } catch (error) {
        await prisma.stepReminderJob.update({
          where: { id: job.id },
          data: {
            attempt_count: { increment: 1 },
            last_error: error instanceof Error ? error.message : 'Unknown reminder error',
            next_run_at: new Date(Date.now() + 15 * 60_000),
          },
        });
      }
    }

    return processedCount;
  },

  startWorker(): void {
    if (reminderWorkerTimer) return;
    const pollMs = parsePositiveInteger(process.env.STEP_REMINDER_POLL_MS, 60_000);
    reminderWorkerTimer = setInterval(() => {
      this.processDueReminders().catch((error) => {
        console.error('[step-reminder] Worker iteration failed:', error);
      });
    }, pollMs);
  },

  stopWorker(): void {
    if (!reminderWorkerTimer) return;
    clearInterval(reminderWorkerTimer);
    reminderWorkerTimer = null;
  },
};
