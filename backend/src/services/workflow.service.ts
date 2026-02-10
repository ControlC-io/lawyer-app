import { prisma } from '../lib/prisma';
import fetch from 'node-fetch';

export const workflowService = {
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
        (c) => c.source_step_id === currentStepId
      );

      // If decision choice is provided, filter by output name
      if (decisionChoice) {
        const matchingConnections = outgoingConnections.filter(
          (c) => (c.output_name || 'default') === decisionChoice
        );

        // Fallback to default if no match found
        if (matchingConnections.length === 0) {
          outgoingConnections = outgoingConnections.filter(
            (c) => (c.output_name || 'default') === 'default'
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
          (c) => c.target_step_id === targetStepId
        );
        const requiredSourceIds = incomingConnections.map((c) => c.source_step_id);

        const completedSourceSteps = await prisma.workflowExecutionStep.findMany({
          where: {
            execution_id: executionId,
            step_id: { in: requiredSourceIds },
            status: 'completed',
          },
          select: { step_id: true },
        });

        const completedStepIds = new Set(completedSourceSteps.map((s) => s.step_id));
        completedStepIds.add(currentStepId); // Current step is now complete

        const allPrerequisitesMet = requiredSourceIds.every((id) =>
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
        const assignToCreator = stepConfig.assign_to_execution_creator !== false;
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

        // Create execution step
        const newExecutionStep = await prisma.workflowExecutionStep.create({
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

        triggeredSteps.push(targetStepId);

        // Update execution pointer
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'running',
            current_step_id: targetStepId,
          },
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

      // If no steps were triggered, check if workflow should complete
      if (triggeredSteps.length === 0) {
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
      }

      return triggeredSteps;
    } catch (error) {
      console.error('Error advancing workflow:', error);
      throw error;
    }
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
