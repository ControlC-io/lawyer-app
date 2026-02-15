import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';

async function ensureCompanyAccess(req: AuthRequest, companyId: string, requireAdmin = false) {
  const userId = req.user?.id;
  if (!userId) {
    return { error: { status: 401, body: { error: 'Unauthorized', details: 'Authentication required' } } };
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

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get user's group IDs for permission checking
      const userGroups = await prisma.profileGroupMember.findMany({
        where: { profile_id: userId },
        select: { group_id: true },
      });
      const userGroupIds = userGroups.map((g) => g.group_id).filter((id): id is string => id !== null);

      // Build the base where clause
      const baseWhere: { company_id: string; category_id?: string | null } = { company_id: companyId };
      if (rawCategoryId !== undefined) {
        baseWhere.category_id = (rawCategoryId === '' || rawCategoryId === 'null') ? null : rawCategoryId;
      }

      // Fetch workflows that user has permission to execute:
      // - is_public = true (available to all company users), OR
      // - user has a direct permission, OR
      // - user belongs to a group with permission
      const workflows = await prisma.workflow.findMany({
        where: {
          ...baseWhere,
          OR: [
            { is_public: true },
            { permissions: { some: { user_id: userId } } },
            ...(userGroupIds.length > 0
              ? [{ permissions: { some: { group_id: { in: userGroupIds } } } }]
              : []),
          ],
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
        where: { id: workflowId, company_id: companyId },
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
        select: { id: true, is_active: true },
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
      const access = await ensureCompanyAccess(req, companyId, true);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const workflow = await prisma.workflow.create({
        data: {
          company_id: companyId,
          name: typeof body.name === 'string' ? body.name.trim() : 'New Workflow',
          description: typeof body.description === 'string' ? body.description : null,
          is_public: !!body.is_public,
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
      const access = await ensureCompanyAccess(req, companyId, true);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const updateData: Record<string, unknown> = {};
      if (typeof body.name === 'string') updateData.name = body.name.trim();
      if (typeof body.description === 'string') updateData.description = body.description;
      if (typeof body.is_public === 'boolean') updateData.is_public = body.is_public;
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
      const access = await ensureCompanyAccess(req, companyId, true);
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
      const access = await ensureCompanyAccess(req, companyId, true);
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
        await prisma.workflowStep.deleteMany({
          where: { id: { in: toDelete }, workflow_id: workflowId },
        });
      }

      for (const step of steps) {
        const id = step.id;
        const data = {
          workflow_id: workflowId,
          company_id: companyId,
          step_type: step.step_type || 'action',
          name: step.name || 'Step',
          position_x: step.position_x ?? 0,
          position_y: step.position_y ?? 0,
          config: step.config ?? {},
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
      const access = await ensureCompanyAccess(req, companyId, true);
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
      const access = await ensureCompanyAccess(req, companyId, true);
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
      const access = await ensureCompanyAccess(req, companyId, true);
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
      const access = await ensureCompanyAccess(req, companyId, true);
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
        where: { company_id: companyId },
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
      const access = await ensureCompanyAccess(req, companyId, true);
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
      const access = await ensureCompanyAccess(req, companyId, true);
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
      const access = await ensureCompanyAccess(req, companyId, true);
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
      if (!companyId || !workflowId) {
        return res.status(400).json({ error: 'Missing company ID or workflow ID' });
      }
      if (!user_id && !group_id) {
        return res.status(400).json({ error: 'Either user_id or group_id is required' });
      }
      if (user_id && group_id) {
        return res.status(400).json({ error: 'Provide only one of user_id or group_id' });
      }
      const access = await ensureCompanyAccess(req, companyId, true);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, company_id: companyId },
        select: { id: true },
      });
      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found', details: 'Workflow not found or access denied' });
      }

      const perm = await prisma.workflowPermission.create({
        data: {
          workflow_id: workflowId,
          company_id: companyId,
          user_id: user_id || null,
          group_id: group_id || null,
          permission_type: typeof permission_type === 'string' ? permission_type : 'view',
        },
      });
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
      const access = await ensureCompanyAccess(req, companyId, true);
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
