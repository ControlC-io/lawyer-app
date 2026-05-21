import { prisma } from '../lib/prisma';
import { resolveExpiredOutput } from '../lib/externalLinkExpiry';
import { workflowService } from './workflow.service';

function parsePositiveInteger(value: unknown, fallbackValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : fallbackValue;
}

function attachStepCompletionMeta(
  rawStepData: unknown,
  params: {
    startedAt?: Date | null;
    completedAt: Date;
    closedBySource?: 'user' | 'company_api_key' | 'portal' | 'external' | 'system';
  }
) {
  const stepData =
    rawStepData && typeof rawStepData === 'object' && !Array.isArray(rawStepData)
      ? { ...(rawStepData as Record<string, unknown>) }
      : {};
  const existingMeta =
    stepData._step_meta && typeof stepData._step_meta === 'object' && !Array.isArray(stepData._step_meta)
      ? (stepData._step_meta as Record<string, unknown>)
      : {};

  return {
    ...stepData,
    _submission_type: 'external_expired',
    _step_meta: {
      ...existingMeta,
      opened_at: params.startedAt ? params.startedAt.toISOString() : null,
      closed_at: params.completedAt.toISOString(),
      ...(params.closedBySource ? { closed_by_source: params.closedBySource } : {}),
    },
  };
}

let expiryWorkerTimer: ReturnType<typeof setInterval> | null = null;

export const externalLinkExpiryService = {
  async processExpiredLinks(): Promise<number> {
    const now = new Date();
    const expiredSteps = await prisma.workflowExecutionStep.findMany({
      where: {
        status: 'running',
        external_token: { not: null },
        external_token_expires_at: { lte: now },
      },
      include: {
        step: {
          select: {
            config: true,
          },
        },
      },
    });

    let processedCount = 0;

    for (const executionStep of expiredSteps) {
      if (!executionStep.company_id || !executionStep.step) continue;

      try {
        const completedAt = new Date();
        const expiredOutput = resolveExpiredOutput(executionStep.step.config);
        const stepDataWithMeta = attachStepCompletionMeta(executionStep.step_data, {
          startedAt: executionStep.started_at,
          completedAt,
          closedBySource: 'system',
        });

        await workflowService.cancelReminderForExecutionStep(executionStep.id);
        await prisma.workflowExecutionStep.update({
          where: { id: executionStep.id },
          data: {
            status: 'completed',
            completed_at: completedAt,
            decision_choice: expiredOutput,
            step_data: stepDataWithMeta,
          },
        });

        await workflowService.advanceWorkflow(
          executionStep.execution_id,
          executionStep.id,
          executionStep.company_id,
          expiredOutput
        );

        processedCount += 1;
      } catch (error) {
        console.error(
          `[external-link-expiry] Failed to close execution step ${executionStep.id}:`,
          error
        );
      }
    }

    return processedCount;
  },

  startWorker(): void {
    if (expiryWorkerTimer) return;
    const pollMs = parsePositiveInteger(process.env.EXTERNAL_LINK_EXPIRY_POLL_MS, 60_000);
    expiryWorkerTimer = setInterval(() => {
      this.processExpiredLinks().catch((error) => {
        console.error('[external-link-expiry] Worker iteration failed:', error);
      });
    }, pollMs);
  },

  stopWorker(): void {
    if (!expiryWorkerTimer) return;
    clearInterval(expiryWorkerTimer);
    expiryWorkerTimer = null;
  },
};
