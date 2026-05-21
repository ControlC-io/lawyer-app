import { externalLinkExpiryService } from '../services/externalLinkExpiry.service';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    workflowExecutionStep: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../services/workflow.service', () => ({
  workflowService: {
    advanceWorkflow: jest.fn().mockResolvedValue([]),
    cancelReminderForExecutionStep: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('externalLinkExpiry.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should auto-close expired external steps and advance workflow', async () => {
    (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ex-step-1',
        execution_id: 'exec-1',
        step_id: 'wf-step-1',
        company_id: 'company-1',
        started_at: new Date(Date.now() - 120_000),
        step_data: {},
        step: {
          config: {
            outputs: ['Submit', 'Cancel'],
            external_link_expired_output: 'Cancel',
          },
        },
      },
    ]);
    (prisma.workflowExecutionStep.update as jest.Mock).mockResolvedValue({});

    const processed = await externalLinkExpiryService.processExpiredLinks();

    expect(processed).toBe(1);
    expect(workflowService.cancelReminderForExecutionStep).toHaveBeenCalledWith('ex-step-1');
    expect(prisma.workflowExecutionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ex-step-1' },
        data: expect.objectContaining({
          status: 'completed',
          decision_choice: 'Cancel',
          step_data: expect.objectContaining({
            _submission_type: 'external_expired',
          }),
        }),
      })
    );
    expect(workflowService.advanceWorkflow).toHaveBeenCalledWith(
      'exec-1',
      'ex-step-1',
      'company-1',
      'Cancel'
    );
  });

  it('should return zero when no expired steps exist', async () => {
    (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([]);

    const processed = await externalLinkExpiryService.processExpiredLinks();

    expect(processed).toBe(0);
    expect(prisma.workflowExecutionStep.update).not.toHaveBeenCalled();
  });
});
