import { workflowService } from '../services/workflow.service';
import { prisma } from '../lib/prisma';
import fetch from 'node-fetch';

jest.mock('../lib/prisma', () => ({
  prisma: {
    workflowStep: { findUnique: jest.fn() },
    workflowConnection: { findMany: jest.fn() },
    workflowExecutionStep: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    workflowExecution: { findUnique: jest.fn(), update: jest.fn() },
    workflowExecutionData: { findMany: jest.fn() },
  },
}));

jest.mock('node-fetch');

describe('workflow.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_URL = 'http://localhost:3001';
    process.env.INTERNAL_API_KEY = 'test-internal-key';
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
    it('should throw when step not found', async () => {
      (prisma.workflowStep.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        workflowService.advanceWorkflow('exec-1', 'step-1', 'company-1')
      ).rejects.toThrow('Workflow step not found');
    });

    it('should filter by decisionChoice and fallback to default if no match', async () => {
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce(null);
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'end-1', output_name: 'default' },
      ]);
      const result = await workflowService.advanceWorkflow(
        'exec-1',
        'step-1',
        'company-1',
        'Approved'
      );
      expect(result).toEqual([]);
    });

    it('should use matchingConnections when decisionChoice matches output_name', async () => {
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
        'step-1',
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
      (prisma.workflowStep.findUnique as jest.Mock)
        .mockResolvedValueOnce({ workflow_id: 'wf-1' })
        .mockResolvedValueOnce({ step_type: 'end' });
      (prisma.workflowConnection.findMany as jest.Mock).mockResolvedValue([
        { source_step_id: 'step-1', target_step_id: 'end-1' },
      ]);
      (prisma.workflowExecutionStep.count as jest.Mock).mockResolvedValue(0);

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        'step-1',
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
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({
        id: 'ex-step-1',
      });

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        'step-1',
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
        'step-1',
        'company-1'
      );
      expect(result).toEqual([]);
      expect(prisma.workflowExecutionStep.create).not.toHaveBeenCalled();
    });

    it('should skip creating step when target step is already running', async () => {
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
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue({
        id: 'already-running',
      });
      const result = await workflowService.advanceWorkflow(
        'exec-1',
        'step-1',
        'company-1'
      );
      expect(result).toEqual([]);
      expect(prisma.workflowExecutionStep.create).not.toHaveBeenCalled();
    });

    it('should call triggerStepProcessing when target step is automatic action', async () => {
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
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({
        id: 'ex-step-auto',
      });
      (fetch as unknown as jest.Mock).mockResolvedValue({ ok: true });

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        'step-1',
        'company-1'
      );
      expect(result).toEqual(['step-2']);
      await new Promise((r) => setImmediate(r));
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/steps/ex-step-auto/process'),
        expect.any(Object)
      );
    });

    it('should call triggerFileProcessing when target step is file type', async () => {
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
      (prisma.workflowExecutionStep.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.workflowExecutionStep.create as jest.Mock).mockResolvedValue({
        id: 'ex-step-file',
      });
      (fetch as unknown as jest.Mock).mockResolvedValue({ ok: true });

      const result = await workflowService.advanceWorkflow(
        'exec-1',
        'step-1',
        'company-1'
      );
      expect(result).toEqual(['step-file']);
      await new Promise((r) => setImmediate(r));
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/process-file'),
        expect.any(Object)
      );
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
});
