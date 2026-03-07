import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthRequest, ALL_COMPANIES, companyFilter } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { canUserAccessFolder, getUserGroupIdsInCompany } from '../lib/folderAccess';
import { getAccessibleFileIds, canUserAccessFileByMetadata } from '../lib/documentAccess';
import { storageService } from '../services/storage.service';

/**
 * Ensure the authenticated user has access to the company (member of company).
 * Optionally require company_admin role.
 */
async function ensureCompanyAccess(req: AuthRequest, companyId: string, requireAdmin = false) {
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

async function getUserGroupIdsForCompany(userId: string, companyId: string): Promise<string[]> {
  const memberships = await prisma.profileGroupMember.findMany({
    where: {
      profile_id: userId,
      group: { company_id: companyId },
    },
    select: { group_id: true },
  });

  return memberships
    .map((membership) => membership.group_id)
    .filter((id): id is string => id !== null);
}

export const companiesController = {
  /**
   * GET /api/companies
   * List companies (user's companies, or all if super_admin)
   */
  async listCompanies(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      // Super admin API key or JWT super_admin: return all companies
      const superAdmin = req.user?.super_admin ?? await prisma.profileAdminRole.findUnique({ where: { profile_id: userId }, select: { super_admin: true } }).then((r) => r?.super_admin ?? false);
      if (superAdmin) {
        const all = await prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
        return res.json(all);
      }
      const memberships = await prisma.userCompany.findMany({ where: { user_id: userId }, include: { company: { select: { id: true, name: true } } } });
      return res.json(memberships.map((m) => ({ id: m.company.id, name: m.company.name })));
    } catch (error) {
      console.error('listCompanies error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * GET /api/companies/:companyId
   * Get company details (JWT, user must belong to company)
   */
  async getCompany(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID', details: 'companyId is required' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          created_at: true,
          api_key: true,
          is_active: true,
          slug: true,
          logo_url: true,
          logo_storage_path: true,
          portal_description: true,
          portal_primary_color: true,
          portal_enabled: true,
        },
      });

      if (!company) {
        return res.status(404).json({ error: 'Company not found', details: 'Company not found' });
      }

      const rawLogoUrl =
        company.logo_storage_path && company.slug
          ? `/api/portal/${companyId.slice(0, 6)}_${company.slug}/logo`
          : company.logo_url ?? null;
      const effectiveLogoUrl =
        typeof rawLogoUrl === 'string' && rawLogoUrl.startsWith('/api/portal/') && rawLogoUrl.endsWith('/logo') && !company.logo_storage_path
          ? null
          : rawLogoUrl;

      // Return full api_key so dashboard can call execution endpoints with x-api-key
      return res.json({
        ...company,
        logo_url: effectiveLogoUrl,
        has_api_key: !!company.api_key,
      });
    } catch (error) {
      console.error('getCompany error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * PATCH /api/companies/:companyId
   * Update company (JWT, company admin only)
   */
  async updateCompany(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const { name, is_active, regenerate_api_key, slug, logo_url, portal_description, portal_primary_color, portal_enabled, clear_logo_upload } = req.body;

      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID', details: 'companyId is required' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const updateData: Record<string, unknown> = {};
      if (typeof name === 'string') updateData.name = name.trim();
      if (typeof is_active === 'boolean') updateData.is_active = is_active;
      if (regenerate_api_key === true) {
        const crypto = await import('crypto');
        updateData.api_key = crypto.randomBytes(32).toString('hex');
      }

      // Portal fields
      if (typeof slug === 'string') {
        const slugValue = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (slugValue) {
          // Check uniqueness
          const existing = await prisma.company.findFirst({
            where: { slug: slugValue, id: { not: companyId } },
            select: { id: true },
          });
          if (existing) {
            return res.status(400).json({ error: 'Slug already in use', details: 'This portal URL is already taken by another company' });
          }
          updateData.slug = slugValue;
        } else {
          updateData.slug = null;
        }
      }
      // Ignore logo_url when it is our own API path (/api/portal/.../logo) so saving portal settings doesn't overwrite or clear the uploaded logo
      const logoUrlTrimmed = typeof logo_url === 'string' ? logo_url.trim() : '';
      const isOurPortalLogoPath = logoUrlTrimmed.startsWith('/api/portal/') && logoUrlTrimmed.endsWith('/logo');
      if (typeof logo_url === 'string' && !isOurPortalLogoPath) {
        updateData.logo_url = logo_url.trim() || null;
      }
      if (clear_logo_upload === true && !isOurPortalLogoPath) {
        const current = await prisma.company.findUnique({
          where: { id: companyId },
          select: { logo_storage_path: true },
        });
        if (current?.logo_storage_path) {
          const bucket = storageService.getBucketName();
          try {
            await storageService.deleteFile(bucket, current.logo_storage_path);
          } catch (e) {
            console.error('deletePortalLogo: failed to delete from MinIO:', e);
          }
          updateData.logo_storage_path = null;
        }
      }
      // Allow clearing portal description: accept string (trimmed) or null/empty
      if ('portal_description' in req.body) {
        updateData.portal_description =
          typeof portal_description === 'string' && portal_description.trim()
            ? portal_description.trim()
            : null;
      }
      if (typeof portal_primary_color === 'string') {
        const color = portal_primary_color.trim();
        if (color && !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color)) {
          return res.status(400).json({ error: 'Invalid color', details: 'portal_primary_color must be a valid hex color (e.g. #3B82F6)' });
        }
        updateData.portal_primary_color = color || null;
      }
      if (typeof portal_enabled === 'boolean') updateData.portal_enabled = portal_enabled;

      const company = await prisma.company.update({
        where: { id: companyId },
        data: updateData,
        select: {
          id: true,
          name: true,
          created_at: true,
          is_active: true,
          api_key: true,
          slug: true,
          logo_url: true,
          logo_storage_path: true,
          portal_description: true,
          portal_primary_color: true,
          portal_enabled: true,
        },
      });

      const rawLogoUrl =
        company.logo_storage_path && company.slug
          ? `/api/portal/${companyId.slice(0, 6)}_${company.slug}/logo`
          : company.logo_url ?? null;
      const effectiveLogoUrl =
        typeof rawLogoUrl === 'string' && rawLogoUrl.startsWith('/api/portal/') && rawLogoUrl.endsWith('/logo') && !company.logo_storage_path
          ? null
          : rawLogoUrl;

      return res.json({ ...company, logo_url: effectiveLogoUrl });
    } catch (error) {
      console.error('updateCompany error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/companies/:companyId/portal-logo
   * Upload portal logo (JWT, company admin). Requires company slug to be set.
   */
  async uploadPortalLogo(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const file = (req as unknown as { file?: Express.Multer.File }).file;

      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID', details: 'companyId is required' });
      }
      if (!file || !file.buffer) {
        return res.status(400).json({ error: 'Missing file', details: 'A logo image file is required' });
      }

      const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          error: 'Invalid file type',
          details: 'Logo must be PNG, JPEG, SVG or WebP',
        });
      }
      const maxSize = 2 * 1024 * 1024; // 2 MB
      if (file.size > maxSize) {
        return res.status(400).json({
          error: 'File too large',
          details: 'Logo must be 2 MB or less',
        });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, slug: true, logo_storage_path: true },
      });
      if (!company) {
        return res.status(404).json({ error: 'Company not found', details: 'Company not found' });
      }
      if (!company.slug || !company.slug.trim()) {
        return res.status(400).json({
          error: 'Portal slug required',
          details: 'Set the portal URL (slug) before uploading a logo',
        });
      }

      const extMap: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/svg+xml': 'svg',
        'image/webp': 'webp',
      };
      const ext = extMap[file.mimetype] || 'png';
      const path = `portal-logos/${companyId}/logo.${ext}`;
      const bucket = storageService.getBucketName();

      if (company.logo_storage_path && company.logo_storage_path !== path) {
        try {
          await storageService.deleteFile(bucket, company.logo_storage_path);
        } catch (e) {
          console.error('uploadPortalLogo: failed to delete previous logo from storage:', e);
        }
      }

      await storageService.uploadFile(bucket, path, file.buffer, file.mimetype);

      await prisma.company.update({
        where: { id: companyId },
        data: { logo_storage_path: path, logo_url: null },
      });

      const logoUrl = `/api/portal/${companyId.slice(0, 6)}_${company.slug}/logo`;
      return res.json({ logo_url: logoUrl });
    } catch (error) {
      console.error('uploadPortalLogo error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * DELETE /api/companies/:companyId/portal-logo
   * Remove uploaded portal logo (JWT, company admin)
   */
  async deletePortalLogo(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID', details: 'companyId is required' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { logo_storage_path: true },
      });
      if (!company) {
        return res.status(404).json({ error: 'Company not found', details: 'Company not found' });
      }
      if (company.logo_storage_path) {
        const bucket = storageService.getBucketName();
        try {
          await storageService.deleteFile(bucket, company.logo_storage_path);
        } catch (e) {
          console.error('deletePortalLogo: failed to delete from MinIO:', e);
        }
      }

      await prisma.company.update({
        where: { id: companyId },
        data: { logo_storage_path: null },
      });

      return res.status(204).send();
    } catch (error) {
      console.error('deletePortalLogo error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/companies/:companyId/files-metadata-keys
   * List files metadata keys for organization settings
   */
  async listFilesMetadataKeys(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID', details: 'companyId is required' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const userId = req.user?.id;
      const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;

      // Admins see all keys; non-admins see only keys present on their accessible files
      if (isCompanyAdmin) {
        const keys = await prisma.filesMetadataKey.findMany({
          where: { ...companyFilter(companyId) },
          orderBy: { name: 'asc' },
        });
        return res.json(keys);
      }

      const userGroupIds = userId ? await getUserGroupIdsInCompany(userId, companyId) : [];
      const accessibleFileIds = await getAccessibleFileIds({
        userId: userId!,
        companyId,
        isCompanyAdmin: false,
        userGroupIds,
      });

      if (accessibleFileIds.length === 0) {
        return res.json([]);
      }

      // Get distinct metadata key IDs from accessible files
      const metadataValues = await prisma.filesMetadataValue.findMany({
        where: { files_id: { in: accessibleFileIds }, ...companyFilter(companyId) },
        select: { metadata_id: true },
        distinct: ['metadata_id'],
      });

      const accessibleKeyIds = metadataValues.map((m) => m.metadata_id);
      if (accessibleKeyIds.length === 0) {
        return res.json([]);
      }

      const keys = await prisma.filesMetadataKey.findMany({
        where: { id: { in: accessibleKeyIds }, ...companyFilter(companyId) },
        orderBy: { name: 'asc' },
      });

      return res.json(keys);
    } catch (error) {
      console.error('listFilesMetadataKeys error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/companies/:companyId/files-metadata-keys
   * Create a files metadata key
   */
  async createFilesMetadataKey(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const { name } = req.body;

      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID', details: 'companyId is required' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const key = await prisma.filesMetadataKey.create({
        data: {
          company_id: companyId,
          name: typeof name === 'string' ? name.trim() || null : null,
        },
      });

      return res.status(201).json(key);
    } catch (error) {
      console.error('createFilesMetadataKey error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * PATCH /api/companies/:companyId/files-metadata-keys/:keyId
   * Update a files metadata key
   */
  async updateFilesMetadataKey(req: AuthRequest, res: Response) {
    try {
      const { companyId, keyId } = req.params;
      const { name } = req.body;

      if (!companyId || !keyId) {
        return res.status(400).json({ error: 'Missing company ID or key ID', details: 'companyId and keyId are required' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const key = await prisma.filesMetadataKey.updateMany({
        where: { id: keyId, company_id: companyId },
        data: { name: typeof name === 'string' ? name.trim() || null : undefined },
      });

      if (key.count === 0) {
        return res.status(404).json({ error: 'Metadata key not found', details: 'Key not found or access denied' });
      }

      const updated = await prisma.filesMetadataKey.findUnique({
        where: { id: keyId },
      });
      return res.json(updated);
    } catch (error) {
      console.error('updateFilesMetadataKey error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * DELETE /api/companies/:companyId/files-metadata-keys/:keyId
   * Delete a files metadata key
   */
  async deleteFilesMetadataKey(req: AuthRequest, res: Response) {
    try {
      const { companyId, keyId } = req.params;

      if (!companyId || !keyId) {
        return res.status(400).json({ error: 'Missing company ID or key ID', details: 'companyId and keyId are required' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const result = await prisma.filesMetadataKey.deleteMany({
        where: { id: keyId, company_id: companyId },
      });

      if (result.count === 0) {
        return res.status(404).json({ error: 'Metadata key not found', details: 'Key not found or access denied' });
      }

      return res.status(204).send();
    } catch (error) {
      console.error('deleteFilesMetadataKey error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * PUT /api/companies/:companyId/files/:fileId/metadata
   * Replace all metadata key-value entries for a file (key = metadata key name)
   */
  async updateFileMetadata(req: AuthRequest, res: Response) {
    try {
      const { companyId, fileId } = req.params;
      const { entries } = (req.body || {}) as { entries?: Array<{ key: string; value: string }> };
      if (!companyId || !fileId) return res.status(400).json({ error: 'Missing company ID or file ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const file = await prisma.file.findFirst({ where: { id: fileId, company_id: companyId } });
      if (!file) return res.status(404).json({ error: 'File not found' });

      const list = Array.isArray(entries) ? entries.filter((e) => e && typeof e.key === 'string' && e.key.trim() !== '') : [];
      const keyMap = new Map<string, string>();
      const keys = await prisma.filesMetadataKey.findMany({ where: { company_id: companyId }, select: { id: true, name: true } });
      keys.forEach((k) => { if (k.name) keyMap.set(k.name, k.id); });

      await prisma.filesMetadataValue.deleteMany({ where: { files_id: fileId, company_id: companyId } });

      for (const entry of list) {
        let keyId = keyMap.get(entry.key.trim());
        if (!keyId) {
          const created = await prisma.filesMetadataKey.create({
            data: { company_id: companyId, name: entry.key.trim() },
            select: { id: true, name: true },
          });
          keyId = created.id;
          if (created.name) keyMap.set(created.name, created.id);
        }
        await prisma.filesMetadataValue.create({
          data: {
            files_id: fileId,
            metadata_id: keyId,
            value: typeof entry.value === 'string' ? entry.value : String(entry.value),
            company_id: companyId,
          },
        });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('updateFileMetadata error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * GET /api/companies/:companyId/executions
   * List workflow executions for the company (JWT, user must belong to company)
   */
  async listExecutions(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const userId = req.user?.id;
      const workflowId = req.query.workflowId as string | undefined;
      const status = req.query.status as string | undefined;
      const categoryId = req.query.categoryId as string | undefined;
      const includeData = req.query.includeData === 'true';

      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID', details: 'companyId is required' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }
      if (!req.user?.super_admin && !userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }

      const where: Prisma.WorkflowExecutionWhereInput = {
        ...companyFilter(companyId),
      };
      if (workflowId) where.workflow_id = workflowId;
      if (status) where.status = status as 'pending' | 'running' | 'completed' | 'failed' | 'paused';
      if (categoryId !== undefined) {
        where.workflow = { category_id: categoryId || null };
      }

      const isPrivileged = req.user?.super_admin === true;
      let userGroupIds: string[] = [];
      if (!isPrivileged && userId) {
        userGroupIds = await getUserGroupIdsForCompany(userId, companyId);
        const existingAnd = Array.isArray(where.AND)
          ? where.AND
          : (where.AND ? [where.AND] : []);
        const visibilityPermissionTypes = ['visibility', 'view'];
        const assignmentFilters: Prisma.WorkflowExecutionStepWhereInput[] = [
          { assigned_to_user_id: userId },
        ];
        if (userGroupIds.length > 0) {
          assignmentFilters.push({ assigned_to_group_id: { in: userGroupIds } });
        }

        where.AND = [
          ...existingAnd,
          {
            OR: [
              {
                workflow: {
                  OR: [
                    { visibility_scope: 'all_company' },
                    { is_public: true }, // Legacy compatibility
                    { permissions: { some: { user_id: userId, permission_type: { in: visibilityPermissionTypes } } } },
                    ...(userGroupIds.length > 0
                      ? [{ permissions: { some: { group_id: { in: userGroupIds }, permission_type: { in: visibilityPermissionTypes } } } }]
                      : []),
                  ],
                },
              },
              {
                execution_steps: {
                  some: {
                    OR: assignmentFilters,
                  },
                },
              },
            ],
          },
        ];
      }

      const executions = await prisma.workflowExecution.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: {
          workflow: {
            select: { id: true, name: true, category_id: true, icon: true },
          },
          current_step: { select: { name: true } },
          ...(!isPrivileged && userId
            ? {
                execution_steps: {
                  select: {
                    step: { select: { name: true } },
                    assigned_user: { select: { full_name: true, email: true } },
                    assigned_group: { select: { name: true } },
                    status: true,
                    assigned_to_user_id: true,
                    assigned_to_group_id: true,
                  },
                },
              }
            : {}),
          ...(includeData ? { execution_data_records: true } : {}),
        },
      });

      const filteredExecutions = (!isPrivileged && userId)
        ? executions.filter((execution: any) => {
            const steps = (execution.execution_steps || []) as Array<{
              status: string;
              assigned_to_user_id: string | null;
              assigned_to_group_id: string | null;
            }>;
            const isAssigned = (step: { assigned_to_user_id: string | null; assigned_to_group_id: string | null }) =>
              step.assigned_to_user_id === userId ||
              (step.assigned_to_group_id && userGroupIds.includes(step.assigned_to_group_id));

            if (execution.status === 'completed') {
              return steps.some(isAssigned);
            }

            const runningAssigned = steps.some((step) => step.status === 'running' && isAssigned(step));
            if (runningAssigned) return true;

            // Fallback for workflows waiting to start/advance.
            return steps.some((step) => step.status === 'pending' && isAssigned(step));
          })
        : executions;

      return res.json(filteredExecutions.map((e: any) => {
        const ex = e as typeof e & { current_step?: { name: string | null } };
        const executionSteps = ((e.execution_steps || []) as Array<{
          status: string;
          step?: { name?: string | null } | null;
          assigned_to_user_id: string | null;
          assigned_to_group_id: string | null;
          assigned_user?: { full_name: string | null; email: string } | null;
          assigned_group?: { name: string } | null;
        }>);
        const runningSteps = executionSteps.filter((step) => step.status === 'running');
        const currentStepNames = runningSteps
          .map((step) => step.step?.name)
          .filter((name): name is string => !!name);

        const assignees: Array<{ type: 'user' | 'group'; name: string }> = [];
        const assigneeKeys = new Set<string>();
        runningSteps.forEach((step) => {
          if (step.assigned_to_user_id) {
            const name = step.assigned_user?.full_name || step.assigned_user?.email || step.assigned_to_user_id;
            const key = `user:${name}`;
            if (!assigneeKeys.has(key)) {
              assigneeKeys.add(key);
              assignees.push({ type: 'user', name });
            }
          }
          if (step.assigned_to_group_id) {
            const name = step.assigned_group?.name || step.assigned_to_group_id;
            const key = `group:${name}`;
            if (!assigneeKeys.has(key)) {
              assigneeKeys.add(key);
              assignees.push({ type: 'group', name });
            }
          }
        });

        if ('execution_steps' in ex) {
          delete (ex as any).execution_steps;
        }
        return {
          ...ex,
          current_step_name: currentStepNames[0] ?? ex.current_step?.name ?? null,
          current_step_names: currentStepNames.length > 0 ? currentStepNames : undefined,
          assignees: assignees.length > 0 ? assignees : undefined,
        };
      }));
    } catch (error) {
      console.error('listExecutions error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/companies/:companyId/execution-steps
   * List execution steps (e.g. status=running) for "My Tasks" (JWT)
   */
  async listExecutionSteps(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const userId = req.user?.id;
      const status = (req.query.status as string) || 'running';
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      if (!req.user?.super_admin && !userId) {
        return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
      }

      const isPrivileged = req.user?.super_admin === true;
      const stepWhere: Prisma.WorkflowExecutionStepWhereInput = {
        ...companyFilter(companyId),
        status: status as any,
      };

      if (!isPrivileged && userId) {
        const userGroupIds = await getUserGroupIdsForCompany(userId, companyId);
        stepWhere.OR = [
          { assigned_to_user_id: userId },
          ...(userGroupIds.length > 0 ? [{ assigned_to_group_id: { in: userGroupIds } }] : []),
        ];
      }

      const steps = await prisma.workflowExecutionStep.findMany({
        where: stepWhere,
        select: {
          execution_id: true,
          assigned_to_user_id: true,
          assigned_to_group_id: true,
          step: { select: { name: true, step_type: true, action_type: true, config: true } },
        },
      });
      return res.json(steps.map((s) => ({
        execution_id: s.execution_id,
        assigned_to_user_id: s.assigned_to_user_id,
        assigned_to_group_id: s.assigned_to_group_id,
        workflow_steps: s.step,
      })));
    } catch (error) {
      console.error('listExecutionSteps error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * DELETE /api/companies/:companyId/executions/:executionId
   */
  async deleteExecution(req: AuthRequest, res: Response) {
    try {
      const { companyId, executionId } = req.params;
      if (!companyId || !executionId) return res.status(400).json({ error: 'Missing company ID or execution ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const execution = await prisma.workflowExecution.findFirst({
        where: { id: executionId, company_id: companyId },
        select: { id: true },
      });
      if (!execution) return res.status(404).json({ error: 'Execution not found' });

      await prisma.$transaction(async (tx) => {
        await tx.workflowExecutionLog.deleteMany({ where: { execution_id: executionId } });
        await tx.workflowExecutionStep.deleteMany({ where: { execution_id: executionId } });
        await tx.workflowExecutionData.deleteMany({ where: { execution_id: executionId } });
        await tx.agentUsage.deleteMany({ where: { workflow_execution_id: executionId } });
        await tx.workflowExecution.delete({ where: { id: executionId } });
      });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteExecution error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * DELETE /api/companies/:companyId/users/:userId
   * Remove a user from the company (company admin): remove from groups, user_company, cancel invitations
   */
  async removeUserFromCompany(req: AuthRequest, res: Response) {
    try {
      const { companyId, userId: targetUserId } = req.params;
      if (!companyId || !targetUserId) return res.status(400).json({ error: 'Missing company ID or user ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const groups = await prisma.profileGroup.findMany({ where: { company_id: companyId }, select: { id: true } });
      const groupIds = groups.map((g) => g.id);
      if (groupIds.length > 0) {
        await prisma.profileGroupMember.deleteMany({
          where: { profile_id: targetUserId, group_id: { in: groupIds } },
        });
      }
      await prisma.userCompany.deleteMany({
        where: { user_id: targetUserId, company_id: companyId },
      });
      const profile = await prisma.profile.findUnique({ where: { id: targetUserId }, select: { email: true } });
      if (profile?.email) {
        await prisma.invitation.deleteMany({
          where: { company_id: companyId, email: profile.email },
        });
      }
      return res.status(204).send();
    } catch (error) {
      console.error('removeUserFromCompany error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  // --- Profile groups ---
  async getMyGroupIds(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const userId = req.user?.id;
      if (!companyId || !userId) return res.status(400).json({ error: 'Missing company ID or not authenticated' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const memberships = await prisma.profileGroupMember.findMany({
        where: {
          profile_id: userId,
          group: { ...companyFilter(companyId) },
        },
        select: { group_id: true },
      });
      return res.json({ group_ids: memberships.map((m) => m.group_id) });
    } catch (error) {
      console.error('getMyGroupIds error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listGroups(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const groups = await prisma.profileGroup.findMany({
        where: { ...companyFilter(companyId) },
        orderBy: { name: 'asc' },
      });
      return res.json(groups);
    } catch (error) {
      console.error('listGroups error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async createGroup(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const { name, description } = req.body || {};
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const group = await prisma.profileGroup.create({
        data: {
          company_id: companyId,
          created_by: req.user?.id,
          name: typeof name === 'string' ? name.trim() : 'New Group',
          description: typeof description === 'string' ? description : null,
        },
      });
      return res.status(201).json(group);
    } catch (error) {
      console.error('createGroup error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async updateGroup(req: AuthRequest, res: Response) {
    try {
      const { companyId, groupId } = req.params;
      const { name, description } = req.body || {};
      if (!companyId || !groupId) return res.status(400).json({ error: 'Missing company ID or group ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.profileGroup.updateMany({
        where: { id: groupId, company_id: companyId },
        data: {
          ...(typeof name === 'string' && { name: name.trim() }),
          ...(typeof description === 'string' && { description }),
        },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Group not found' });
      const updated = await prisma.profileGroup.findUnique({ where: { id: groupId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateGroup error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async deleteGroup(req: AuthRequest, res: Response) {
    try {
      const { companyId, groupId } = req.params;
      if (!companyId || !groupId) return res.status(400).json({ error: 'Missing company ID or group ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.profileGroup.deleteMany({
        where: { id: groupId, company_id: companyId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Group not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteGroup error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** GET /api/companies/:companyId/group-members - all memberships for company groups */
  async listAllGroupMembers(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const members = await prisma.profileGroupMember.findMany({
        where: { group: { ...companyFilter(companyId) } },
        select: { profile_id: true, group_id: true },
      });
      return res.json(members);
    } catch (error) {
      console.error('listAllGroupMembers error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listGroupMembers(req: AuthRequest, res: Response) {
    try {
      const { companyId, groupId } = req.params;
      if (!companyId || !groupId) return res.status(400).json({ error: 'Missing company ID or group ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const group = await prisma.profileGroup.findFirst({
        where: { id: groupId, ...companyFilter(companyId) },
        include: { members: { include: { profile: { select: { id: true, email: true, full_name: true } } } } },
      });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      return res.json(group.members);
    } catch (error) {
      console.error('listGroupMembers error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async addGroupMember(req: AuthRequest, res: Response) {
    try {
      const { companyId, groupId } = req.params;
      const { profile_id } = req.body || {};
      if (!companyId || !groupId || !profile_id) return res.status(400).json({ error: 'Missing company ID, group ID or profile_id' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const group = await prisma.profileGroup.findFirst({ where: { id: groupId, company_id: companyId } });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      await prisma.profileGroupMember.create({
        data: { group_id: groupId, profile_id },
      });
      const member = await prisma.profileGroupMember.findFirst({
        where: { group_id: groupId, profile_id },
        include: { profile: { select: { id: true, email: true, full_name: true } } },
      });
      return res.status(201).json(member);
    } catch (error: unknown) {
      const e = error as { code?: string };
      if (e.code === 'P2002') return res.status(400).json({ error: 'Member already in group' });
      console.error('addGroupMember error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async removeGroupMember(req: AuthRequest, res: Response) {
    try {
      const { companyId, groupId, memberId } = req.params;
      if (!companyId || !groupId || !memberId) return res.status(400).json({ error: 'Missing company ID, group ID or member ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const group = await prisma.profileGroup.findFirst({ where: { id: groupId, company_id: companyId } });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const result = await prisma.profileGroupMember.deleteMany({
        where: { id: memberId, group_id: groupId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Member not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('removeGroupMember error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** DELETE /api/companies/:companyId/groups/:groupId/members/by-profile/:profileId */
  async removeGroupMemberByProfile(req: AuthRequest, res: Response) {
    try {
      const { companyId, groupId, profileId } = req.params;
      if (!companyId || !groupId || !profileId) return res.status(400).json({ error: 'Missing company ID, group ID or profile ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const group = await prisma.profileGroup.findFirst({ where: { id: groupId, company_id: companyId } });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const result = await prisma.profileGroupMember.deleteMany({
        where: { group_id: groupId, profile_id: profileId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Member not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('removeGroupMemberByProfile error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  // --- API configurations ---
  async listApiConfigurations(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const configType = req.query.config_type as string | undefined;
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const where: { company_id?: string; config_type?: string } = { ...companyFilter(companyId) };
      if (configType) where.config_type = configType;
      const list = await prisma.apiConfiguration.findMany({ where, orderBy: { name: 'asc' } });
      return res.json(list);
    } catch (error) {
      console.error('listApiConfigurations error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async createApiConfiguration(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const body = req.body || {};
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const config = await prisma.apiConfiguration.create({
        data: {
          company_id: companyId,
          name: body.name || 'New Config',
          description: body.description ?? null,
          config_type: body.config_type || 'custom',
          api_url: body.api_url || '',
          api_method: body.api_method || 'POST',
          api_headers: body.api_headers ?? [],
          api_params: body.api_params ?? [],
          api_data: body.api_data ?? [],
        },
      });
      return res.status(201).json(config);
    } catch (error) {
      console.error('createApiConfiguration error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async updateApiConfiguration(req: AuthRequest, res: Response) {
    try {
      const { companyId, configId } = req.params;
      const body = req.body || {};
      if (!companyId || !configId) return res.status(400).json({ error: 'Missing company ID or config ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.apiConfiguration.updateMany({
        where: { id: configId, company_id: companyId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.config_type !== undefined && { config_type: body.config_type }),
          ...(body.api_url !== undefined && { api_url: body.api_url }),
          ...(body.api_method !== undefined && { api_method: body.api_method }),
          ...(body.api_headers !== undefined && { api_headers: body.api_headers }),
          ...(body.api_params !== undefined && { api_params: body.api_params }),
          ...(body.api_data !== undefined && { api_data: body.api_data }),
        },
      });
      if (result.count === 0) return res.status(404).json({ error: 'API configuration not found' });
      const updated = await prisma.apiConfiguration.findUnique({ where: { id: configId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateApiConfiguration error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async deleteApiConfiguration(req: AuthRequest, res: Response) {
    try {
      const { companyId, configId } = req.params;
      if (!companyId || !configId) return res.status(400).json({ error: 'Missing company ID or config ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.apiConfiguration.deleteMany({
        where: { id: configId, company_id: companyId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'API configuration not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteApiConfiguration error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  // --- Global variables ---
  async listGlobalVariables(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const list = await prisma.dataGlobalVariable.findMany({
        where: { ...companyFilter(companyId) },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      });
      return res.json(list);
    } catch (error) {
      console.error('listGlobalVariables error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async createGlobalVariable(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const body = req.body || {};
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const variable = await prisma.dataGlobalVariable.create({
        data: {
          company_id: companyId,
          name: body.name || 'New Variable',
          key: body.key ?? null,
          variable_type: body.variable_type || 'text',
          position: typeof body.position === 'number' ? body.position : 0,
          options: body.options ?? {},
          value: body.value ?? null,
          is_locked: !!body.is_locked,
        },
      });
      return res.status(201).json(variable);
    } catch (error) {
      console.error('createGlobalVariable error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async updateGlobalVariable(req: AuthRequest, res: Response) {
    try {
      const { companyId, variableId } = req.params;
      const body = req.body || {};
      if (!companyId || !variableId) return res.status(400).json({ error: 'Missing company ID or variable ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.dataGlobalVariable.updateMany({
        where: { id: variableId, company_id: companyId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.key !== undefined && { key: body.key }),
          ...(body.variable_type !== undefined && { variable_type: body.variable_type }),
          ...(body.position !== undefined && { position: body.position }),
          ...(body.options !== undefined && { options: body.options }),
          ...(body.value !== undefined && { value: body.value }),
          ...(body.is_locked !== undefined && { is_locked: body.is_locked }),
        },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Global variable not found' });
      const updated = await prisma.dataGlobalVariable.findUnique({ where: { id: variableId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateGlobalVariable error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async deleteGlobalVariable(req: AuthRequest, res: Response) {
    try {
      const { companyId, variableId } = req.params;
      if (!companyId || !variableId) return res.status(400).json({ error: 'Missing company ID or variable ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.dataGlobalVariable.deleteMany({
        where: { id: variableId, company_id: companyId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Global variable not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteGlobalVariable error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  // --- Data tables ---
  async listDataTables(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const list = await prisma.dataTable.findMany({
        where: { ...companyFilter(companyId) },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        include: { fields: { orderBy: { position: 'asc' } } },
      });
      return res.json(list);
    } catch (error) {
      console.error('listDataTables error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async createDataTable(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const body = req.body || {};
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const table = await prisma.dataTable.create({
        data: {
          company_id: companyId,
          name: body.name || 'New Table',
          description: body.description ?? null,
          position: typeof body.position === 'number' ? body.position : 0,
        },
      });
      return res.status(201).json(table);
    } catch (error) {
      console.error('createDataTable error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async updateDataTable(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId } = req.params;
      const body = req.body || {};
      if (!companyId || !tableId) return res.status(400).json({ error: 'Missing company ID or table ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.dataTable.updateMany({
        where: { id: tableId, company_id: companyId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.position !== undefined && { position: body.position }),
          ...(body.primary_field_id !== undefined && { primary_field_id: body.primary_field_id }),
        },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Data table not found' });
      const updated = await prisma.dataTable.findUnique({ where: { id: tableId }, include: { fields: true } });
      return res.json(updated);
    } catch (error) {
      console.error('updateDataTable error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async deleteDataTable(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId } = req.params;
      if (!companyId || !tableId) return res.status(400).json({ error: 'Missing company ID or table ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.dataTable.deleteMany({
        where: { id: tableId, company_id: companyId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Data table not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteDataTable error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async copyDataTable(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId } = req.params;
      const body = req.body || {};
      if (!companyId || !tableId) return res.status(400).json({ error: 'Missing company ID or table ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const source = await prisma.dataTable.findFirst({
        where: { id: tableId, company_id: companyId },
        include: { fields: true },
      });
      if (!source) return res.status(404).json({ error: 'Data table not found' });
      const newName = typeof body.name === 'string' ? body.name : `${source.name} (copy)`;
      const newTable = await prisma.dataTable.create({
        data: {
          company_id: companyId,
          name: newName,
          description: source.description,
          position: source.position,
        },
      });
      for (const f of source.fields) {
        await prisma.dataTableField.create({
          data: {
            table_id: newTable.id,
            company_id: companyId,
            name: f.name,
            field_type: f.field_type,
            options: f.options === null ? Prisma.JsonNull : f.options,
            position: f.position,
            is_required: f.is_required,
          },
        });
      }
      const created = await prisma.dataTable.findUnique({ where: { id: newTable.id }, include: { fields: true } });
      return res.status(201).json(created);
    } catch (error) {
      console.error('copyDataTable error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listDataTableFields(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId } = req.params;
      if (!companyId || !tableId) return res.status(400).json({ error: 'Missing company ID or table ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const table = await prisma.dataTable.findFirst({
        where: { id: tableId, ...companyFilter(companyId) },
        include: { fields: { orderBy: { position: 'asc' } } },
      });
      if (!table) return res.status(404).json({ error: 'Data table not found' });
      return res.json(table.fields);
    } catch (error) {
      console.error('listDataTableFields error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async createDataTableField(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId } = req.params;
      const body = req.body || {};
      if (!companyId || !tableId) return res.status(400).json({ error: 'Missing company ID or table ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const table = await prisma.dataTable.findFirst({ where: { id: tableId, company_id: companyId } });
      if (!table) return res.status(404).json({ error: 'Data table not found' });
      const field = await prisma.dataTableField.create({
        data: {
          table_id: tableId,
          company_id: companyId,
          name: body.name || 'New Field',
          field_type: body.field_type || 'text',
          options: body.options ?? undefined,
          position: typeof body.position === 'number' ? body.position : 0,
          is_required: !!body.is_required,
        },
      });
      return res.status(201).json(field);
    } catch (error) {
      console.error('createDataTableField error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async updateDataTableField(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId, fieldId } = req.params;
      const body = req.body || {};
      if (!companyId || !tableId || !fieldId) return res.status(400).json({ error: 'Missing company ID, table ID or field ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.dataTableField.updateMany({
        where: { id: fieldId, table_id: tableId, company_id: companyId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.field_type !== undefined && { field_type: body.field_type }),
          ...(body.options !== undefined && { options: body.options }),
          ...(body.position !== undefined && { position: body.position }),
          ...(body.is_required !== undefined && { is_required: body.is_required }),
        },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Field not found' });
      const updated = await prisma.dataTableField.findUnique({ where: { id: fieldId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateDataTableField error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async deleteDataTableField(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId, fieldId } = req.params;
      if (!companyId || !tableId || !fieldId) return res.status(400).json({ error: 'Missing company ID, table ID or field ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.dataTableField.deleteMany({
        where: { id: fieldId, table_id: tableId, company_id: companyId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Field not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteDataTableField error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listDataTableRecords(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId } = req.params;
      if (!companyId || !tableId) return res.status(400).json({ error: 'Missing company ID or table ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const table = await prisma.dataTable.findFirst({ where: { id: tableId, ...companyFilter(companyId) } });
      if (!table) return res.status(404).json({ error: 'Data table not found' });
      const records = await prisma.dataTableRecord.findMany({
        where: { table_id: tableId, ...companyFilter(companyId) },
        orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
      });
      return res.json(records);
    } catch (error) {
      console.error('listDataTableRecords error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async createDataTableRecord(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId } = req.params;
      const body = req.body || {};
      if (!companyId || !tableId) return res.status(400).json({ error: 'Missing company ID or table ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const table = await prisma.dataTable.findFirst({ where: { id: tableId, company_id: companyId } });
      if (!table) return res.status(404).json({ error: 'Data table not found' });
      const record = await prisma.dataTableRecord.create({
        data: {
          table_id: tableId,
          company_id: companyId,
          data: body.data ?? {},
          created_by: req.user?.id ?? null,
          position: typeof body.position === 'number' ? body.position : 0,
        },
      });
      return res.status(201).json(record);
    } catch (error) {
      console.error('createDataTableRecord error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async updateDataTableRecord(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId, recordId } = req.params;
      const body = req.body || {};
      if (!companyId || !tableId || !recordId) return res.status(400).json({ error: 'Missing company ID, table ID or record ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.dataTableRecord.updateMany({
        where: { id: recordId, table_id: tableId, company_id: companyId },
        data: {
          ...(body.data !== undefined && { data: body.data }),
          ...(body.position !== undefined && { position: body.position }),
        },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Record not found' });
      const updated = await prisma.dataTableRecord.findUnique({ where: { id: recordId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateDataTableRecord error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async deleteDataTableRecord(req: AuthRequest, res: Response) {
    try {
      const { companyId, tableId, recordId } = req.params;
      if (!companyId || !tableId || !recordId) return res.status(400).json({ error: 'Missing company ID, table ID or record ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.dataTableRecord.deleteMany({
        where: { id: recordId, table_id: tableId, company_id: companyId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Record not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteDataTableRecord error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  // --- Folders (document management) ---
  async getFolder(req: AuthRequest, res: Response) {
    try {
      const { companyId, folderId } = req.params;
      if (!companyId || !folderId) return res.status(400).json({ error: 'Missing company ID or folder ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, ...companyFilter(companyId) },
      });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
      if (companyId === ALL_COMPANIES) {
        return res.json(folder);
      }
      const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);
      const allowed = await canUserAccessFolder(userId, companyId, folderId, isCompanyAdmin, userGroupIds);
      if (!allowed) return res.status(404).json({ error: 'Folder not found' });
      return res.json(folder);
    } catch (error) {
      console.error('getFolder error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listFolders(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const parentFolderId = req.query.parent_folder_id as string | undefined;
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
      const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);

      const isRootList = parentFolderId === undefined || parentFolderId === '';
      const parentId = isRootList ? null : parentFolderId || null;

      if (companyId !== ALL_COMPANIES && !isRootList && parentId) {
        const parentFolder = await prisma.folder.findFirst({
          where: { id: parentId, ...companyFilter(companyId) },
        });
        if (!parentFolder) return res.status(404).json({ error: 'Folder not found' });
        const allowed = await canUserAccessFolder(userId, companyId, parentId, isCompanyAdmin, userGroupIds);
        if (!allowed) return res.status(403).json({ error: 'You do not have access to this folder' });
      }

      const where: { company_id?: string | null; parent_folder_id?: string | null } = { ...companyFilter(companyId) };
      where.parent_folder_id = parentId;
      let folders = await prisma.folder.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      if (companyId !== ALL_COMPANIES && isRootList && folders.length > 0) {
        const allowedIds = new Set<string>();
        for (const folder of folders) {
          const allowed = await canUserAccessFolder(userId, companyId, folder.id, isCompanyAdmin, userGroupIds);
          if (allowed) allowedIds.add(folder.id);
        }
        folders = folders.filter((f) => allowedIds.has(f.id));
      }

      return res.json(folders);
    } catch (error) {
      console.error('listFolders error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async createFolder(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const { name, description, parent_folder_id } = req.body || {};
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const folder = await prisma.folder.create({
        data: {
          company_id: companyId,
          name: typeof name === 'string' ? name.trim() : 'New Folder',
          description: typeof description === 'string' ? description : null,
          parent_folder_id: parent_folder_id || null,
        },
      });
      return res.status(201).json(folder);
    } catch (error) {
      console.error('createFolder error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async updateFolder(req: AuthRequest, res: Response) {
    try {
      const { companyId, folderId } = req.params;
      const { name, description } = req.body || {};
      if (!companyId || !folderId) return res.status(400).json({ error: 'Missing company ID or folder ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.folder.updateMany({
        where: { id: folderId, company_id: companyId },
        data: {
          ...(typeof name === 'string' && { name: name.trim() }),
          ...(typeof description === 'string' && { description }),
        },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Folder not found' });
      const updated = await prisma.folder.findUnique({ where: { id: folderId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateFolder error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async deleteFolder(req: AuthRequest, res: Response) {
    try {
      const { companyId, folderId } = req.params;
      if (!companyId || !folderId) return res.status(400).json({ error: 'Missing company ID or folder ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.folder.deleteMany({
        where: { id: folderId, company_id: companyId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Folder not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteFolder error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** List folder permissions. Only allowed for root folders (parent_folder_id is null). */
  async listFolderPermissions(req: AuthRequest, res: Response) {
    try {
      const { companyId, folderId } = req.params;
      if (!companyId || !folderId) return res.status(400).json({ error: 'Missing company ID or folder ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, ...companyFilter(companyId) },
        select: { parent_folder_id: true },
      });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      if (folder.parent_folder_id != null) {
        return res.status(400).json({ error: 'Permissions can only be set on root folders' });
      }
      const list = await prisma.folderPermission.findMany({
        where: { folder_id: folderId },
        include: {
          user: { select: { id: true, email: true, full_name: true } },
          group: { select: { id: true, name: true } },
        },
      });
      return res.json(list);
    } catch (error) {
      console.error('listFolderPermissions error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** Add a folder permission (user or group). Only for root folders. permission_type: read | write (read = view/download only; write = upload/delete). */
  async addFolderPermission(req: AuthRequest, res: Response) {
    try {
      const { companyId, folderId } = req.params;
      const { user_id, group_id, permission_type } = req.body || {};
      if (!companyId || !folderId) return res.status(400).json({ error: 'Missing company ID or folder ID' });
      if ((user_id && group_id) || (!user_id && !group_id)) {
        return res.status(400).json({ error: 'Provide exactly one of user_id or group_id' });
      }
      const validTypes = ['read', 'write'];
      const type = typeof permission_type === 'string' && validTypes.includes(permission_type) ? permission_type : 'read';
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, company_id: companyId },
        select: { parent_folder_id: true },
      });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      if (folder.parent_folder_id != null) {
        return res.status(400).json({ error: 'Permissions can only be set on root folders' });
      }
      const perm = await prisma.folderPermission.create({
        data: {
          folder_id: folderId,
          company_id: companyId,
          user_id: user_id || null,
          group_id: group_id || null,
          permission_type: type,
        },
        include: {
          user: { select: { id: true, email: true, full_name: true } },
          group: { select: { id: true, name: true } },
        },
      });
      return res.status(201).json(perm);
    } catch (error: unknown) {
      const e = error as { code?: string };
      if (e.code === 'P2002') return res.status(400).json({ error: 'This user or group already has a permission on this folder' });
      console.error('addFolderPermission error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** Delete a folder permission. */
  async deleteFolderPermission(req: AuthRequest, res: Response) {
    try {
      const { companyId, folderId, permissionId } = req.params;
      if (!companyId || !folderId || !permissionId) return res.status(400).json({ error: 'Missing company ID, folder ID or permission ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, company_id: companyId },
        select: { parent_folder_id: true },
      });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      const result = await prisma.folderPermission.deleteMany({
        where: { id: permissionId, folder_id: folderId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Permission not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteFolderPermission error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listFiles(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const folderId = req.query.folder_id as string | undefined;
      const idsParam = req.query.ids as string | undefined;
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
      const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);

      if (companyId !== ALL_COMPANIES && folderId !== undefined && folderId !== '') {
        const allowed = await canUserAccessFolder(userId, companyId, folderId, isCompanyAdmin, userGroupIds);
        if (!allowed) return res.status(403).json({ error: 'You do not have access to this folder' });
      }

      const where: { company_id?: string; folder_id?: string | { in: string[] }; id?: { in: string[] } } = { ...companyFilter(companyId) };
      if (folderId !== undefined) {
        if (folderId === '') {
          // At root: show no files (only folders). Files are shown when viewing a specific folder.
          where.folder_id = { in: [] };
        } else {
          where.folder_id = folderId;
        }
      }
      if (idsParam && typeof idsParam === 'string') {
        const idList = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
        if (idList.length > 0) where.id = { in: idList };
      }
      let files = await prisma.file.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { metadata_values: { include: { metadata: { select: { id: true, name: true } } } } },
      });
      // When listing by ids (e.g. metadata search), filter out files in folders the user cannot access
      if (idsParam && files.length > 0) {
        const folderIds = [...new Set(files.map((f) => f.folder_id).filter((id): id is string => id != null))];
        const flatFiles = files.filter((f) => f.folder_id == null);
        const allowedFolderIds = new Set<string>();
        for (const fid of folderIds) {
          const allowed = await canUserAccessFolder(userId, companyId, fid, isCompanyAdmin, userGroupIds);
          if (allowed) allowedFolderIds.add(fid);
        }
        const allowedFlatIds = new Set<string>();
        if (flatFiles.length > 0) {
          if (isCompanyAdmin) {
            flatFiles.forEach((f) => allowedFlatIds.add(f.id));
          } else {
            const checks = await Promise.all(
              flatFiles.map(async (f) => {
                const level = await canUserAccessFileByMetadata({
                  userId,
                  companyId,
                  fileId: f.id,
                  isCompanyAdmin,
                  userGroupIds,
                });
                return level ? f.id : null;
              }),
            );
            checks.forEach((id) => {
              if (id) allowedFlatIds.add(id);
            });
          }
        }
        files = files.filter((f) => {
          if (f.folder_id == null) return allowedFlatIds.has(f.id);
          return allowedFolderIds.has(f.folder_id);
        });
      }
      // BigInt (e.g. size_bytes) is not JSON-serializable; convert to number for the response
      const serialized = files.map((f) => ({
        ...f,
        size_bytes: f.size_bytes != null ? Number(f.size_bytes) : 0,
      }));
      return res.json(serialized);
    } catch (error) {
      console.error('listFiles error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async createFile(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const body = req.body || {};
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const userId = req.user?.id ?? null;
      const file = await prisma.file.create({
        data: {
          company_id: companyId,
          name: typeof body.name === 'string' ? body.name : 'file',
          folder_id: body.folder_id ?? null,
          storage_path: typeof body.storage_path === 'string' ? body.storage_path : '',
          size_bytes: typeof body.size_bytes === 'number' ? BigInt(body.size_bytes) : BigInt(0),
          mime_type: typeof body.mime_type === 'string' ? body.mime_type : null,
          uploaded_by: userId,
        },
      });
      return res.status(201).json({
        ...file,
        size_bytes: file.size_bytes?.toString(),
      });
    } catch (error) {
      console.error('createFile error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /** GET /api/companies/:companyId/files/by-metadata?metadata_id=xxx&value=yyy - returns { fileIds: string[] } (only files in folders the user can access) */
  async getFileIdsByMetadata(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const metadataId = req.query.metadata_id as string;
      const value = req.query.value as string | undefined;
      if (!companyId || !metadataId) return res.status(400).json({ error: 'Missing company ID or metadata_id' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const where: { company_id?: string; metadata_id: string; value?: string } = { ...companyFilter(companyId), metadata_id: metadataId };
      if (value !== undefined && value !== '') where.value = value;
      const rows = await prisma.filesMetadataValue.findMany({
        where,
        select: { files_id: true },
      });
      let fileIds = [...new Set(rows.map((r) => r.files_id))];
      if (fileIds.length > 0) {
        const filesWithFolder = await prisma.file.findMany({
          where: { id: { in: fileIds }, ...companyFilter(companyId) },
          select: { id: true, folder_id: true },
        });
        const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
        const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);
        const folderIds = [...new Set(filesWithFolder.map((f) => f.folder_id).filter((id): id is string => id != null))];
        const flatFiles = filesWithFolder.filter((f) => f.folder_id == null);
        const allowedFolderIds = new Set<string>();
        for (const fid of folderIds) {
          const allowed = await canUserAccessFolder(userId, companyId, fid, isCompanyAdmin, userGroupIds);
          if (allowed) allowedFolderIds.add(fid);
        }
        const allowedFlatIds = new Set<string>();
        if (flatFiles.length > 0) {
          if (isCompanyAdmin) {
            flatFiles.forEach((f) => allowedFlatIds.add(f.id));
          } else {
            const checks = await Promise.all(
              flatFiles.map(async (f) => {
                const level = await canUserAccessFileByMetadata({
                  userId,
                  companyId,
                  fileId: f.id,
                  isCompanyAdmin,
                  userGroupIds,
                });
                return level ? f.id : null;
              }),
            );
            checks.forEach((id) => {
              if (id) allowedFlatIds.add(id);
            });
          }
        }
        fileIds = filesWithFolder
          .filter((f) => {
            if (f.folder_id == null) return allowedFlatIds.has(f.id);
            return allowedFolderIds.has(f.folder_id);
          })
          .map((f) => f.id);
      }
      return res.json({ fileIds });
    } catch (error) {
      console.error('getFileIdsByMetadata error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  // --- Agent permissions ---
  async listAgentPermissions(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const list = await prisma.agentPermission.findMany({
        where: { ...companyFilter(companyId) },
        include: {
          agent_configuration: { select: { id: true, name: true, agent_type: true } },
          company: { select: { id: true, name: true } },
        },
      });
      return res.json(list);
    } catch (error) {
      console.error('listAgentPermissions error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async addAgentPermission(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      const { agent_configuration_id, enabled } = req.body || {};
      if (!companyId || !agent_configuration_id) return res.status(400).json({ error: 'Missing company ID or agent_configuration_id' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const perm = await prisma.agentPermission.create({
        data: {
          agent_configuration_id,
          company_id: companyId,
          enabled: enabled !== false,
        },
      });
      return res.status(201).json(perm);
    } catch (error: unknown) {
      const e = error as { code?: string };
      if (e.code === 'P2002') return res.status(400).json({ error: 'Permission already exists for this agent and company' });
      console.error('addAgentPermission error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async updateAgentPermission(req: AuthRequest, res: Response) {
    try {
      const { companyId, permissionId } = req.params;
      const { enabled } = req.body || {};
      if (!companyId || !permissionId) return res.status(400).json({ error: 'Missing company ID or permission ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.agentPermission.updateMany({
        where: { id: permissionId, company_id: companyId },
        data: { ...(typeof enabled === 'boolean' && { enabled }) },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Permission not found' });
      const updated = await prisma.agentPermission.findUnique({ where: { id: permissionId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateAgentPermission error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async deleteAgentPermission(req: AuthRequest, res: Response) {
    try {
      const { companyId, permissionId } = req.params;
      if (!companyId || !permissionId) return res.status(400).json({ error: 'Missing company ID or permission ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);
      const result = await prisma.agentPermission.deleteMany({
        where: { id: permissionId, company_id: companyId },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Permission not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteAgentPermission error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * GET /api/companies/:companyId/agent-usage
   * List agent_usage for this company (read-only). Company admin or super_admin only.
   */
  async listCompanyAgentUsage(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) return res.status(400).json({ error: 'Missing company ID' });
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const list = await prisma.agentUsage.findMany({
        where: { ...companyFilter(companyId) },
        include: {
          agent: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
      });

      const serialized = list.map((row) => ({
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
      }));

      return res.json(serialized);
    } catch (error) {
      console.error('listCompanyAgentUsage error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
};
