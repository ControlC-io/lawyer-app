import { workflowService } from '../services/workflow.service';
import { prisma } from '../lib/prisma';
import fetch from 'node-fetch';

jest.mock('../lib/prisma', () => ({
  prisma: {
    workflow: { findFirst: jest.fn() },
    workflowStep: { findUnique: jest.fn(), findMany: jest.fn() },
    workflowConnection: { findMany: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    workflowExecutionStep: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    workflowExecution: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    workflowExecutionData: { create: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
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

jest.mock('node-fetch');
jest.mock('../services/notification.service', () => ({
  notificationService: {
    dispatchAssignmentForExecutionStep: jest.fn().mockResolvedValue({
      found: true,
      message: 'mocked',
      recipients_total: 0,
      recipients_notified: 0,
      recipients_emailed: 0,
    }),
  },
}));

describe('workflow.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_URL = 'http://localhost:3001';
    process.env.INTERNAL_API_KEY = 'test-internal-key';
  });

  describe('createExecutionAndStart', () => {
    const workflowId = 'wf-1';
    const companyId = 'company-1';
    const startStepId = 'start-step';
    const firstStepId = 'first-step';

    beforeEach(() => {
      (prisma.workflow.findFirst as jest.Mock).mockResolvedValue({
        id: workflowId,
        default_status_id: null,
      });
      (prisma.workflowExecution.create as jest.Mock).mockResolvedValue({
        id: 'exec-new',
        created_by: 'user-1',
      });
      (prisma.workflowStep.findMany as jest.Mock).mockResolvedValue([
        { id: startStepId, step_type: 'start', config: {} },
        {
          id: firstStepId,
          step_type: 'edit_form',
          action_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: {},
        },
      ]);
      (prisma.workflowExecutionData.create as jest.Mock).mockResolvedValue({ id: 'data-1' });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: startStepId, target_step_id: firstStepId },
      ]);
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({ id: 'ex-step-first' });
      (prisma.workflowExecution.update as jest.Mock).mockResolvedValue({});
    });

    it('should not pre-create execution steps with createMany', async () => {
      const executionId = await workflowService.createExecutionAndStart(companyId, workflowId, {
        createdBy: 'user-1',
      });

      expect(executionId).toBe('exec-new');
      expect(prisma.workflowExecutionStep.createMany).not.toHaveBeenCalled();
    });

    it('should create the first reachable step as running', async () => {
      await workflowService.createExecutionAndStart(companyId, workflowId, {
        createdBy: 'user-1',
      });

      expect(prisma.workflowExecutionStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          execution_id: 'exec-new',
          step_id: firstStepId,
          status: 'running',
          company_id: companyId,
          started_at: expect.any(Date),
        }),
      });
      expect(prisma.workflowExecution.update).toHaveBeenCalledWith({
        where: { id: 'exec-new' },
        data: { status: 'running', current_step_id: firstStepId },
      });
    });
  });

  describe('getExecutionDataSnapshot', () => {
    it('should merge single row values into snapshot (value or raw)', async () => {
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        { values: { f1: { value: 'v1' }, f2: 'raw2' } },
      ]);
      const result = await workflowService.getExecutionDataSnapshot('exec-1');
      expect(result).toEqual({ f1: 'v1', f2: 'raw2' });
    });

    it('should merge multiple rows into one snapshot', async () => {
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        { values: { f1: { value: 'a' } } },
        { values: { f2: { value: 'b' } } },
      ]);
      const result = await workflowService.getExecutionDataSnapshot('exec-1');
      expect(result).toEqual({ f1: 'a', f2: 'b' });
    });

    it('should return empty object when no rows', async () => {
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([]);
      const result = await workflowService.getExecutionDataSnapshot('exec-1');
      expect(result).toEqual({});
    });
  });

  describe('advanceWorkflow', () => {
    const COMPLETING_EX_STEP = 'ex-step-completing';

    beforeEach(() => {
      (prisma.workflowStep.findMany as jest.Mock).mockResolvedValue([]);
    });

    function setupExecutionStepFindFirst(options: {
      completingWorkflowStepId: string;
      completingExecutionStepId?: string;
      lastTargetVisitStartedAt?: Date | null;
      hasPriorFinishedVisit?: boolean;
      existingRunning?: boolean;
      existingPending?: { id: string; external_token?: string } | null;
    }) {
      const {
        completingWorkflowStepId,
        completingExecutionStepId = COMPLETING_EX_STEP,
        lastTargetVisitStartedAt = null,
        hasPriorFinishedVisit = false,
        existingRunning = false,
        existingPending = null,
      } = options;

      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockImplementation((args: any) => {
        const where = args?.where ?? {};
        if (where.id === completingExecutionStepId && where.execution_id) {
          return Promise.resolve({
            step_id: completingWorkflowStepId,
            completed_at: new Date('2026-01-02T12:00:00Z'),
          });
        }
        if (where.execution_id && where.step_id && where.status === 'running') {
          return Promise.resolve(existingRunning ? { id: 'already-running' } : null);
        }
        if (where.execution_id && where.step_id && where.status?.in) {
          return Promise.resolve(hasPriorFinishedVisit ? { id: 'prior-finished' } : null);
        }
        if (where.execution_id && where.step_id && where.status === 'pending') {
          return Promise.resolve(existingPending);
        }
        if (where.execution_id && where.step_id && where.status === 'completed' && args.orderBy) {
          return Promise.resolve(
            lastTargetVisitStartedAt ? { started_at: lastTargetVisitStartedAt } : null
          );
        }
        return Promise.resolve(null);
      });
    }

    it('should throw when completing execution step not found', async () => {
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        workflowService.advanceWorkflow('exec-1', COMPLETING_EX_STEP, 'company-1')
      ).rejects.toThrow('Completing execution step not found');
    });

    it('should throw when step not found', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        workflowService.advanceWorkflow('exec-1', COMPLETING_EX_STEP, 'company-1')
      ).rejects.toThrow('Workflow step not found');
    });

    it('should filter by decisionChoice and fallback to default if no match', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce(null);
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'end-1', output_name: 'default' },
      ]);
      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1',
        'Approved'
      );
      expect(result).toEqual([]);
    });

    it('should use matchingConnections when decisionChoice matches output_name', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({ step_type: 'end' });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'end-1', output_name: 'Approved' },
        { source_step_id: 'step-1', target_step_id: 'other', output_name: 'Rejected' },
      ]);
      (prisma.workflowExecutionStep.count as jest.Mock).mockResolvedValue(0);
      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1',
        'Approved'
      );
      expect(result).toEqual([]);
      expect(prisma.workflowExecution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: 'completed', current_step_id: null }),
      });
    });

    it('should complete execution when target is end step and no other active steps', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({ step_type: 'end' });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'end-1' },
      ]);
      (prisma.workflowExecutionStep.count as jest.Mock).mockResolvedValue(0);

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1'
      );
      expect(result).toEqual([]);
      expect(prisma.workflowExecution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'completed',
          current_step_id: null,
        }),
      });
    });

    it('should create execution step and update execution on happy path (non-end, prerequisites met)', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: {},
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'step-2' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([
        { step_id: 'step-1' },
      ]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
      });

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1'
      );
      expect(result).toEqual(['step-2']);
      expect(prisma.workflowExecutionStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          execution_id: 'exec-1',
          step_id: 'step-2',
          status: 'running',
          company_id: 'company-1',
        }),
      });
      expect(prisma.workflowExecution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: { status: 'running', current_step_id: 'step-2' },
      });
    });

    it('should skip target step when prerequisites not met', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: {},
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'step-2' },
        { source_step_id: 'step-0', target_step_id: 'step-2' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([]);

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1'
      );
      expect(result).toEqual([]);
      expect(prisma.workflowExecutionStep.create).not.toHaveBeenCalled();
    });

    it('should skip creating step when target step is already running', async () => {
      setupExecutionStepFindFirst({
        completingWorkflowStepId: 'step-1',
        existingRunning: true,
      });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: {},
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'step-2' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([
        { step_id: 'step-1' },
      ]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });
      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1'
      );
      expect(result).toEqual([]);
      expect(prisma.workflowExecutionStep.create).not.toHaveBeenCalled();
    });

    it('should call triggerStepProcessing when target step is automatic action', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'action',
          action_type: 'automatic',
          decision_node_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: {},
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'step-2' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([
        { step_id: 'step-1' },
      ]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({
        id: 'ex-step-auto',
      });
      (fetch as unknown as jest.Mock).mockResolvedValue({ ok: true });

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1'
      );
      expect(result).toEqual(['step-2']);
      await new Promise((r) => setImmediate(r));
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/steps/ex-step-auto/process'),
        expect.any(Object)
      );
    });

    it('should call triggerStepProcessing when target step is email action', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'action',
          action_type: 'email',
          decision_node_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: {},
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'step-email-2' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([
        { step_id: 'step-1' },
      ]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({
        id: 'ex-step-email',
      });
      (fetch as unknown as jest.Mock).mockResolvedValue({ ok: true });

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1'
      );
      expect(result).toEqual(['step-email-2']);
      await new Promise((r) => setImmediate(r));
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/steps/ex-step-email/process'),
        expect.any(Object)
      );
    });

    it('should call triggerFileProcessing when target step is file type', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'file',
          action_type: null,
          decision_node_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: {},
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'step-file' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([
        { step_id: 'step-1' },
      ]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({
        id: 'ex-step-file',
      });
      (fetch as unknown as jest.Mock).mockResolvedValue({ ok: true });

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1'
      );
      expect(result).toEqual(['step-file']);
      await new Promise((r) => setImmediate(r));
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/process-file'),
        expect.any(Object)
      );
    });

    it('should assign step from user field when valid company user', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          decision_node_type: null,
          assigned_to_user_id: 'fallback-user',
          assigned_to_group_id: 'fallback-group',
          config: { assignment_source: 'field', assignment_source_field_id: 'assignee_field' },
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'step-2' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([{ step_id: 'step-1' }]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'creator-user',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        { values: { assignee_field: { value: 'user-from-field' } } },
      ]);
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({ user_id: 'user-from-field' });
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({ id: 'ex-step-field' });

      await workflowService.advanceWorkflow('exec-1', COMPLETING_EX_STEP, 'company-1');

      expect(prisma.workflowExecutionStep.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assigned_to_user_id: 'user-from-field',
            assigned_to_group_id: null,
          }),
        })
      );
    });

    it('should fallback to static assignee when user field is invalid', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          decision_node_type: null,
          assigned_to_user_id: 'fallback-user',
          assigned_to_group_id: 'fallback-group',
          config: { assignment_source: 'field', assignment_source_field_id: 'assignee_field' },
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'step-2' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([{ step_id: 'step-1' }]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'creator-user',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionData.findMany as jest.Mock).mockResolvedValue([
        { values: { assignee_field: { value: 'user-outside-company' } } },
      ]);
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({ id: 'ex-step-static-fallback' });

      await workflowService.advanceWorkflow('exec-1', COMPLETING_EX_STEP, 'company-1');

      expect(prisma.workflowExecutionStep.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assigned_to_user_id: 'fallback-user',
            assigned_to_group_id: 'fallback-group',
          }),
        })
      );
    });

    it('should set external_token when advancing to external edit_form step', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'step-1' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          decision_node_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: { allow_external_assignment: true, external_link_duration_minutes: 1440 },
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'step-external-form' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([{ step_id: 'step-1' }]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({ id: 'ex-step-external' });

      await workflowService.advanceWorkflow('exec-1', COMPLETING_EX_STEP, 'company-1');

      expect(prisma.workflowExecutionStep.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            external_token: expect.stringMatching(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            ),
            external_token_expires_at: expect.any(Date),
          }),
        })
      );
    });

    it('should complete execution after decision branch to end when unreached branch has no rows', async () => {
      setupExecutionStepFindFirst({ completingWorkflowStepId: 'decision-step' });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({ step_type: 'end' });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'decision-step', target_step_id: 'end-step', output_name: 'Yes' },
      ]);
      (prisma.workflowExecutionStep.count as jest.Mock).mockResolvedValue(0);

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1',
        'Yes'
      );

      expect(result).toEqual([]);
      expect(prisma.workflowExecutionStep.create).not.toHaveBeenCalled();
      expect(prisma.workflowExecution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: 'completed',
          current_step_id: null,
        }),
      });
      expect(prisma.workflowExecutionStep.count).toHaveBeenCalledWith({
        where: { execution_id: 'exec-1', status: 'running' },
      });
    });

    it('should preserve existing external_token when updating pending external edit_form step', async () => {
      setupExecutionStepFindFirst({
        completingWorkflowStepId: 'step-1',
        existingPending: {
          id: 'ex-step-pending',
          external_token: 'existing-token-uuid',
        },
      });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          decision_node_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: { allow_external_assignment: true },
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'step-external-form' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([{ step_id: 'step-1' }]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionStep.update as jest.Mock).mockResolvedValue({ id: 'ex-step-pending' });

      await workflowService.advanceWorkflow('exec-1', COMPLETING_EX_STEP, 'company-1');

      expect(prisma.workflowExecutionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            external_token: 'existing-token-uuid',
          }),
        })
      );
    });

    it('should create a new execution step row when looping back to a completed form step', async () => {
      setupExecutionStepFindFirst({
        completingWorkflowStepId: 'review-step',
        hasPriorFinishedVisit: true,
      });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: {},
        });
      (prisma.workflowStep.findMany as jest.Mock).mockResolvedValue([
        { id: 'review-step', step_type: 'decision' },
        { id: 'form-step', step_type: 'edit_form' },
      ]);
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'review-step', target_step_id: 'form-step' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([
        { step_id: 'review-step' },
      ]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({
        id: 'ex-step-form-visit-2',
      });

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1',
        'Reject'
      );

      expect(result).toEqual(['form-step']);
      expect(prisma.workflowExecutionStep.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          execution_id: 'exec-1',
          step_id: 'form-step',
          status: 'running',
        }),
      });
      expect(prisma.workflowExecutionStep.update).not.toHaveBeenCalled();
    });

    it('should loop back to form when decision rejects even if start also connects to form', async () => {
      setupExecutionStepFindFirst({
        completingWorkflowStepId: 'decision-step',
        hasPriorFinishedVisit: true,
        lastTargetVisitStartedAt: new Date('2026-01-01T10:00:00Z'),
      });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: {},
        });
      (prisma.workflowStep.findMany as jest.Mock).mockResolvedValue([
        { id: 'start-step', step_type: 'start' },
        { id: 'decision-step', step_type: 'decision' },
        { id: 'form-step', step_type: 'edit_form' },
      ]);
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'start-step', target_step_id: 'form-step' },
        { source_step_id: 'decision-step', target_step_id: 'form-step', output_name: 'No' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([
        { step_id: 'decision-step' },
      ]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({
        id: 'ex-step-form-visit-2',
      });

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1',
        'No'
      );

      expect(result).toEqual(['form-step']);
      expect(prisma.workflowExecutionStep.create).toHaveBeenCalled();
    });

    it('should not promote pending row when a completed visit already exists for the target step', async () => {
      setupExecutionStepFindFirst({
        completingWorkflowStepId: 'review-step',
        hasPriorFinishedVisit: true,
        existingPending: { id: 'stale-pending', external_token: 'stale-token' },
      });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: { allow_external_assignment: true },
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'review-step', target_step_id: 'form-step' },
      ]);
      (prisma.workflowStep.findMany as jest.Mock).mockResolvedValue([
        { id: 'review-step', step_type: 'decision' },
        { id: 'form-step', step_type: 'edit_form' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([
        { step_id: 'review-step' },
      ]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({
        id: 'ex-step-form-visit-2',
      });

      await workflowService.advanceWorkflow('exec-1', COMPLETING_EX_STEP, 'company-1', 'Reject');

      expect(prisma.workflowExecutionStep.create).toHaveBeenCalled();
      expect(prisma.workflowExecutionStep.update).not.toHaveBeenCalled();
    });

    it('should require fresh upstream completions for join steps on loop iterations', async () => {
      const mergeVisitStartedAt = new Date('2026-01-01T10:00:00Z');
      setupExecutionStepFindFirst({
        completingWorkflowStepId: 'step-a',
        lastTargetVisitStartedAt: mergeVisitStartedAt,
      });
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({
          step_type: 'edit_form',
          action_type: null,
          assigned_to_user_id: null,
          assigned_to_group_id: null,
          config: {},
        });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-a', target_step_id: 'merge-step' },
        { source_step_id: 'step-c', target_step_id: 'merge-step' },
      ]);
      (prisma.workflowStep.findMany as jest.Mock).mockResolvedValue([
        { id: 'step-a', step_type: 'edit_form' },
        { id: 'step-c', step_type: 'edit_form' },
        { id: 'merge-step', step_type: 'edit_form' },
      ]);
      (prisma.workflowExecutionStep.findMany as jest.Mock).mockResolvedValue([
        { step_id: 'step-a' },
      ]);
      (prisma.workflowExecution.findUnique as jest.Mock).mockResolvedValue({
        created_by: 'user-1',
        company_id: 'company-1',
      });

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        COMPLETING_EX_STEP,
        'company-1'
      );

      expect(result).toEqual([]);
      expect(prisma.workflowExecutionStep.create).not.toHaveBeenCalled();
      expect(prisma.workflowExecutionStep.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            step_id: { in: ['step-a', 'step-c'] },
            status: 'completed',
            completed_at: { gt: mergeVisitStartedAt },
          }),
        })
      );
    });
  });

  describe('handleStepActivation', () => {
    it('should skip assignment dispatch and not schedule reminders when notifications disabled', async () => {
      const triggerSpy = jest
        .spyOn(workflowService, 'triggerAssignmentNotification')
        .mockResolvedValue(undefined);
      (prisma.stepReminderJob.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.stepReminderJob.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      await workflowService.handleStepActivation(
        'exec-step-1',
        {
          step_type: 'edit_form',
          config: {
            notifications: {
              assignment: { enabled: false },
              reminder: { mode: 'schedule', schedule_minutes: [60, 180] },
            },
          },
        },
        'company-1'
      );

      expect(triggerSpy).not.toHaveBeenCalled();
      expect(prisma.stepReminderJob.deleteMany).toHaveBeenCalledWith({
        where: { execution_step_id: 'exec-step-1' },
      });
      expect(prisma.stepReminderJob.createMany).not.toHaveBeenCalled();
      triggerSpy.mockRestore();
    });

    it('should dispatch assignment and schedule repeating reminder with max count', async () => {
      const triggerSpy = jest
        .spyOn(workflowService, 'triggerAssignmentNotification')
        .mockResolvedValue(undefined);
      (prisma.stepReminderJob.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.stepReminderJob.create as jest.Mock).mockResolvedValue({ id: 'job-2' });

      await workflowService.handleStepActivation(
        'exec-step-2',
        {
          step_type: 'action',
          action_type: 'manual',
          config: {
            notifications: {
              assignment: { enabled: true },
              reminder: { mode: 'repeat', delay_minutes: 60, repeat_every_minutes: 240, max_count: 3 },
            },
          },
        },
        'company-1'
      );

      expect(triggerSpy).toHaveBeenCalledWith('exec-step-2');
      expect(prisma.stepReminderJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mode: 'repeat',
            repeat_every_minutes: 240,
            max_count: 3,
          }),
        })
      );
      triggerSpy.mockRestore();
    });
  });

  describe('triggerStepProcessing', () => {
    it('should POST to process endpoint with x-internal-api-key and body', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue({ ok: true });
      await workflowService.triggerStepProcessing('exec-1', 'ex-step-1');
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/workflows/executions/exec-1/steps/ex-step-1/process',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-api-key': 'test-internal-key',
          },
          body: JSON.stringify({
            execution_id: 'exec-1',
            execution_step_id: 'ex-step-1',
          }),
        }
      );
    });

    it('should not throw when fetch rejects', async () => {
      (fetch as unknown as jest.Mock).mockRejectedValue(new Error('Network error'));
      await expect(
        workflowService.triggerStepProcessing('exec-1', 'ex-step-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('triggerFileProcessing', () => {
    it('should POST to process-file endpoint with correct URL and body', async () => {
      (fetch as unknown as jest.Mock).mockResolvedValue({ ok: true });
      await workflowService.triggerFileProcessing(
        'exec-1',
        'ex-step-1',
        'wf-step-1'
      );
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/workflows/executions/exec-1/steps/ex-step-1/process-file',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-api-key': 'test-internal-key',
          },
          body: JSON.stringify({
            execution_id: 'exec-1',
            execution_step_id: 'ex-step-1',
            workflow_step_id: 'wf-step-1',
          }),
        }
      );
    });

    it('should not throw when fetch rejects', async () => {
      (fetch as unknown as jest.Mock).mockRejectedValue(new Error('Network error'));
      await expect(
        workflowService.triggerFileProcessing('exec-1', 'ex-step-1', 'wf-step-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('searchExecutionsByData', () => {
    const baseParams = {
      workflowId: 'wf-1',
      companyId: 'co-1',
      limit: 50,
      offset: 0,
      includeArchived: false,
    } as const;

    beforeEach(() => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { id: 'exec-1', total_count: '2' },
        { id: 'exec-2', total_count: '2' },
      ]);
    });

    it('returns ids and total from windowed COUNT(*) for a single scalar filter', async () => {
      const result = await workflowService.searchExecutionsByData({
        ...baseParams,
        filters: [{ kind: 'scalar', fieldId: '11111111-1111-1111-1111-111111111111', value: 1234 }],
      });

      expect(result).toEqual({ total: 2, executionIds: ['exec-1', 'exec-2'] });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('falls back to a separate COUNT query when the page is empty', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total_count: '7' }]);

      const result = await workflowService.searchExecutionsByData({
        ...baseParams,
        offset: 100,
        filters: [{ kind: 'scalar', fieldId: '11111111-1111-1111-1111-111111111111', value: 'x' }],
      });

      expect(result).toEqual({ total: 7, executionIds: [] });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('throws when a fieldId is not a valid UUID (defense-in-depth)', async () => {
      await expect(
        workflowService.searchExecutionsByData({
          ...baseParams,
          filters: [{ kind: 'scalar', fieldId: "'; DROP TABLE--", value: 1 }],
        })
      ).rejects.toThrow(/invalid field id/i);
    });

    it('throws when filters is empty (caller contract)', async () => {
      await expect(
        workflowService.searchExecutionsByData({ ...baseParams, filters: [] })
      ).rejects.toThrow(/at least one filter/i);
    });

    it('AND-joins multiple filter clauses into a single query', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'exec-1', total_count: '1' }]);

      const result = await workflowService.searchExecutionsByData({
        ...baseParams,
        filters: [
          { kind: 'scalar', fieldId: '11111111-1111-1111-1111-111111111111', value: 1234 },
          { kind: 'scalar', fieldId: '22222222-2222-2222-2222-222222222222', value: 'test' },
        ],
      });

      expect(result).toEqual({ total: 1, executionIds: ['exec-1'] });
      // Inspect the assembled Prisma.Sql passed to $queryRaw — both field UUIDs should appear.
      const calledWith = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
      const assembled = (calledWith.strings ?? []).join(' ') + JSON.stringify(calledWith.values ?? []);
      expect(assembled).toContain('11111111-1111-1111-1111-111111111111');
      expect(assembled).toContain('22222222-2222-2222-2222-222222222222');
    });
  });
});
