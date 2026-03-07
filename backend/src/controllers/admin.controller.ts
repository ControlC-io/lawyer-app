import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

function parsePagination(query: Record<string, unknown>): { take: number; skip: number } {
  const limit = Math.min(Math.max(parseInt(query.limit as string, 10) || 100, 1), 1000);
  const offset = Math.max(parseInt(query.offset as string, 10) || 0, 0);
  return { take: limit, skip: offset };
}

function companyFilter(query: Record<string, unknown>): { company_id: string } | undefined {
  const companyId = query.company_id as string | undefined;
  return companyId ? { company_id: companyId } : undefined;
}

export const adminController = {
  async listCompanies(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const companies = await prisma.company.findMany({
        take,
        skip,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          created_at: true,
          is_active: true,
          api_key: true,
          slug: true,
          portal_enabled: true,
          _count: {
            select: {
              workflows: true,
              workflow_executions: true,
              files: true,
              user_companies: true,
            },
          },
        },
      });
      return res.json(companies);
    } catch (error) {
      console.error('admin.listCompanies error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listExecutions(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);
      const status = req.query.status as string | undefined;

      const where: Record<string, unknown> = { ...filter };
      if (status) where.status = status;

      const executions = await prisma.workflowExecution.findMany({
        where,
        take,
        skip,
        orderBy: { created_at: 'desc' },
        include: {
          workflow: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          current_step: { select: { name: true } },
        },
      });
      return res.json(executions);
    } catch (error) {
      console.error('admin.listExecutions error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listWorkflows(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);

      const workflows = await prisma.workflow.findMany({
        where: { ...filter },
        take,
        skip,
        orderBy: { updated_at: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          created_at: true,
          updated_at: true,
          company_id: true,
          is_active: true,
          api_enabled: true,
          visibility_scope: true,
          icon: true,
          category_id: true,
          company: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          _count: { select: { steps: true, executions: true } },
        },
      });
      return res.json(workflows);
    } catch (error) {
      console.error('admin.listWorkflows error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listFiles(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);

      const files = await prisma.file.findMany({
        where: { ...filter },
        take,
        skip,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          folder_id: true,
          storage_path: true,
          size_bytes: true,
          mime_type: true,
          created_at: true,
          company_id: true,
          company: { select: { id: true, name: true } },
          folder: { select: { id: true, name: true } },
        },
      });
      const serialized = files.map((f) => ({
        ...f,
        size_bytes: f.size_bytes != null ? Number(f.size_bytes) : 0,
      }));
      return res.json(serialized);
    } catch (error) {
      console.error('admin.listFiles error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listFolders(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);

      const folders = await prisma.folder.findMany({
        where: { ...filter },
        take,
        skip,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          parent_folder_id: true,
          created_at: true,
          company_id: true,
          company: { select: { id: true, name: true } },
        },
      });
      return res.json(folders);
    } catch (error) {
      console.error('admin.listFolders error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listDataTables(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);

      const tables = await prisma.dataTable.findMany({
        where: { ...filter },
        take,
        skip,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          position: true,
          created_at: true,
          company_id: true,
          company: { select: { id: true, name: true } },
          _count: { select: { fields: true, records: true } },
        },
      });
      return res.json(tables);
    } catch (error) {
      console.error('admin.listDataTables error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listGlobalVariables(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);

      const variables = await prisma.dataGlobalVariable.findMany({
        where: { ...filter },
        take,
        skip,
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          key: true,
          variable_type: true,
          value: true,
          position: true,
          is_locked: true,
          options: true,
          created_at: true,
          company_id: true,
          company: { select: { id: true, name: true } },
        },
      });
      return res.json(variables);
    } catch (error) {
      console.error('admin.listGlobalVariables error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listGroups(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);

      const groups = await prisma.profileGroup.findMany({
        where: { ...filter },
        take,
        skip,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          created_at: true,
          company_id: true,
          company: { select: { id: true, name: true } },
          _count: { select: { members: true } },
        },
      });
      return res.json(groups);
    } catch (error) {
      console.error('admin.listGroups error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listUsers(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);

      const memberships: any[] = await (prisma.userCompany as any).findMany({
        where: { ...filter },
        take,
        skip,
        orderBy: { created_at: 'desc' },
        include: {
          profile: { select: { id: true, email: true, full_name: true } },
          company: { select: { id: true, name: true } },
          custom_role: { select: { id: true, name: true } },
        },
      });
      return res.json(
        memberships.map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          email: m.profile?.email,
          full_name: m.profile?.full_name,
          company_id: m.company_id,
          company_name: m.company?.name,
          role: m.role,
          custom_role: m.custom_role ?? null,
          created_at: m.created_at,
        })),
      );
    } catch (error) {
      console.error('admin.listUsers error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listApiConfigurations(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);

      const configs = await prisma.apiConfiguration.findMany({
        where: { ...filter },
        take,
        skip,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          config_type: true,
          api_url: true,
          api_method: true,
          created_at: true,
          company_id: true,
          company: { select: { id: true, name: true } },
        },
      });
      return res.json(configs);
    } catch (error) {
      console.error('admin.listApiConfigurations error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listAgentConfigurations(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);

      const configs = await prisma.agentConfiguration.findMany({
        take,
        skip,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          api_url: true,
          api_method: true,
          agent_type: true,
          category_id: true,
          created_at: true,
          category: { select: { id: true, name: true } },
          _count: { select: { permissions: true, usage: true } },
        },
      });
      return res.json(configs);
    } catch (error) {
      console.error('admin.listAgentConfigurations error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listAgentUsage(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);

      const usage = await prisma.agentUsage.findMany({
        where: { ...filter },
        take,
        skip,
        orderBy: { created_at: 'desc' },
        include: {
          agent: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
        },
      });
      return res.json(
        usage.map((row) => ({
          id: row.id,
          workflow_execution_id: row.workflow_execution_id,
          agent_id: row.agent_id,
          agent_name: row.agent?.name ?? null,
          model_name: row.model_name,
          input_tokens: row.input_tokens != null ? String(row.input_tokens) : null,
          thinking_tokens: row.thinking_tokens != null ? String(row.thinking_tokens) : null,
          output_tokens: row.output_tokens != null ? String(row.output_tokens) : null,
          total_cost: row.total_cost != null ? String(row.total_cost) : null,
          company_id: row.company_id,
          company_name: row.company?.name ?? null,
          comment: row.comment ?? null,
          created_at: row.created_at,
        })),
      );
    } catch (error) {
      console.error('admin.listAgentUsage error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listRoles(req: AuthRequest, res: Response) {
    try {
      const { take, skip } = parsePagination(req.query);
      const filter = companyFilter(req.query);

      const roles = await (prisma as any).role.findMany({
        where: { ...filter },
        take,
        skip,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          is_system: true,
          created_at: true,
          company_id: true,
          company: { select: { id: true, name: true } },
          _count: { select: { permissions: true, users: true } },
        },
      });
      return res.json(roles);
    } catch (error) {
      console.error('admin.listRoles error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
};
