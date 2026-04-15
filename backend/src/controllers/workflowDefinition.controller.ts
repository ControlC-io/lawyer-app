import { Response } from 'express';
import { AuthRequest, ALL_COMPANIES, companyFilter } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';
import { ExecutionStatus } from '@prisma/client';

async function ensureCompanyAccess(req: AuthRequest, companyId: string, requireAdmin = false) {
  if (req.company && !req.user) {
    if (req.company.id !== companyId) {
      return { error: { status: 403, body: { error: 'Forbidden', details: 'API key is not valid for this company' } } };
    }
    return { userCompany: { role: 'company_admin' as const } };
  }

  const userId = req.user?.id;
  if (!userId) {
    return { error: { status: 401, body: { error: 'Unauthorized', details: 'Authentication required' } } };
  }
  // Super admin API key or JWT super_admin can access any company (including 'all')
  if (req.user?.super_admin) {
    return {};
  }
  if (companyId === ALL_COMPANIES) {
    return { error: { status: 403, body: { error: 'Forbidden', details: 'companyId=all is reserved for super admin' } } };
  }
  const userCompany = await prisma.userCompany.findFirst({
    where: { user_id: userId, company_id: companyId },
  });
  if (!userCompany) {
    return { error: { status: 403, body: { error: 'Forbidden', details: 'You do not have access to this company' } } };
  }
  if (requireAdmin && userCompany.role !== 'company_admin') {
    return { error: { status: 403, body: { error: 'Forbidden', details: 'Company admin role required' } } };
  }
  return { userCompany };
}

type WorkflowPermissionType = 'visibility' | 'start';

async function getUserGroupIds(userId: string): Promise<string[]> {
  if (!prisma.profileGroupMember || typeof prisma.profileGroupMember.findMany !== 'function') {
    return [];
  }

  const groups = await prisma.profileGroupMember.findMany({
    where: { profile_id: userId },
    select: { group_id: true },
  });

  return groups.map((g) => g.group_id).filter((id): id is string => id !== null);
}

function getPermissionTypeFallbacks(type: WorkflowPermissionType): string[] {
  if (type === 'visibility') return ['visibility', 'view'];
  return ['start', 'execute'];
}

function normalizeWorkflowPermissionType(rawType: unknown): string {
  if (typeof rawType !== 'string') return 'view';
  const type = rawType.trim().toLowerCase();
  if (type === 'visibility') return 'visibility';
  if (type === 'start') return 'start';
  if (type === 'execute') return 'execute';
  if (type === 'view') return 'view';
  return 'view';
}

function legacyWorkflowPermissionType(type: string): string {
  if (type === 'visibility') return 'view';
  if (type === 'start') return 'execute';
  return type;
}

type ReminderMode = 'none' | 'repeat' | 'schedule';
type NormalizedStepNotifications = {
  assignment: { enabled: boolean };
  reminder: {
    mode: ReminderMode;
    delay_minutes: number;
    repeat_every_minutes?: number;
    max_count?: number;
    schedule_minutes: number[];
  };
};

function parsePositiveInteger(value: unknown, fallbackValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : fallbackValue;
}

function stepSupportsNotifications(stepType: string, actionType: string, decisionNodeType: string): boolean {
  if (stepType === 'edit_form') return true;
  if (stepType === 'action') return actionType === 'manual';
  if (stepType === 'decision') return ['Human', 'Agent_Human', 'Agent + Human'].includes(decisionNodeType);
  return false;
}

function normalizeStepNotifications(input: unknown): {
  value?: NormalizedStepNotifications;
  error?: string;
} {
  if (input === null || input === undefined) {
    return {
      value: {
        assignment: { enabled: true },
        reminder: {
          mode: 'none',
          delay_minutes: 24 * 60,
          repeat_every_minutes: 24 * 60,
          max_count: undefined,
          schedule_minutes: [24 * 60],
        },
      },
    };
  }

  if (typeof input !== 'object') {
    return { error: 'notifications must be an object' };
  }

  const source = input as Record<string, any>;
  const assignmentInput =
    source.assignment && typeof source.assignment === 'object' ? source.assignment : {};
  const reminderInput =
    source.reminder && typeof source.reminder === 'object' ? source.reminder : {};

  const rawMode =
    typeof reminderInput.mode === 'string' ? reminderInput.mode.trim().toLowerCase() : 'none';
  if (!['none', 'repeat', 'schedule', 'once'].includes(rawMode)) {
    return { error: 'notifications.reminder.mode must be one of: none, repeat, schedule' };
  }
  const normalizedMode: ReminderMode = rawMode === 'repeat' ? 'repeat' : rawMode === 'schedule' || rawMode === 'once' ? 'schedule' : 'none';

  const delayMinutes = parsePositiveInteger(reminderInput.delay_minutes, 24 * 60);
  const repeatEveryMinutes = parsePositiveInteger(reminderInput.repeat_every_minutes, 24 * 60);
  const maxCount =
    reminderInput.max_count === null || reminderInput.max_count === undefined
      ? undefined
      : parsePositiveInteger(reminderInput.max_count, 1);
  const scheduleMinutesRaw = Array.isArray(reminderInput.schedule_minutes)
    ? reminderInput.schedule_minutes
    : reminderInput.delay_minutes
      ? [reminderInput.delay_minutes]
      : [];
  const scheduleMinutes = scheduleMinutesRaw
    .map((entry: unknown) => Number(entry))
    .filter((entry: number) => Number.isFinite(entry) && entry > 0)
    .map((entry: number) => Math.round(entry))
    .sort((a: number, b: number) => a - b)
    .filter((entry: number, index: number, arr: number[]) => index === 0 || entry !== arr[index - 1]);

  if (normalizedMode === 'schedule' && scheduleMinutes.length === 0) {
    return { error: 'notifications.reminder.schedule_minutes must contain at least one positive delay' };
  }

  return {
    value: {
      assignment: { enabled: assignmentInput.enabled !== false },
      reminder: {
        mode: normalizedMode,
        delay_minutes: normalizedMode === 'repeat' ? delayMinutes : 24 * 60,
        repeat_every_minutes: normalizedMode === 'repeat' ? repeatEveryMinutes : undefined,
        max_count: normalizedMode === 'repeat' ? maxCount : undefined,
        schedule_minutes: normalizedMode === 'schedule' ? scheduleMinutes : [24 * 60],
      },
    },
  };
}

function normalizeStepExplanation(input: unknown): string | undefined {
  if (input === null || input === undefined) return undefined;

  const raw = typeof input === 'string' ? input : String(input);
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Consider rich-text editor fillers as empty content.
  const plainText = trimmed
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plainText) return undefined;
  return trimmed;
}

export const workflowDefinitionController = {
  /** GET /api/companies/:companyId/workflows - list workflows user has permission to execute */
  async listWorkflows(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const rawCategoryId = req.query.categoryId as string | undefined;
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID', details: 'companyId is required' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const userId = req.user?.id ?? '';
      const userGroupIds = userId ? await getUserGroupIds(userId) : [];

      // Build the base where clause
      const baseWhere: { company_id?: string; category_id?: string | null } = { ...companyFilter(companyId) };
      if (rawCategoryId !== undefined) {
        baseWhere.category_id = (rawCategoryId === '' || rawCategoryId === 'null') ? null : rawCategoryId;
      }

      const isPrivileged = req.user?.super_admin === true || (!!req.company && !req.user);
      const visibilityTypes = getPermissionTypeFallbacks('visibility');
      const workflows = await prisma.workflow.findMany({
        where: {
          ...baseWhere,
          ...(isPrivileged ? {} : {
            OR: [
              { visibility_scope: 'all_company' },
              { is_public: true },
              { permissions: { some: { user_id: userId, permission_type: { in: visibilityTypes } } } },
              ...(userGroupIds.length > 0
                ? [{ permissions: { some: { group_id: { in: userGroupIds }, permission_type: { in: visibilityTypes } } } }]
                : []),
            ],
          }),
        },
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { steps: true } },
        },
      });

      const list = workflows.map((w) => ({
        ...w,
        step_count: w._count.steps,
        _count: undefined,
      }));

      return res.json(list);
    } catch (error) {
      console.error('listWorkflows error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** GET /api/companies/:companyId/workflows/:workflowId - get one workflow with steps, connections, statuses */
  async getWorkflow(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId } = req.params;
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, ...companyFilter(companyId) },
        include: {
          steps: { orderBy: [{ position_x: 'asc' }, { position_y: 'asc' }] },
          connections: true,
          statuses: { orderBy: { order: 'asc' } },
          category: true,
          permissions: true,
        },
      });

      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found', details: 'Workflow not found or access denied' });
      }

      return res.json(workflow);
    } catch (error) {
      console.error('getWorkflow error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** POST /api/companies/:companyId/workflows/:workflowId/start - start execution from UI (only is_active is checked, not api_enabled) */
  async startWorkflow(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId } = req.params;
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, company_id: companyId },
        select: { id: true, is_active: true, is_public: true, start_permission_scope: true },
      });
      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found or access denied' });
      }
      if (workflow.is_active === false) {
        return res.status(403).json({
          error: 'Workflow is not active',
          details: 'This workflow cannot be started because it is inactive',
        });
      }

      const startPermissionTypes = getPermissionTypeFallbacks('start');
      const canStartByScope = workflow.start_permission_scope === 'public' || workflow.is_public === true;
      const supportsWorkflowPermissions = !!(
        prisma.workflowPermission &&
        typeof prisma.workflowPermission.findFirst === 'function'
      );

      if (!canStartByScope && supportsWorkflowPermissions) {
        const userGroupIds = await getUserGroupIds(userId);
        const explicitStartPermission = await prisma.workflowPermission.findFirst({
          where: {
            workflow_id: workflowId,
            permission_type: { in: startPermissionTypes },
            OR: [
              { user_id: userId },
              ...(userGroupIds.length > 0 ? [{ group_id: { in: userGroupIds } }] : []),
            ],
          },
          select: { id: true },
        });

        if (!explicitStartPermission) {
          return res.status(403).json({
            error: 'Forbidden',
            details: 'You do not have permission to start this workflow',
          });
        }
      }

      const executionId = await workflowService.createExecutionAndStart(companyId, workflowId, {
        data: {},
        createdBy: userId,
      });

      return res.json({
        success: true,
        execution_id: executionId,
        status: 'started',
      });
    } catch (error) {
      console.error('startWorkflow error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },

  /** POST /api/companies/:companyId/workflows - create workflow */
  async createWorkflow(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const body = req.body || {};
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const workflow = await prisma.workflow.create({
        data: {
          company_id: companyId,
          name: typeof body.name === 'string' ? body.name.trim() : 'New Workflow',
          description: typeof body.description === 'string' ? body.description : null,
          is_public: !!body.is_public,
          visibility_scope: body.visibility_scope === 'specific' ? 'specific' : 'all_company',
          start_permission_scope: body.start_permission_scope === 'specific' ? 'specific' : 'public',
          api_enabled: !!body.api_enabled,
          file_enabled: !!body.file_enabled,
          is_active: body.is_active !== false,
          category_id: body.category_id || null,
          icon: body.icon || null,
          data_structure: body.data_structure ?? [],
          canvas_comments: body.canvas_comments ?? null,
        },
      });

      return res.status(201).json(workflow);
    } catch (error) {
      console.error('createWorkflow error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** PATCH /api/companies/:companyId/workflows/:workflowId */
  async updateWorkflow(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId } = req.params;
      const body = req.body || {};
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const updateData: Record<string, unknown> = {};
      if (typeof body.name === 'string') updateData.name = body.name.trim();
      if (typeof body.description === 'string') updateData.description = body.description;
      if (typeof body.is_public === 'boolean') updateData.is_public = body.is_public;
      if (typeof body.visibility_scope === 'string') {
        updateData.visibility_scope = body.visibility_scope === 'specific' ? 'specific' : 'all_company';
      }
      if (typeof body.start_permission_scope === 'string') {
        updateData.start_permission_scope = body.start_permission_scope === 'specific' ? 'specific' : 'public';
      }
      if (typeof body.api_enabled === 'boolean') updateData.api_enabled = body.api_enabled;
      if (typeof body.file_enabled === 'boolean') updateData.file_enabled = body.file_enabled;
      if (typeof body.is_active === 'boolean') updateData.is_active = body.is_active;
      if (typeof body.portal_enabled === 'boolean') updateData.portal_enabled = body.portal_enabled;
      if (body.category_id !== undefined) updateData.category_id = body.category_id || null;
      if (body.icon !== undefined) updateData.icon = body.icon;
      if (body.data_structure !== undefined) updateData.data_structure = body.data_structure;
      if (body.canvas_comments !== undefined) updateData.canvas_comments = body.canvas_comments;
      if (body.default_status_id !== undefined) updateData.default_status_id = body.default_status_id || null;

      const workflow = await prisma.workflow.updateMany({
        where: { id: workflowId, company_id: companyId },
        data: updateData,
      });

      if (workflow.count === 0) {
        return res.status(404).json({ error: 'Workflow not found', details: 'Workflow not found or access denied' });
      }

      const updated = await prisma.workflow.findUnique({ where: { id: workflowId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateWorkflow error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** DELETE /api/companies/:companyId/workflows/:workflowId */
  async deleteWorkflow(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId } = req.params;
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, company_id: companyId },
        select: { id: true },
      });
      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found', details: 'Workflow not found or access denied' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.workflow.updateMany({
          where: { id: workflowId, company_id: companyId },
          data: { default_status_id: null },
        });
        await tx.workflowExecutionLog.deleteMany({
          where: { execution: { workflow_id: workflowId } },
        });
        await tx.workflowExecutionData.deleteMany({
          where: { execution: { workflow_id: workflowId } },
        });
        await tx.agentUsage.deleteMany({
          where: { execution: { workflow_id: workflowId } },
        });
        await tx.workflowExecutionStep.deleteMany({
          where: { execution: { workflow_id: workflowId } },
        });
        await tx.workflowExecution.updateMany({
          where: { workflow_id: workflowId },
          data: { current_step_id: null },
        });
        await tx.workflowExecution.deleteMany({
          where: { workflow_id: workflowId },
        });
        await tx.workflowConnection.deleteMany({
          where: { workflow_id: workflowId },
        });
        await tx.workflowStep.deleteMany({
          where: { workflow_id: workflowId },
        });
        await tx.workflowStatus.deleteMany({
          where: { workflow_id: workflowId },
        });
        await tx.workflowFile.deleteMany({
          where: { workflow_id: workflowId },
        });
        await tx.workflowPermission.deleteMany({
          where: { workflow_id: workflowId },
        });
        const result = await tx.workflow.deleteMany({
          where: { id: workflowId, company_id: companyId },
        });
        if (result.count === 0) {
          throw new Error('Workflow not found');
        }
      });

      return res.status(204).send();
    } catch (error) {
      console.error('deleteWorkflow error:', error);
      if (error instanceof Error && error.message === 'Workflow not found') {
        return res.status(404).json({ error: 'Workflow not found', details: 'Workflow not found or access denied' });
      }
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** PUT /api/companies/:companyId/workflows/:workflowId/steps - bulk upsert steps */
  async putSteps(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId } = req.params;
      const { steps } = req.body || {};
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, company_id: companyId },
        select: { id: true },
      });
      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found', details: 'Workflow not found or access denied' });
      }

      if (!Array.isArray(steps)) {
        return res.status(400).json({ error: 'Invalid body', details: 'steps must be an array' });
      }

      const isStepAssigned = (step: Record<string, any>): boolean => {
        const config = (step.config ?? {}) as Record<string, any>;
        const assignToExecutionCreator = config.assign_to_execution_creator !== false;
        return Boolean(
          assignToExecutionCreator ||
          step.assigned_to_user_id ||
          step.assigned_to_group_id ||
          config.assigned_to_user_id ||
          config.assigned_to_group_id
        );
      };

      for (const step of steps as Array<Record<string, any>>) {
        const stepType = step.step_type || 'action';
        const actionType = step.action_type || 'manual';
        const decisionNodeType = step.decision_node_type || 'Human';
        const originalConfig = (step.config ?? {}) as Record<string, any>;
        const config: Record<string, any> = { ...originalConfig };
        const normalizedExplanation = normalizeStepExplanation(config.explanation);
        const isAgentDecision = stepType === 'decision' && ['Agent', 'Agent_Human'].includes(decisionNodeType);
        const isExternalForm = stepType === 'edit_form' && config.allow_external_assignment === true;
        const supportsNotifications = stepSupportsNotifications(stepType, actionType, decisionNodeType);
        const normalizedNotifications = normalizeStepNotifications(config.notifications);

        if (normalizedExplanation) {
          config.explanation = normalizedExplanation;
        } else if ('explanation' in config) {
          delete config.explanation;
        }

        if (normalizedNotifications.error) {
          return res.status(400).json({
            error: 'Invalid notifications configuration',
            details: `Step "${step.name || 'Unnamed step'}" ${normalizedNotifications.error}`,
          });
        }

        if (supportsNotifications) {
          config.notifications = normalizedNotifications.value;
        } else if ('notifications' in config) {
          delete config.notifications;
        }
        step.config = config;

        const requiresAssignment =
          (stepType === 'action' && actionType === 'manual') ||
          (stepType === 'decision' && ['Human', 'Agent_Human', 'Agent + Human'].includes(decisionNodeType)) ||
          (stepType === 'edit_form' && !isExternalForm);

        if (requiresAssignment && !isStepAssigned(step)) {
          return res.status(400).json({
            error: 'Invalid step assignment',
            details: `Step "${step.name || 'Unnamed step'}" requires a user or group assignment`,
          });
        }

        if (isAgentDecision) {
          const hasAgentSource = Boolean(config.agent_id);
          const hasIntegrationSource = Boolean(config.api_configuration_id);
          const hasManualWebhookConfig =
            Boolean(config.api_url) ||
            Boolean(config.api_method) ||
            Boolean(config.api_headers) ||
            Boolean(config.api_params) ||
            Boolean(config.api_data) ||
            Boolean(config.api_path);

          if (hasAgentSource === hasIntegrationSource) {
            return res.status(400).json({
              error: 'Invalid decision configuration',
              details: `Step "${step.name || 'Unnamed step'}" must use exactly one webhook source: shared agent or company integration`,
            });
          }

          if (hasManualWebhookConfig) {
            return res.status(400).json({
              error: 'Invalid decision configuration',
              details: `Step "${step.name || 'Unnamed step'}" cannot include manual webhook settings for Agent decision types`,
            });
          }
        }
      }

      const existing = await prisma.workflowStep.findMany({
        where: { workflow_id: workflowId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((s) => s.id));
      const incomingIds = new Set(steps.filter((s: { id?: string }) => s.id).map((s: { id: string }) => s.id));

      const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
      if (toDelete.length > 0) {
        await prisma.workflowExecution.updateMany({
          where: { current_step_id: { in: toDelete } },
          data: { current_step_id: null },
        });
        // Remove connections first so workflow_steps deletion does not violate FK constraints.
        await prisma.workflowConnection.deleteMany({
          where: {
            workflow_id: workflowId,
            OR: [
              { source_step_id: { in: toDelete } },
              { target_step_id: { in: toDelete } },
            ],
          },
        });
        // Execution steps and logs reference workflow steps; clear/delete in dependency order
        const executionStepIds = await prisma.workflowExecutionStep.findMany({
          where: { step_id: { in: toDelete } },
          select: { id: true },
        }).then((rows) => rows.map((r) => r.id));
        if (executionStepIds.length > 0) {
          await prisma.workflowExecutionLog.updateMany({
            where: { step_id: { in: executionStepIds } },
            data: { step_id: null },
          });
        }
        await prisma.workflowExecutionStep.deleteMany({
          where: { step_id: { in: toDelete } },
        });
        await prisma.workflowStep.deleteMany({
          where: { id: { in: toDelete }, workflow_id: workflowId },
        });
      }

      for (const step of steps) {
        const id = step.id;
        const config = (step.config ?? {}) as Record<string, any>;
        const data = {
          workflow_id: workflowId,
          company_id: companyId,
          step_type: step.step_type || 'action',
          name: step.name || 'Step',
          position_x: step.position_x ?? 0,
          position_y: step.position_y ?? 0,
          config,
          assigned_to_user_id: step.assigned_to_user_id || null,
          assigned_to_group_id: step.assigned_to_group_id || null,
          decision_node_type: step.decision_node_type || null,
          action_type: step.action_type || 'manual',
        };

        if (id && existingIds.has(id)) {
          await prisma.workflowStep.update({
            where: { id },
            data,
          });
        } else {
          await prisma.workflowStep.create({
            data: { ...data, id: id || undefined },
          });
        }
      }

      const updated = await prisma.workflowStep.findMany({
        where: { workflow_id: workflowId },
        orderBy: [{ position_x: 'asc' }, { position_y: 'asc' }],
      });
      return res.json(updated);
    } catch (error) {
      console.error('putSteps error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** PUT /api/companies/:companyId/workflows/:workflowId/connections - bulk replace connections */
  async putConnections(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId } = req.params;
      const { connections } = req.body || {};
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, company_id: companyId },
        select: { id: true },
      });
      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found', details: 'Workflow not found or access denied' });
      }

      await prisma.workflowConnection.deleteMany({
        where: { workflow_id: workflowId },
      });

      if (Array.isArray(connections) && connections.length > 0) {
        await prisma.workflowConnection.createMany({
          data: connections.map((c: { source_step_id: string; target_step_id: string; output_name?: string; config?: unknown }) => ({
            workflow_id: workflowId,
            company_id: companyId,
            source_step_id: c.source_step_id,
            target_step_id: c.target_step_id,
            output_name: c.output_name || 'default',
            config: c.config ?? undefined,
          })),
        });
      }

      const list = await prisma.workflowConnection.findMany({
        where: { workflow_id: workflowId },
      });
      return res.json(list);
    } catch (error) {
      console.error('putConnections error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * GET /api/companies/:companyId/workflows/:workflowId/steps/:stepId/execution-usage
   * Returns how many executions referenced this workflow step.
   */
  async getStepExecutionUsage(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId, stepId } = req.params;
      if (!companyId || !workflowId || !stepId) {
        return res.status(400).json({ error: 'Missing company ID, workflow ID or step ID' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const step = await prisma.workflowStep.findFirst({
        where: { id: stepId, workflow_id: workflowId },
        select: { id: true },
      });
      if (!step) {
        return res.status(404).json({ error: 'Step not found', details: 'Step not found or access denied' });
      }

      const executionStepCount = await prisma.workflowExecutionStep.count({
        where: { step_id: stepId },
      });

      const executionIdRows = await prisma.workflowExecutionStep.findMany({
        where: { step_id: stepId },
        select: { execution_id: true },
        distinct: ['execution_id'],
      });
      const executionIds = executionIdRows.map((r) => r.execution_id);
      const executionCount = executionIds.length;

      const activeExecutionCount = await prisma.workflowExecution.count({
        where: { workflow_id: workflowId, current_step_id: stepId },
      });

      const pastStatuses: ExecutionStatus[] = ['completed', 'failed', 'paused'];
      const pastExecutionIds =
        executionIds.length > 0
          ? await prisma.workflowExecution.findMany({
              where: {
                id: { in: executionIds },
                workflow_id: workflowId,
                status: { in: pastStatuses },
              },
              select: { id: true },
            })
          : [];

      const pastExecutionCount = pastExecutionIds.length;

      const pastExecutionStepCount =
        pastExecutionIds.length > 0
          ? await prisma.workflowExecutionStep.count({
              where: {
                step_id: stepId,
                execution_id: { in: pastExecutionIds.map((e) => e.id) },
              },
            })
          : 0;

      return res.json({
        execution_step_count: executionStepCount,
        execution_count: executionCount,
        active_execution_count: activeExecutionCount,
        past_execution_count: pastExecutionCount,
        past_execution_step_count: pastExecutionStepCount,
      });
    } catch (error) {
      console.error('getStepExecutionUsage error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * DELETE /api/companies/:companyId/workflows/:workflowId/steps/:stepId
   * Deletes a step, its connections, and its historical execution steps.
   *
   * Query param:
   * - deletePastExecutions=true (required when past executions exist)
   */
  async deleteStep(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId, stepId } = req.params;
      if (!companyId || !workflowId || !stepId) {
        return res.status(400).json({ error: 'Missing company ID, workflow ID or step ID' });
      }

      const deletePastExecutions = String(req.query.deletePastExecutions ?? '').toLowerCase() === 'true';

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const step = await prisma.workflowStep.findFirst({
        where: { id: stepId, workflow_id: workflowId },
        select: { id: true },
      });
      if (!step) {
        return res.status(404).json({ error: 'Step not found', details: 'Step not found or access denied' });
      }

      const executionIdRows = await prisma.workflowExecutionStep.findMany({
        where: { step_id: stepId },
        select: { execution_id: true },
        distinct: ['execution_id'],
      });
      const executionIds = executionIdRows.map((r) => r.execution_id);

      const pastStatuses: ExecutionStatus[] = ['completed', 'failed', 'paused'];
      const pastExecutionIds =
        executionIds.length > 0
          ? await prisma.workflowExecution.findMany({
              where: {
                id: { in: executionIds },
                workflow_id: workflowId,
                status: { in: pastStatuses },
              },
              select: { id: true },
            })
          : [];

      const pastExecutionCount = pastExecutionIds.length;
      if (pastExecutionCount > 0 && !deletePastExecutions) {
        return res.status(409).json({
          error: 'Past executions exist',
          details: `This step is referenced by ${pastExecutionCount} past execution(s). Re-run delete with deletePastExecutions=true to confirm.`,
          past_execution_count: pastExecutionCount,
        });
      }

      await prisma.$transaction(async (tx) => {
        // Remove connections first so workflow_steps deletion does not violate FK constraints.
        await tx.workflowConnection.deleteMany({
          where: {
            workflow_id: workflowId,
            OR: [{ source_step_id: stepId }, { target_step_id: stepId }],
          },
        });

        // Clear any executions currently pointing at this step.
        await tx.workflowExecution.updateMany({
          where: { workflow_id: workflowId, current_step_id: stepId },
          data: { current_step_id: null },
        });

        // Clear log references and delete the execution-step rows.
        const executionStepIds = await tx.workflowExecutionStep.findMany({
          where: { step_id: stepId },
          select: { id: true },
        });
        const executionStepIdList = executionStepIds.map((r) => r.id);

        if (executionStepIdList.length > 0) {
          await tx.workflowExecutionLog.updateMany({
            where: { step_id: { in: executionStepIdList } },
            data: { step_id: null },
          });
          await tx.workflowExecutionStep.deleteMany({ where: { step_id: stepId } });
        }

        await tx.workflowStep.deleteMany({
          where: { id: stepId, workflow_id: workflowId },
        });
      });

      return res.status(204).send();
    } catch (error) {
      console.error('deleteStep error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** GET /api/companies/:companyId/workflows/:workflowId/statuses */
  async listStatuses(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId } = req.params;
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const statuses = await prisma.workflowStatus.findMany({
        where: { workflow_id: workflowId },
        orderBy: { order: 'asc' },
      });
      return res.json(statuses);
    } catch (error) {
      console.error('listStatuses error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** POST /api/companies/:companyId/workflows/:workflowId/statuses */
  async createStatus(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId } = req.params;
      const { name, order, color } = req.body || {};
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, company_id: companyId },
        select: { id: true },
      });
      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found', details: 'Workflow not found or access denied' });
      }

      const maxOrder = await prisma.workflowStatus.aggregate({
        where: { workflow_id: workflowId },
        _max: { order: true },
      });
      const orderNum = typeof order === 'number' ? order : (maxOrder._max.order ?? -1) + 1;

      const status = await prisma.workflowStatus.create({
        data: {
          workflow_id: workflowId,
          company_id: companyId,
          name: typeof name === 'string' ? name.trim() : 'New Status',
          order: orderNum,
          color: typeof color === 'string' ? color : '#6b7280',
        },
      });
      return res.status(201).json(status);
    } catch (error) {
      console.error('createStatus error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** PATCH /api/companies/:companyId/workflows/:workflowId/statuses/:statusId */
  async updateStatus(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId, statusId } = req.params;
      const body = req.body || {};
      if (!companyId || !workflowId || !statusId) {
        return res.status(400).json({ error: 'Missing company ID, workflow ID or status ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const updateData: Record<string, unknown> = {};
      if (typeof body.name === 'string') updateData.name = body.name.trim();
      if (typeof body.order === 'number') updateData.order = body.order;
      if (typeof body.color === 'string') updateData.color = body.color;

      const result = await prisma.workflowStatus.updateMany({
        where: { id: statusId, workflow_id: workflowId },
        data: updateData,
      });
      if (result.count === 0) {
        return res.status(404).json({ error: 'Status not found', details: 'Status not found or access denied' });
      }
      const updated = await prisma.workflowStatus.findUnique({ where: { id: statusId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateStatus error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** DELETE /api/companies/:companyId/workflows/:workflowId/statuses/:statusId */
  async deleteStatus(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId, statusId } = req.params;
      if (!companyId || !workflowId || !statusId) {
        return res.status(400).json({ error: 'Missing company ID, workflow ID or status ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const result = await prisma.workflowStatus.deleteMany({
        where: { id: statusId, workflow_id: workflowId },
      });
      if (result.count === 0) {
        return res.status(404).json({ error: 'Status not found', details: 'Status not found or access denied' });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('deleteStatus error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** GET /api/companies/:companyId/workflow-categories - list categories for company */
  async listCategories(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const categories = await prisma.workflowCategory.findMany({
        where: { ...companyFilter(companyId) },
        orderBy: { name: 'asc' },
      });
      return res.json(categories);
    } catch (error) {
      console.error('listCategories error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** POST /api/companies/:companyId/workflow-categories */
  async createCategory(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const { name, description, parent_category_id, icon } = req.body || {};
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const category = await prisma.workflowCategory.create({
        data: {
          company_id: companyId,
          name: typeof name === 'string' ? name.trim() : 'New Category',
          description: typeof description === 'string' ? description : null,
          parent_category_id: parent_category_id || null,
          icon: icon || null,
        },
      });
      return res.status(201).json(category);
    } catch (error) {
      console.error('createCategory error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** PATCH /api/companies/:companyId/workflow-categories/:categoryId */
  async updateCategory(req: AuthRequest, res: Response) {
    try {
      const { companyId, categoryId } = req.params;
      const body = req.body || {};
      if (!companyId || !categoryId) {
        return res.status(400).json({ error: 'Missing company ID or category ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const updateData: Record<string, unknown> = {};
      if (typeof body.name === 'string') updateData.name = body.name.trim();
      if (typeof body.description === 'string') updateData.description = body.description;
      if (body.parent_category_id !== undefined) updateData.parent_category_id = body.parent_category_id || null;
      if (body.icon !== undefined) updateData.icon = body.icon;

      const result = await prisma.workflowCategory.updateMany({
        where: { id: categoryId, company_id: companyId },
        data: updateData,
      });
      if (result.count === 0) {
        return res.status(404).json({ error: 'Category not found', details: 'Category not found or access denied' });
      }
      const updated = await prisma.workflowCategory.findUnique({ where: { id: categoryId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateCategory error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** DELETE /api/companies/:companyId/workflow-categories/:categoryId */
  async deleteCategory(req: AuthRequest, res: Response) {
    try {
      const { companyId, categoryId } = req.params;
      if (!companyId || !categoryId) {
        return res.status(400).json({ error: 'Missing company ID or category ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const result = await prisma.workflowCategory.deleteMany({
        where: { id: categoryId, company_id: companyId },
      });
      if (result.count === 0) {
        return res.status(404).json({ error: 'Category not found', details: 'Category not found or access denied' });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('deleteCategory error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** GET /api/companies/:companyId/workflows/:workflowId/permissions */
  async listPermissions(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId } = req.params;
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, company_id: companyId },
        select: { id: true },
      });
      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found', details: 'Workflow not found or access denied' });
      }

      const permissions = await prisma.workflowPermission.findMany({
        where: { workflow_id: workflowId },
        include: {
          user: { select: { id: true, email: true, full_name: true } },
          group: { select: { id: true, name: true, description: true } },
        },
      });
      return res.json(permissions);
    } catch (error) {
      console.error('listPermissions error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** POST /api/companies/:companyId/workflows/:workflowId/permissions */
  async addPermission(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId } = req.params;
      const { user_id, group_id, permission_type } = req.body || {};
      const normalizedType = normalizeWorkflowPermissionType(permission_type);
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      if (!user_id && !group_id) {
        return res.status(400).json({ error: 'Either user_id or group_id is required' });
      }
      if (user_id && group_id) {
        return res.status(400).json({ error: 'Provide only one of user_id or group_id' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, company_id: companyId },
        select: { id: true },
      });
      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found', details: 'Workflow not found or access denied' });
      }

      let perm;
      try {
        perm = await prisma.workflowPermission.create({
          data: {
            workflow_id: workflowId,
            company_id: companyId,
            user_id: user_id || null,
            group_id: group_id || null,
            permission_type: normalizedType,
          },
        });
      } catch (error: any) {
        const pgCode = error?.code || error?.meta?.code || error?.meta?.cause?.code;
        const legacyType = legacyWorkflowPermissionType(normalizedType);
        const isPermissionConstraintError =
          (pgCode === '23514' || `${error?.message || ''}`.includes('workflow_permissions_permission_type_check')) &&
          legacyType !== normalizedType;

        if (!isPermissionConstraintError) throw error;

        perm = await prisma.workflowPermission.create({
          data: {
            workflow_id: workflowId,
            company_id: companyId,
            user_id: user_id || null,
            group_id: group_id || null,
            permission_type: legacyType,
          },
        });
      }
      return res.status(201).json(perm);
    } catch (error) {
      console.error('addPermission error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** DELETE /api/companies/:companyId/workflows/:workflowId/permissions/:permissionId */
  async deletePermission(req: AuthRequest, res: Response) {
    try {
      const { companyId, workflowId, permissionId } = req.params;
      if (!companyId || !workflowId || !permissionId) {
        return res.status(400).json({ error: 'Missing company ID, workflow ID or permission ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const result = await prisma.workflowPermission.deleteMany({
        where: {
          id: permissionId,
          workflow_id: workflowId,
        },
      });
      if (result.count === 0) {
        return res.status(404).json({ error: 'Permission not found', details: 'Permission not found or access denied' });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('deletePermission error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
};
