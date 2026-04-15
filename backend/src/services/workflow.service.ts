import { prisma } from '../lib/prisma';
import fetch from 'node-fetch';
import { notificationService } from './notification.service';
import { resolveStepNotificationSettings, stepReminderService } from './stepReminder.service';

type WorkflowStepRow = Awaited<ReturnType<typeof prisma.workflowStep.findMany>>[number];
type WorkflowConnectionRow = Awaited<ReturnType<typeof prisma.workflowConnection.findMany>>[number];

export const workflowService = {
  /**
   * Create a workflow execution and advance to the first step(s).
   * Used by both API trigger (external) and start-from-UI (internal).
   * @param companyId Company ID
   * @param workflowId Workflow ID
   * @param options data: optional execution payload; createdBy: user ID when started from UI, null for API
   * @returns execution ID
   */
  async createExecutionAndStart(
    companyId: string,
    workflowId: string,
    options: { data?: Record<string, unknown>; createdBy?: string | null } = {}
  ): Promise<string> {
    const { data = {}, createdBy = null } = options;

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, company_id: companyId },
      select: { id: true, default_status_id: true },
    });
    if (!workflow) {
      throw new Error('Workflow not found or access denied');
    }

    const execution = await prisma.workflowExecution.create({
      data: {
        workflow_id: workflowId,
        status: 'pending',
        started_at: new Date(),
        created_by: createdBy,
        company_id: companyId,
        execution_data: (data as object) || {},
      },
    });

    const workflowSteps = await prisma.workflowStep.findMany({
      where: { workflow_id: workflowId },
    });

    await prisma.workflowExecutionData.create({
      data: {
        execution_id: execution.id,
        company_id: companyId,
        values: {},
      },
    });

    const executionSteps = workflowSteps
      .filter((step: WorkflowStepRow) => step.step_type !== 'start' && step.step_type !== 'end')
      .map((step: WorkflowStepRow) => {
        const stepConfig = (step.config as Record<string, unknown>) || {};
        const hasExplicitAssignee = !!(step.assigned_to_user_id || step.assigned_to_group_id);
        const assignToCreator = stepConfig.assign_to_execution_creator === true
          ? true
          : stepConfig.assign_to_execution_creator === false
            ? false
            : !hasExplicitAssignee;
        return {
          execution_id: execution.id,
          step_id: step.id,
          status: 'pending' as const,
          assigned_to_user_id: assignToCreator ? execution.created_by : step.assigned_to_user_id,
          assigned_to_group_id: assignToCreator ? null : step.assigned_to_group_id,
          company_id: companyId,
        };
      });

    if (executionSteps.length > 0) {
      await prisma.workflowExecutionStep.createMany({
        data: executionSteps,
      });
    }

    const startStep = workflowSteps.find((s: WorkflowStepRow) => s.step_type === 'start');
    if (!startStep) {
      throw new Error('No start step found in workflow');
    }

    const startConnections = await prisma.workflowConnection.findMany({
      where: {
        workflow_id: workflowId,
        source_step_id: startStep.id,
      },
    });

    if (startConnections.length > 0) {
      const targetIds = [...new Set(startConnections.map((c: WorkflowConnectionRow) => c.target_step_id))];
      for (const targetId of targetIds) {
        const firstStep = workflowSteps.find((s: WorkflowStepRow) => s.id === targetId);
        if (firstStep && firstStep.step_type !== 'end') {
          const execStep = await prisma.workflowExecutionStep.findFirst({
            where: { execution_id: execution.id, step_id: firstStep.id },
            select: { id: true },
          });
          if (!execStep) continue;
          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: {
              status: 'running',
              current_step_id: firstStep.id,
            },
          });
          await prisma.workflowExecutionStep.updateMany({
            where: {
              execution_id: execution.id,
              step_id: firstStep.id,
            },
            data: {
              status: 'running',
              started_at: new Date(),
            },
          });
          this.handleStepActivation(execStep.id, firstStep, companyId).catch((err) => {
            console.error('Error handling step activation notifications/reminders:', err);
          });
          if (firstStep.step_type === 'action' && firstStep.action_type === 'automatic') {
            this.triggerStepProcessing(execution.id, execStep.id).catch((err) => {
              console.error('Error triggering step processing:', err);
            });
          } else if (firstStep.step_type === 'file') {
            this.triggerFileProcessing(execution.id, execStep.id, firstStep.id).catch((err) => {
              console.error('Error triggering file processing:', err);
            });
          }
        }
      }
    }

    return execution.id;
  },

  /**
   * Advance workflow to next step(s) after completing current step
   * @param executionId Execution ID
   * @param currentStepId Current workflow step ID
   * @param companyId Company ID
   * @param decisionChoice Optional decision choice for decision nodes
   */
  async advanceWorkflow(
    executionId: string,
    currentStepId: string,
    companyId: string,
    decisionChoice?: string
  ): Promise<string[]> {
    try {
      // Get workflow ID
      const step = await prisma.workflowStep.findUnique({
        where: { id: currentStepId },
        select: { workflow_id: true },
      });

      if (!step) {
        throw new Error('Workflow step not found');
      }

      // Get all connections for this workflow
      const connections = await prisma.workflowConnection.findMany({
        where: { workflow_id: step.workflow_id },
      });

      // Find outgoing connections from current step
      let outgoingConnections = connections.filter(
        (c: WorkflowConnectionRow) => c.source_step_id === currentStepId
      );

      // If decision choice is provided, filter by output name (case-insensitive)
      if (decisionChoice) {
        const choiceLower = decisionChoice.trim().toLowerCase();
        const matchingConnections = outgoingConnections.filter(
          (c: WorkflowConnectionRow) =>
            ((c.output_name ?? 'default') as string).trim().toLowerCase() === choiceLower
        );

        // Fallback to default if no match found
        if (matchingConnections.length === 0) {
          outgoingConnections = outgoingConnections.filter(
            (c: WorkflowConnectionRow) =>
              ((c.output_name ?? 'default') as string).trim().toLowerCase() === 'default'
          );
        } else {
          outgoingConnections = matchingConnections;
        }
      }

      const triggeredSteps: string[] = [];

      for (const connection of outgoingConnections) {
        const targetStepId = connection.target_step_id;

        // Check if target is an end step
        const targetStep = await prisma.workflowStep.findUnique({
          where: { id: targetStepId },
          select: {
            step_type: true,
            action_type: true,
            decision_node_type: true,
            assigned_to_user_id: true,
            assigned_to_group_id: true,
            config: true,
          },
        });

        if (!targetStep) continue;

        if (targetStep.step_type === 'end') {
          // Check if there are other active steps
          const activeSteps = await prisma.workflowExecutionStep.count({
            where: {
              execution_id: executionId,
              status: { in: ['running', 'pending'] },
            },
          });

          if (activeSteps === 0) {
            // Complete execution
            await prisma.workflowExecution.update({
              where: { id: executionId },
              data: {
                status: 'completed',
                current_step_id: null,
                completed_at: new Date(),
              },
            });
          }
          continue;
        }

        // Check prerequisites - all incoming connections must be completed
        const incomingConnections = connections.filter(
          (c: WorkflowConnectionRow) => c.target_step_id === targetStepId
        );
        const requiredSourceIds = incomingConnections.map((c: WorkflowConnectionRow) => c.source_step_id);

        const completedSourceSteps = await prisma.workflowExecutionStep.findMany({
          where: {
            execution_id: executionId,
            step_id: { in: requiredSourceIds },
            status: 'completed',
          },
          select: { step_id: true },
        });

        const completedStepIds = new Set(completedSourceSteps.map((s: { step_id: string }) => s.step_id));
        completedStepIds.add(currentStepId); // Current step is now complete

        const allPrerequisitesMet = requiredSourceIds.every((id: string) =>
          completedStepIds.has(id)
        );

        if (!allPrerequisitesMet) {
          continue; // Skip this step, prerequisites not met
        }

        // Get execution details for assignment
        const execution = await prisma.workflowExecution.findUnique({
          where: { id: executionId },
          select: { created_by: true, company_id: true },
        });

        if (!execution) continue;

        // Determine assignment
        const stepConfig = (targetStep.config as any) || {};
        const hasExplicitAssignee = !!(targetStep.assigned_to_user_id || targetStep.assigned_to_group_id);
        const assignToCreator = stepConfig.assign_to_execution_creator === true
          ? true
          : stepConfig.assign_to_execution_creator === false
            ? false
            : !hasExplicitAssignee;
        const assignedUserId = assignToCreator
          ? execution.created_by
          : targetStep.assigned_to_user_id;
        const assignedGroupId = assignToCreator
          ? null
          : targetStep.assigned_to_group_id;

        // Check if this step is already running
        const existingRunning = await prisma.workflowExecutionStep.findFirst({
          where: {
            execution_id: executionId,
            step_id: targetStepId,
            status: 'running',
          },
        });

        if (existingRunning) {
          console.log(`Step ${targetStepId} already running, skipping`);
          continue;
        }

        // Check if there's an existing pending execution step (pre-created at execution start)
        const existingPending = await prisma.workflowExecutionStep.findFirst({
          where: {
            execution_id: executionId,
            step_id: targetStepId,
            status: 'pending',
          },
        });

        let newExecutionStep;
        if (existingPending) {
          // Update the existing pending step to running
          newExecutionStep = await prisma.workflowExecutionStep.update({
            where: { id: existingPending.id },
            data: {
              status: 'running',
              started_at: new Date(),
              assigned_to_user_id: assignedUserId,
              assigned_to_group_id: assignedGroupId,
            },
          });
        } else {
          // Create a new execution step (fallback for steps not pre-created)
          newExecutionStep = await prisma.workflowExecutionStep.create({
            data: {
              execution_id: executionId,
              step_id: targetStepId,
              status: 'running',
              started_at: new Date(),
              company_id: companyId,
              assigned_to_user_id: assignedUserId,
              assigned_to_group_id: assignedGroupId,
            },
          });
        }

        triggeredSteps.push(targetStepId);

        // Update execution pointer
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'running',
            current_step_id: targetStepId,
          },
        });
        this.handleStepActivation(newExecutionStep.id, targetStep, companyId).catch((error) => {
          console.error('Error handling step activation notifications/reminders:', error);
        });

        // If automatic/agent step, trigger processing
        const isAutomaticAction =
          targetStep.step_type === 'action' && targetStep.action_type === 'automatic';
        const isAgentAction =
          targetStep.step_type === 'action' && targetStep.action_type === 'agent';
        const isAgentDecision =
          targetStep.step_type === 'decision' &&
          (targetStep.decision_node_type === 'Agent' || targetStep.decision_node_type === 'Agent_Human' ||
            (targetStep.decision_node_type &&
              targetStep.decision_node_type.toLowerCase() === 'agent'));

        if (isAutomaticAction || isAgentAction || isAgentDecision) {
          // Trigger step processing (can be async)
          this.triggerStepProcessing(executionId, newExecutionStep.id).catch(
            (error) => {
              console.error('Error triggering step processing:', error);
            }
          );
        } else if (targetStep.step_type === 'file') {
          // Trigger file step processing
          this.triggerFileProcessing(executionId, newExecutionStep.id, targetStepId).catch(
            (error) => {
              console.error('Error triggering file processing:', error);
            }
          );
        }
      }

      // Always check if workflow should complete when there are no active steps
      // (covers: last step led to end, no matching connection for decision, or no next steps)
      const activeSteps = await prisma.workflowExecutionStep.count({
        where: {
          execution_id: executionId,
          status: { in: ['running', 'pending'] },
        },
      });

      if (activeSteps === 0) {
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'completed',
            current_step_id: null,
            completed_at: new Date(),
          },
        });
      }

      return triggeredSteps;
    } catch (error) {
      console.error('Error advancing workflow:', error);
      throw error;
    }
  },

  /**
   * Trigger assignment notifications for a newly running step.
   */
  async triggerAssignmentNotification(executionStepId: string): Promise<void> {
    try {
      const result = await notificationService.dispatchAssignmentForExecutionStep(executionStepId);
      console.log('[workflow] assignment notification dispatched', {
        execution_step_id: executionStepId,
        found: result.found,
        recipients_total: result.recipients_total,
        recipients_emailed: result.recipients_emailed,
        message: result.message,
      });
    } catch (error) {
      console.error('Error dispatching assignment notification:', error);
    }
  },

  async handleStepActivation(
    executionStepId: string,
    step: {
      step_type?: string | null;
      action_type?: string | null;
      decision_node_type?: string | null;
      config?: unknown;
    },
    companyId: string
  ): Promise<void> {
    const settings = resolveStepNotificationSettings(step);

    if (settings.assignmentEnabled) {
      await this.triggerAssignmentNotification(executionStepId);
    }

    await stepReminderService.scheduleForExecutionStep(executionStepId, companyId, settings);
  },

  async cancelReminderForExecutionStep(executionStepId: string): Promise<void> {
    await stepReminderService.cancelForExecutionStep(executionStepId);
  },

  /**
   * Trigger step processing (internal call to own endpoint)
   * @param executionId Execution ID
   * @param executionStepId Execution step ID
   */
  async triggerStepProcessing(
    executionId: string,
    executionStepId: string
  ): Promise<void> {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const internalApiKey = process.env.INTERNAL_API_KEY || '';

    try {
      await fetch(
        `${backendUrl}/api/workflows/executions/${executionId}/steps/${executionStepId}/process`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-api-key': internalApiKey,
          },
          body: JSON.stringify({
            execution_id: executionId,
            execution_step_id: executionStepId,
          }),
        }
      );
    } catch (error) {
      console.error('Error calling step processing endpoint:', error);
      // Don't throw - let the trigger handle retries
    }
  },

  /**
   * Trigger file processing (internal call to own endpoint)
   * @param executionId Execution ID
   * @param executionStepId Execution step ID
   * @param workflowStepId Workflow step ID
   */
  async triggerFileProcessing(
    executionId: string,
    executionStepId: string,
    workflowStepId: string
  ): Promise<void> {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const internalApiKey = process.env.INTERNAL_API_KEY || '';

    try {
      await fetch(
        `${backendUrl}/api/workflows/executions/${executionId}/steps/${executionStepId}/process-file`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-api-key': internalApiKey,
          },
          body: JSON.stringify({
            execution_id: executionId,
            execution_step_id: executionStepId,
            workflow_step_id: workflowStepId,
          }),
        }
      );
    } catch (error) {
      console.error('Error calling file processing endpoint:', error);
      // Don't throw - let the trigger handle retries
    }
  },

  /**
   * Get execution data snapshot
   * @param executionId Execution ID
   */
  async getExecutionDataSnapshot(
    executionId: string
  ): Promise<Record<string, any>> {
    const executionDataRows = await prisma.workflowExecutionData.findMany({
      where: { execution_id: executionId },
      select: { values: true },
    });

    const snapshot: Record<string, any> = {};
    executionDataRows.forEach((row: any) => {
      const values = row.values || {};
      Object.entries(values).forEach(([fieldId, fieldData]: [string, any]) => {
        snapshot[fieldId] = fieldData?.value ?? fieldData;
      });
    });

    return snapshot;
  },
};
