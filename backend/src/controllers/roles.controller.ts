import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ALL_PERMISSION_KEYS, PERMISSION_GROUPS } from '../lib/rbac';

function isApiKeyRequestForCompany(req: AuthRequest, companyId: string): boolean {
  return !!req.company && !req.user && req.company.id === companyId;
}

function resolveAuditActorId(req: AuthRequest, companyId: string): string | null {
  if (req.user?.id) return req.user.id;
  if (isApiKeyRequestForCompany(req, companyId)) return companyId;
  return null;
}

async function createAuditLogTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown>,
) {
  await tx.auditLog.create({
    data: {
      company_id: companyId,
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details: details ? (details as any) : undefined,
    },
  });
}

async function ensureCompanyAccess(req: AuthRequest, companyId: string) {
  if (req.company && !req.user) {
    if (req.company.id !== companyId) {
      return { error: { status: 403 as const, body: { error: 'Forbidden', details: 'API key is not valid for this company' } } };
    }
    return {};
  }

  const userId = req.user?.id;
  if (!userId) {
    return { error: { status: 401 as const, body: { error: 'Unauthorized', details: 'Authentication required' } } };
  }
  if (req.user?.super_admin) return {};
  const userCompany = await prisma.userCompany.findFirst({
    where: { user_id: userId, company_id: companyId },
  });
  if (!userCompany) {
    return { error: { status: 403 as const, body: { error: 'Forbidden', details: 'You do not have access to this company' } } };
  }
  return { userCompany };
}

export const rolesController = {
  /** GET /api/companies/:companyId/roles */
  async listRoles(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const roles = await prisma.role.findMany({
      where: { company_id: companyId },
      include: {
        permissions: { select: { permission_key: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
    });

    return res.json(roles);
  },

  /** GET /api/companies/:companyId/roles/:roleId */
  async getRole(req: AuthRequest, res: Response) {
    const { companyId, roleId } = req.params;
    if (!companyId || !roleId) return res.status(400).json({ error: 'Missing company ID or role ID' });
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const role = await prisma.role.findFirst({
      where: { id: roleId, company_id: companyId },
      include: {
        permissions: { select: { permission_key: true } },
        _count: { select: { users: true } },
      },
    });

    if (!role) return res.status(404).json({ error: 'Role not found' });
    return res.json(role);
  },

  /** POST /api/companies/:companyId/roles */
  async createRole(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
    const { name, description, permissions } = req.body;
    const actorId = resolveAuditActorId(req, companyId);

    if (!actorId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    // Validate permission keys
    const invalidKeys = (permissions || []).filter(
      (key: string) => !ALL_PERMISSION_KEYS.includes(key as any),
    );
    if (invalidKeys.length > 0) {
      return res.status(400).json({ error: `Invalid permission keys: ${invalidKeys.join(', ')}` });
    }

    // Check uniqueness
    const existing = await prisma.role.findFirst({
      where: { company_id: companyId, name: name.trim() },
    });
    if (existing) {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }

    const role = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.role.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          company_id: companyId,
          permissions: {
            create: (permissions || []).map((key: string) => ({
              permission_key: key,
            })),
          },
        },
        include: {
          permissions: { select: { permission_key: true } },
          _count: { select: { users: true } },
        },
      });

      await createAuditLogTx(tx, companyId, actorId, 'role.created', 'role', created.id, {
        name: created.name,
        permissions,
        actor_type: req.user ? 'user' : 'api_key',
      });

      return created;
    });

    return res.status(201).json(role);
  },

  /** PATCH /api/companies/:companyId/roles/:roleId */
  async updateRole(req: AuthRequest, res: Response) {
    const { companyId, roleId } = req.params;
    if (!companyId || !roleId) return res.status(400).json({ error: 'Missing company ID or role ID' });
    const { name, description, permissions } = req.body;
    const actorId = resolveAuditActorId(req, companyId);

    if (!actorId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
    }

    if (permissions !== undefined && !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions must be an array of permission keys' });
    }

    const role = await prisma.role.findFirst({
      where: { id: roleId, company_id: companyId },
      include: { permissions: true },
    });

    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.is_system) return res.status(403).json({ error: 'System roles cannot be modified' });

    // Validate permission keys if provided
    if (permissions !== undefined) {
      const invalidKeys = permissions.filter(
        (key: string) => !ALL_PERMISSION_KEYS.includes(key as any),
      );
      if (invalidKeys.length > 0) {
        return res.status(400).json({ error: `Invalid permission keys: ${invalidKeys.join(', ')}` });
      }
    }

    // Check name uniqueness if changing name
    if (name && name.trim() !== role.name) {
      const existing = await prisma.role.findFirst({
        where: { company_id: companyId, name: name.trim(), id: { not: roleId } },
      });
      if (existing) {
        return res.status(409).json({ error: 'A role with this name already exists' });
      }
    }

    const previousPermissions = role.permissions.map((p: { permission_key: string }) => p.permission_key);

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Update role fields
      await tx.role.update({
        where: { id: roleId },
        data: {
          ...(name ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description: description?.trim() || null } : {}),
        },
      });

      // Replace permissions if provided
      if (permissions !== undefined) {
        await tx.rolePermission.deleteMany({ where: { role_id: roleId } });
        if (permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: permissions.map((key: string) => ({
              role_id: roleId,
              permission_key: key,
            })),
          });
        }
      }

      const updated = await tx.role.findFirst({
        where: { id: roleId },
        include: {
          permissions: { select: { permission_key: true } },
          _count: { select: { users: true } },
        },
      });

      await createAuditLogTx(tx, companyId, actorId, 'role.updated', 'role', roleId, {
        name: updated?.name,
        previousPermissions,
        newPermissions: permissions ?? previousPermissions,
        actor_type: req.user ? 'user' : 'api_key',
      });

      return updated;
    });

    return res.json(updated);
  },

  /** DELETE /api/companies/:companyId/roles/:roleId */
  async deleteRole(req: AuthRequest, res: Response) {
    const { companyId, roleId } = req.params;
    if (!companyId || !roleId) return res.status(400).json({ error: 'Missing company ID or role ID' });
    const actorId = resolveAuditActorId(req, companyId);

    if (!actorId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
    }

    const role = await prisma.role.findFirst({
      where: { id: roleId, company_id: companyId },
      include: { _count: { select: { users: true } } },
    });

    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.is_system) return res.status(403).json({ error: 'System roles cannot be deleted' });
    if (role._count.users > 0) {
      return res.status(409).json({ error: 'Cannot delete a role that has users assigned to it. Reassign users first.' });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.role.delete({ where: { id: roleId } });
      await createAuditLogTx(tx, companyId, actorId, 'role.deleted', 'role', roleId, {
        name: role.name,
        actor_type: req.user ? 'user' : 'api_key',
      });
    });

    return res.status(204).send();
  },

  /** GET /api/companies/:companyId/my-permissions */
  async getMyPermissions(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    if (!companyId) return res.status(400).json({ error: 'Missing company ID' });

    if (req.company && !req.user) {
      if (req.company.id !== companyId) {
        return res.status(403).json({ error: 'Forbidden', details: 'API key is not valid for this company' });
      }
      return res.json(['*']);
    }

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (req.user?.super_admin) return res.json(['*']);

    const userCompany = await prisma.userCompany.findFirst({
      where: { user_id: userId, company_id: companyId },
      include: {
        custom_role: {
          include: { permissions: { select: { permission_key: true } } },
        },
      },
    });

    if (!userCompany) return res.status(403).json({ error: 'Forbidden' });
    if (userCompany.role === 'company_admin') return res.json(['*']);
    if (!userCompany.custom_role) return res.json([]);

    return res.json(userCompany.custom_role.permissions.map((p: { permission_key: string }) => p.permission_key));
  },

  /** GET /api/companies/:companyId/permission-catalogue */
  async getPermissionCatalogue(_req: AuthRequest, res: Response) {
    return res.json(PERMISSION_GROUPS);
  },

  /** PATCH /api/companies/:companyId/users/:userId/role */
  async assignUserRole(req: AuthRequest, res: Response) {
    const { companyId, userId } = req.params;
    if (!companyId || !userId) return res.status(400).json({ error: 'Missing company ID or user ID' });
    const { role, custom_role_id } = req.body;
    const actorId = resolveAuditActorId(req, companyId);

    if (!actorId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
    }

    if (!role || !['company_admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be company_admin or user.' });
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { user_id: userId, company_id: companyId },
    });

    if (!userCompany) {
      return res.status(404).json({ error: 'User not found in this company' });
    }

    // Prevent removing last admin
    if (userCompany.role === 'company_admin' && role !== 'company_admin') {
      const adminCount = await prisma.userCompany.count({
        where: { company_id: companyId, role: 'company_admin' },
      });
      if (adminCount <= 1) {
        return res.status(409).json({ error: 'Cannot remove the last admin from the organisation' });
      }
    }

    // Validate custom_role_id if provided
    if (custom_role_id) {
      const customRole = await prisma.role.findFirst({
        where: { id: custom_role_id, company_id: companyId, is_system: false },
      });
      if (!customRole) {
        return res.status(404).json({ error: 'Custom role not found' });
      }
    }

    const previousRole = userCompany.role;
    const previousCustomRoleId = userCompany.custom_role_id;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.userCompany.update({
        where: { id: userCompany.id },
        data: {
          role,
          custom_role_id: role === 'company_admin' ? null : (custom_role_id || null),
        },
      });

      await createAuditLogTx(tx, companyId, actorId, 'user.role_changed', 'user', userId, {
        previousRole,
        previousCustomRoleId,
        newRole: role,
        newCustomRoleId: role === 'company_admin' ? null : (custom_role_id || null),
        actor_type: req.user ? 'user' : 'api_key',
      });
    });

    return res.json({ success: true });
  },
};
