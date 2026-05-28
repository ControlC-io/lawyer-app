import { resolveExternalLinkFieldsForStep } from '../lib/externalLinkExpiry';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import fetch from 'node-fetch';
import { notificationService } from './notification.service';
import { resolveStepNotificationSettings, stepReminderService } from './stepReminder.service';

// Caller-supplied filter values. `null` is intentionally excluded — `@ == null`
// evaluates to unknown under jsonpath, so a null filter would silently match nothing.
// Callers must reject null values before reaching this layer.
export type SearchFilterPrimitive = string | number | boolean;

export type ResolvedSearchFilter =
  | { kind: 'scalar'; fieldId: string; value: SearchFilterPrimitive }
  | { kind: 'array'; fieldId: string; children: { childId: string; value: SearchFilterPrimitive }[] };

export type SearchExecutionsParams = {
  workflowId: string;
  companyId: string;
  filters: ResolvedSearchFilter[];
  limit: number;
  offset: number;
  includeArchived: boolean;
};

export type SearchExecutionsResult = {
  total: number;
  executionIds: string[];
};

type WorkflowStepRow = Awaited<ReturnType<typeof prisma.workflowStep.findMany>>[number];
type WorkflowConnectionRow = Awaited<ReturnType<typeof prisma.workflowConnection.findMany>>[number];

function backEdgeKey(sourceStepId: string, targetStepId: string): string {
  return `${sourceStepId}->${targetStepId}`;
}

// Classify connections as forward or back-edges via DFS from start nodes.
// A back-edge points to a node currently on the DFS recursion stack — i.e.,
// it closes a cycle to an ancestor on the current traversal path. Without
// this, joins on a node that also has a loop-back incoming connection can
// never be satisfied on the first visit, since the loop source has not yet
// executed. Callers should pass `steps` and `connections` in a deterministic
// order (e.g. by created_at) so classification is stable across runs when a
// cycle could plausibly be opened from either side.
function computeBackEdges(
  steps: { id: string; step_type: string | null }[],
  connections: { source_step_id: string; target_step_id: string }[]
): Set<string> {
  const outgoing = new Map<string, string[]>();
  for (const conn of connections) {
    const list = outgoing.get(conn.source_step_id);
    if (list) list.push(conn.target_step_id);
    else outgoing.set(conn.source_step_id, [conn.target_step_id]);
  }

  const backEdges = new Set<string>();
  const visited = new Set<string>();
  const onStack = new Set<string>();

  function visit(root: string): void {
    if (visited.has(root)) return;
    const stack: { node: string; nextIdx: number }[] = [{ node: root, nextIdx: 0 }];
    visited.add(root);
    onStack.add(root);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const children = outgoing.get(frame.node) ?? [];
      if (frame.nextIdx >= children.length) {
        onStack.delete(frame.node);
        stack.pop();
        continue;
      }
      const child = children[frame.nextIdx++];
      if (onStack.has(child)) {
        backEdges.add(backEdgeKey(frame.node, child));
      } else if (!visited.has(child)) {
        visited.add(child);
        onStack.add(child);
        stack.push({ node: child, nextIdx: 0 });
      }
    }
  }

  for (const step of steps) {
    if (step.step_type === 'start') visit(step.id);
  }
  // Fallback: visit any nodes unreachable from a start step so we still
  // classify their back-edges if such an orphan subgraph exists.
  for (const step of steps) visit(step.id);

  return backEdges;
}

function extractUserIdFromFieldValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const objectValue = value as Record<string, unknown>;
  if (typeof objectValue.id === 'string' && objectValue.id.trim()) return objectValue.id.trim();
  if (typeof objectValue.user_id === 'string' && objectValue.user_id.trim()) return objectValue.user_id.trim();
  if (typeof objectValue.value === 'string' && objectValue.value.trim()) return objectValue.value.trim();
  return null;
}

async function resolveStepAssignment(params: {
  step: {
    config?: unknown;
    assigned_to_user_id?: string | null;
    assigned_to_group_id?: string | null;
  };
  executionCreatedBy: string | null;
  companyId: string;
  executionDataSnapshot?: Record<string, unknown>;
}): Promise<{ assignedUserId: string | null; assignedGroupId: string | null }> {
  const { step, executionCreatedBy, companyId, executionDataSnapshot = {} } = params;
  const stepConfig = (step.config as Record<string, unknown>) || {};
  const staticAssignedUserId = step.assigned_to_user_id || null;
  const staticAssignedGroupId = step.assigned_to_group_id || null;
  const assignmentSource = typeof stepConfig.assignment_source === 'string' ? stepConfig.assignment_source : null;

  if (assignmentSource === 'field') {
    const assignmentFieldId =
      typeof stepConfig.assignment_source_field_id === 'string'
        ? stepConfig.assignment_source_field_id.trim()
        : '';
    if (assignmentFieldId) {
      const candidateUserId = extractUserIdFromFieldValue(executionDataSnapshot[assignmentFieldId]);
      if (candidateUserId) {
        const member = await prisma.userCompany.findFirst({
          where: { company_id: companyId, user_id: candidateUserId },
          select: { user_id: true },
        });
        if (member) {
          return { assignedUserId: candidateUserId, assignedGroupId: null };
        }
      }
    }
    return {
      assignedUserId: staticAssignedUserId,
      assignedGroupId: staticAssignedGroupId,
    };
  }

  if (assignmentSource === 'static') {
    return {
      assignedUserId: staticAssignedUserId,
      assignedGroupId: staticAssignedGroupId,
    };
  }

  if (assignmentSource === 'creator') {
    return {
      assignedUserId: executionCreatedBy,
      assignedGroupId: null,
    };
  }

  const hasExplicitAssignee = !!(staticAssignedUserId || staticAssignedGroupId);
  const assignToCreator = stepConfig.assign_to_execution_creator === true
    ? true
    : stepConfig.assign_to_execution_creator === false
      ? false
      : !hasExplicitAssignee;

  return {
    assignedUserId: assignToCreator ? executionCreatedBy : staticAssignedUserId,
    assignedGroupId: assignToCreator ? null : staticAssignedGroupId,
  };
}

function resolveExternalTokenForStep(
  step: { step_type?: string | null; config?: unknown },
  existing?: {
    external_token?: string | null;
    external_token_expires_at?: Date | null;
    started_at?: Date | null;
  }
): { external_token?: string; external_token_expires_at?: Date | null } {
  return resolveExternalLinkFieldsForStep(step, existing);
}

type StepForOpen = {
  step_type?: string | null;
  action_type?: string | null;
  decision_node_type?: string | null;
  assigned_to_user_id?: string | null;
  assigned_to_group_id?: string | null;
  config?: unknown;
};

function countActiveExecutionStepsWhere(executionId: string) {
  return {
    execution_id: executionId,
    status: 'running' as const,
  };
}

function triggerProcessingForOpenedStep(
  service: typeof workflowService,
  executionId: string,
  executionStepId: string,
  targetStepId: string,
  targetStep: StepForOpen
): void {
  const isAutomaticAction =
    targetStep.step_type === 'action' && targetStep.action_type === 'automatic';
  const isAgentAction = targetStep.step_type === 'action' && targetStep.action_type === 'agent';
  const isEmailAction = targetStep.step_type === 'action' && targetStep.action_type === 'email';
  const isAgentDecision =
    targetStep.step_type === 'decision' &&
    (targetStep.decision_node_type === 'Agent' ||
      targetStep.decision_node_type === 'Agent_Human' ||
      (targetStep.decision_node_type &&
        targetStep.decision_node_type.toLowerCase() === 'agent'));

  if (isAutomaticAction || isAgentAction || isEmailAction || isAgentDecision) {
    service.triggerStepProcessing(executionId, executionStepId).catch((error) => {
      console.error('Error triggering step processing:', error);
    });
  } else if (targetStep.step_type === 'file') {
    service.triggerFileProcessing(executionId, executionStepId, targetStepId).catch((error) => {
      console.error('Error triggering file processing:', error);
    });
  }
}

/**
 * Create or promote a workflow execution step when the execution reaches that workflow step.
 * Returns the execution step id when opened, or null when already running.
 */
async function openExecutionStep(
  service: typeof workflowService,
  params: {
    executionId: string;
    targetStepId: string;
    targetStep: StepForOpen;
    companyId: string;
    executionCreatedBy: string | null;
    executionDataSnapshot?: Record<string, unknown>;
  }
): Promise<string | null> {
  const {
    executionId,
    targetStepId,
    targetStep,
    companyId,
    executionCreatedBy,
    executionDataSnapshot = {},
  } = params;

  const existingRunning = await prisma.workflowExecutionStep.findFirst({
    where: {
      execution_id: executionId,
      step_id: targetStepId,
      status: 'running',
    },
    select: { id: true },
  });

  if (existingRunning) {
    console.log(`Step ${targetStepId} already running, skipping`);
    return null;
  }

  const assignment = await resolveStepAssignment({
    step: targetStep,
    executionCreatedBy,
    companyId,
    executionDataSnapshot,
  });

  const priorFinishedVisit = await prisma.workflowExecutionStep.findFirst({
    where: {
      execution_id: executionId,
      step_id: targetStepId,
      status: { in: ['completed', 'failed'] },
    },
    select: { id: true },
  });
  const shouldCreateFreshInstance = !!priorFinishedVisit;

  let existingPending: Awaited<
    ReturnType<typeof prisma.workflowExecutionStep.findFirst>
  > = null;
  if (!shouldCreateFreshInstance) {
    existingPending = await prisma.workflowExecutionStep.findFirst({
      where: {
        execution_id: executionId,
        step_id: targetStepId,
        status: 'pending',
      },
    });
  }

  const externalLinkFields = resolveExternalTokenForStep(
    targetStep,
    shouldCreateFreshInstance
      ? undefined
      : {
          external_token: existingPending?.external_token,
          external_token_expires_at: existingPending?.external_token_expires_at,
          started_at: existingPending?.started_at,
        }
  );

  const openData = {
    status: 'running' as const,
    started_at: new Date(),
    assigned_to_user_id: assignment.assignedUserId,
    assigned_to_group_id: assignment.assignedGroupId,
    ...externalLinkFields,
  };

  const executionStep =
    !shouldCreateFreshInstance && existingPending
      ? await prisma.workflowExecutionStep.update({
          where: { id: existingPending.id },
          data: openData,
        })
      : await prisma.workflowExecutionStep.create({
          data: {
            execution_id: executionId,
            step_id: targetStepId,
            company_id: companyId,
            ...openData,
          },
        });

  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: 'running',
      current_step_id: targetStepId,
    },
  });

  service.handleStepActivation(executionStep.id, targetStep, companyId).catch((error) => {
    console.error('Error handling step activation notifications/reminders:', error);
  });

  triggerProcessingForOpenedStep(service, executionId, executionStep.id, targetStepId, targetStep);

  return executionStep.id;
}

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
      where: { id: workflowId, company_id: companyId, is_archived: false },
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
          await openExecutionStep(this, {
            executionId: execution.id,
            targetStepId: firstStep.id,
            targetStep: firstStep,
            companyId,
            executionCreatedBy: execution.created_by,
            executionDataSnapshot: {},
          });
        }
      }
    }

    return execution.id;
  },

  /**
   * Advance workflow to next step(s) after completing current step
   * @param executionId Execution ID
   * @param completingExecutionStepId Execution step instance ID that was just completed
   * @param companyId Company ID
   * @param decisionChoice Optional decision choice for decision nodes
   */
  async advanceWorkflow(
    executionId: string,
    completingExecutionStepId: string,
    companyId: string,
    decisionChoice?: string
  ): Promise<string[]> {
    try {
      const completingExecutionStep = await prisma.workflowExecutionStep.findFirst({
        where: {
          id: completingExecutionStepId,
          execution_id: executionId,
        },
        select: {
          step_id: true,
          completed_at: true,
        },
      });

      if (!completingExecutionStep) {
        throw new Error('Completing execution step not found');
      }

      const currentStepId = completingExecutionStep.step_id;

      // Get workflow ID
      const step = await prisma.workflowStep.findUnique({
        where: { id: currentStepId },
        select: { workflow_id: true },
      });

      if (!step) {
        throw new Error('Workflow step not found');
      }

      // Get all connections for this workflow. Order matters: computeBackEdges
      // traverses children in the order they appear here, so for cycles that
      // could be opened from either side (e.g. a diamond+loop), classification
      // is deterministic and aligns with the order edges were authored.
      const connections = await prisma.workflowConnection.findMany({
        where: { workflow_id: step.workflow_id },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });

      const workflowSteps = (await prisma.workflowStep.findMany({
        where: { workflow_id: step.workflow_id },
        select: { id: true, step_type: true },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      })) ?? [];
      const startStepIds = new Set(
        workflowSteps
          .filter((workflowStep) => workflowStep.step_type === 'start')
          .map((workflowStep) => workflowStep.id)
      );
      const backEdges = computeBackEdges(workflowSteps, connections);

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
      let executionDataSnapshot: Record<string, unknown> | null = null;

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
          const activeSteps = await prisma.workflowExecutionStep.count({
            where: countActiveExecutionStepsWhere(executionId),
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

        // Arriving via a back-edge is a loop-iteration trigger; the join
        // check does not apply because the forward predecessors of the loop
        // entry already fired in earlier iterations.
        const arrivingViaBackEdge = backEdges.has(backEdgeKey(currentStepId, targetStepId));

        if (!arrivingViaBackEdge) {
          // Check prerequisites - all incoming forward connections must be completed
          const incomingConnections = connections.filter(
            (c: WorkflowConnectionRow) => c.target_step_id === targetStepId
          );
          const requiredSourceIds = incomingConnections.map((c: WorkflowConnectionRow) => c.source_step_id);

          const lastTargetVisit = await prisma.workflowExecutionStep.findFirst({
            where: {
              execution_id: executionId,
              step_id: targetStepId,
              status: 'completed',
            },
            orderBy: { completed_at: 'desc' },
            select: { started_at: true },
          });
          const prerequisiteCutoff = lastTargetVisit?.started_at ?? new Date(0);

          const completedSourceSteps = await prisma.workflowExecutionStep.findMany({
            where: {
              execution_id: executionId,
              step_id: { in: requiredSourceIds },
              status: 'completed',
              completed_at: { gt: prerequisiteCutoff },
            },
            select: { step_id: true },
          });

          const satisfiedSourceIds = new Set(
            completedSourceSteps.map((s: { step_id: string }) => s.step_id)
          );
          satisfiedSourceIds.add(currentStepId);

          // Exclude start nodes (no execution-step rows) and back-edges
          // (loop-back triggers, not forward prerequisites) from the join check.
          const joinRequiredSourceIds = requiredSourceIds.filter(
            (sourceStepId: string) =>
              !startStepIds.has(sourceStepId) &&
              !backEdges.has(backEdgeKey(sourceStepId, targetStepId))
          );

          const allPrerequisitesMet = joinRequiredSourceIds.every((id: string) =>
            satisfiedSourceIds.has(id)
          );

          if (!allPrerequisitesMet) {
            continue; // Skip this step, prerequisites not met
          }
        }

        // Get execution details for assignment
        const execution = await prisma.workflowExecution.findUnique({
          where: { id: executionId },
          select: { created_by: true, company_id: true },
        });

        if (!execution) continue;

        const targetStepConfig = (targetStep.config as Record<string, unknown>) || {};
        if (targetStepConfig.assignment_source === 'field' && executionDataSnapshot === null) {
          executionDataSnapshot = await this.getExecutionDataSnapshot(executionId);
        }

        const opened = await openExecutionStep(this, {
          executionId,
          targetStepId,
          targetStep,
          companyId,
          executionCreatedBy: execution.created_by,
          executionDataSnapshot: executionDataSnapshot || {},
        });

        if (opened) {
          triggeredSteps.push(targetStepId);
        }
      }

      // Always check if workflow should complete when there are no active steps
      // (covers: last step led to end, no matching connection for decision, or no next steps)
      const activeSteps = await prisma.workflowExecutionStep.count({
        where: countActiveExecutionStepsWhere(executionId),
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

  async searchExecutionsByData(params: SearchExecutionsParams): Promise<SearchExecutionsResult> {
    const { workflowId, companyId, filters, limit, offset, includeArchived } = params;

    if (filters.length === 0) {
      throw new Error('searchExecutionsByData requires at least one filter');
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const assertUuid = (id: string) => {
      if (!uuidPattern.test(id)) {
        throw new Error(`invalid field id: ${JSON.stringify(id)}`);
      }
    };

    // Build one EXISTS clause per filter. Field UUIDs are spliced into JSONPath text
    // (validated above); caller-supplied values are bound through `vars::jsonb` so
    // there is no path where caller input becomes JSONPath syntax.
    //
    // Lax mode (the default) is intentional for the array iteration: when an item in
    // the array lacks one of the queried child fields, lax mode treats the missing
    // field as an empty sequence and that item is simply filtered out of the match.
    // Strict mode would raise a structural error and fail the row entirely, which
    // makes filters brittle against schema drift across heterogeneous executions.
    const filterClauses: Prisma.Sql[] = filters.map((filter) => {
      if (filter.kind === 'scalar') {
        assertUuid(filter.fieldId);
        const path = `$."${filter.fieldId}".value ? (@ == $v)`;
        const vars = JSON.stringify({ v: filter.value });
        return Prisma.sql`
          jsonb_path_exists(
            d.values,
            ${path}::jsonpath,
            ${vars}::jsonb
          )
        `;
      }

      assertUuid(filter.fieldId);
      if (filter.children.length === 0) {
        throw new Error('array filter requires at least one child predicate');
      }

      const childExprs: string[] = [];
      const varsObj: Record<string, SearchFilterPrimitive> = {};
      filter.children.forEach((child, idx) => {
        assertUuid(child.childId);
        const varName = `v${idx}`;
        childExprs.push(`@."${child.childId}" == $${varName}`);
        varsObj[varName] = child.value;
      });
      const path = `$."${filter.fieldId}".value[*] ? (${childExprs.join(' && ')})`;
      const vars = JSON.stringify(varsObj);
      return Prisma.sql`
        jsonb_path_exists(
          d.values,
          ${path}::jsonpath,
          ${vars}::jsonb
        )
      `;
    });

    const existsAnd = Prisma.join(filterClauses, ' AND ');

    const archivedClause = includeArchived
      ? Prisma.empty
      : Prisma.sql`AND e.is_archived = false`;

    const rows = await prisma.$queryRaw<Array<{ id: string; total_count: string | number | bigint }>>(Prisma.sql`
      SELECT e.id, COUNT(*) OVER() AS total_count
      FROM workflow_executions e
      WHERE e.workflow_id = ${workflowId}::uuid
        AND e.company_id = ${companyId}::uuid
        ${archivedClause}
        AND EXISTS (
          SELECT 1 FROM workflow_execution_data d
          WHERE d.execution_id = e.id
            AND ${existsAnd}
        )
      ORDER BY e.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    if (rows.length > 0) {
      return {
        total: Number(rows[0].total_count),
        executionIds: rows.map((r) => r.id),
      };
    }

    // Empty page — issue a separate COUNT so the caller can distinguish "past end" from "no matches".
    const countRows = await prisma.$queryRaw<Array<{ total_count: string | number | bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS total_count
      FROM workflow_executions e
      WHERE e.workflow_id = ${workflowId}::uuid
        AND e.company_id = ${companyId}::uuid
        ${archivedClause}
        AND EXISTS (
          SELECT 1 FROM workflow_execution_data d
          WHERE d.execution_id = e.id
            AND ${existsAnd}
        )
    `);

    return {
      total: Number(countRows[0]?.total_count ?? 0),
      executionIds: [],
    };
  },
};
