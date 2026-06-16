import { Response } from 'express';
import { FilesMetadataValueKind, Prisma } from '@prisma/client';
import { AuthRequest, ALL_COMPANIES, companyFilter } from '../middleware/auth';
import { prisma } from '../lib/prisma';

import {
  assertEnumOptionsNotRemovedWhileInUse,
  assertPredefinedListCoversExistingValues,
  normalizeAllowedValuesInput,
  parseAllowedValuesJson,
  parseValueKindInput,
  validateMetadataValueForKey,
} from '../services/files-metadata-validation';
import { canUserAccessFolder, getUserGroupIdsInCompany } from '../lib/folderAccess';
import { getAccessibleFileIds, canUserAccessFileByMetadata } from '../lib/documentAccess';
import { appendFileHistoryEvent, FILE_HISTORY_EVENT_TYPE, normalizeFileHistoryActorId } from '../lib/fileHistory';
import { storageService } from '../services/storage.service';
import bcrypt from 'bcryptjs';


/**
 * Ensure the authenticated user has access to the company (member of company).
 * Optionally require company_admin role.
 * Company API key (req.company, no req.user) is treated as company_admin for that company only.
 */
async function ensureCompanyAccess(req: AuthRequest, companyId: string, requireAdmin = false) {
  // Company API key: treat as company_admin for that company only
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

function resolvePortalLogoUrl(company: {
  id: string;
  slug: string | null;
  logo_storage_path: string | null;
  logo_url: string | null;
}) {
  const rawLogoUrl =
    company.logo_storage_path && company.slug
      ? `/api/portal/${company.id.slice(0, 6)}_${company.slug}/logo`
      : company.logo_url ?? null;
  return typeof rawLogoUrl === 'string' &&
    rawLogoUrl.startsWith('/api/portal/') &&
    rawLogoUrl.endsWith('/logo') &&
    !company.logo_storage_path
    ? null
    : rawLogoUrl;
}

function resolveInternalLogoUrl(company: {
  id: string;
  internal_logo_storage_path: string | null;
  internal_logo_url: string | null;
}) {
  return company.internal_logo_storage_path
    ? `/api/companies/${company.id}/internal-logo`
    : company.internal_logo_url ?? null;
}

function isValidHexColor(value: string) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}

const SUPPORTED_PORTAL_LANGUAGES = ['fr', 'en', 'de', 'lb', 'pt', 'es'] as const;
type PortalLanguage = (typeof SUPPORTED_PORTAL_LANGUAGES)[number];
const SUPPORTED_PORTAL_LANG_SET = new Set<string>(SUPPORTED_PORTAL_LANGUAGES);

function normalizePortalLanguages(input: unknown, fallback: PortalLanguage = 'en'): PortalLanguage[] {
  const values = Array.isArray(input) ? input : [];
  const normalized = values
    .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
    .filter((v): v is PortalLanguage => SUPPORTED_PORTAL_LANG_SET.has(v));
  const deduped = Array.from(new Set(normalized));
  if (!deduped.includes(fallback)) deduped.unshift(fallback);
  return deduped.length > 0 ? deduped : [fallback];
}

function normalizePortalDefaultLanguage(input: unknown, enabledLanguages: PortalLanguage[]): PortalLanguage {
  const normalized = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (SUPPORTED_PORTAL_LANG_SET.has(normalized) && enabledLanguages.includes(normalized as PortalLanguage)) {
    return normalized as PortalLanguage;
  }
  return enabledLanguages[0] ?? 'en';
}

export const companiesController = {
  /**
   * GET /api/companies
   * List companies (user's companies, or all if super_admin)
   */
  async listCompanies(req: AuthRequest, res: Response) {
    try {
      // Company API key (no user): return the single company the key belongs to (already active, since auth passed)
      if (req.company && !req.user) {
        return res.json([{ id: req.company.id, name: req.company.name, is_active: true }]);
      }

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      // Super admin API key or JWT super_admin: return all companies (with is_active for toggle)
      const superAdmin = req.user?.super_admin ?? await prisma.profileAdminRole.findUnique({ where: { profile_id: userId }, select: { super_admin: true } }).then((r) => r?.super_admin ?? false);
      if (superAdmin) {
        const all = await prisma.company.findMany({
          select: { id: true, name: true, is_active: true },
          orderBy: { name: 'asc' },
        });
        return res.json(all.map((c) => ({ id: c.id, name: c.name, is_active: c.is_active ?? true })));
      }
      const memberships = await prisma.userCompany.findMany({ where: { user_id: userId }, include: { company: { select: { id: true, name: true } } } });
      return res.json(memberships.map((m) => ({ id: m.company.id, name: m.company.name })));
    } catch (error) {
      console.error('listCompanies error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * POST /api/companies
   * Create a new company (super admin only).
   * Auto-generates an API key and seeds system roles.
   */
  async createCompany(req: AuthRequest, res: Response) {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Missing name', details: 'Company name is required' });
      }

      // Prisma middleware auto-generates API key and seeds system roles
      const company = await prisma.company.create({
        data: {
          name: name.trim(),
          is_active: true,
        },
        select: {
          id: true,
          name: true,
          created_at: true,
          api_key: true,
          is_active: true,
        },
      });

      return res.status(201).json(company);
    } catch (error) {
      console.error('createCompany error:', error);
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
          internal_logo_url: true,
          internal_logo_storage_path: true,
          internal_primary_color: true,
          portal_description: true,
          portal_primary_color: true,
          portal_enabled: true,
          portal_default_language: true,
          portal_enabled_languages: true,
        },
      });

      if (!company) {
        return res.status(404).json({ error: 'Company not found', details: 'Company not found' });
      }

      const effectiveLogoUrl = resolvePortalLogoUrl({
        id: company.id,
        slug: company.slug,
        logo_storage_path: company.logo_storage_path,
        logo_url: company.logo_url,
      });
      const effectiveInternalLogoUrl = await resolveInternalLogoUrl({
        id: company.id,
        internal_logo_storage_path: company.internal_logo_storage_path,
        internal_logo_url: company.internal_logo_url,
      });

      // Return full api_key so dashboard can call execution endpoints with x-api-key
      return res.json({
        ...company,
        logo_url: effectiveLogoUrl,
        internal_logo_url: effectiveInternalLogoUrl,
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
      const {
        name,
        is_active,
        regenerate_api_key,
        slug,
        logo_url,
        portal_description,
        portal_primary_color,
        portal_enabled,
        portal_default_language,
        portal_enabled_languages,
        clear_logo_upload,
        internal_logo_url,
        internal_primary_color,
        clear_internal_logo_upload,
      } = req.body;

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

      if ('internal_logo_url' in req.body) {
        const nextInternalLogoUrl = typeof internal_logo_url === 'string' ? internal_logo_url.trim() : '';
        updateData.internal_logo_url = nextInternalLogoUrl || null;
        if (nextInternalLogoUrl) {
          const current = await prisma.company.findUnique({
            where: { id: companyId },
            select: { internal_logo_storage_path: true },
          });
          if (current?.internal_logo_storage_path) {
            const bucket = storageService.getBucketName();
            try {
              await storageService.deleteFile(bucket, current.internal_logo_storage_path);
            } catch (e) {
              console.error('updateCompany: failed to delete internal logo from MinIO:', e);
            }
          }
          updateData.internal_logo_storage_path = null;
        }
      }

      if (clear_internal_logo_upload === true) {
        const current = await prisma.company.findUnique({
          where: { id: companyId },
          select: { internal_logo_storage_path: true },
        });
        if (current?.internal_logo_storage_path) {
          const bucket = storageService.getBucketName();
          try {
            await storageService.deleteFile(bucket, current.internal_logo_storage_path);
          } catch (e) {
            console.error('updateCompany: failed to clear internal logo from MinIO:', e);
          }
          updateData.internal_logo_storage_path = null;
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
        if (color && !isValidHexColor(color)) {
          return res.status(400).json({ error: 'Invalid color', details: 'portal_primary_color must be a valid hex color (e.g. #3B82F6)' });
        }
        updateData.portal_primary_color = color || null;
      }
      if ('internal_primary_color' in req.body) {
        const color = typeof internal_primary_color === 'string' ? internal_primary_color.trim() : '';
        if (color && !isValidHexColor(color)) {
          return res.status(400).json({ error: 'Invalid color', details: 'internal_primary_color must be a valid hex color (e.g. #3B82F6)' });
        }
        updateData.internal_primary_color = color || null;
      }
      if (typeof portal_enabled === 'boolean') updateData.portal_enabled = portal_enabled;
      if ('portal_enabled_languages' in req.body || 'portal_default_language' in req.body) {
        const enabledLanguages = normalizePortalLanguages(portal_enabled_languages);
        const defaultLanguage = normalizePortalDefaultLanguage(portal_default_language, enabledLanguages);

        if (!enabledLanguages.includes(defaultLanguage)) {
          return res.status(400).json({
            error: 'Invalid portal language settings',
            details: 'portal_default_language must be included in portal_enabled_languages',
          });
        }

        updateData.portal_enabled_languages = enabledLanguages;
        updateData.portal_default_language = defaultLanguage;
      }

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
          internal_logo_url: true,
          internal_logo_storage_path: true,
          internal_primary_color: true,
          portal_description: true,
          portal_primary_color: true,
          portal_enabled: true,
          portal_default_language: true,
          portal_enabled_languages: true,
        },
      });

      const effectiveLogoUrl = resolvePortalLogoUrl({
        id: company.id,
        slug: company.slug,
        logo_storage_path: company.logo_storage_path,
        logo_url: company.logo_url,
      });
      const effectiveInternalLogoUrl = await resolveInternalLogoUrl({
        id: company.id,
        internal_logo_storage_path: company.internal_logo_storage_path,
        internal_logo_url: company.internal_logo_url,
      });

      return res.json({ ...company, logo_url: effectiveLogoUrl, internal_logo_url: effectiveInternalLogoUrl });
    } catch (error) {
      console.error('updateCompany error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/companies/:companyId/internal-logo
   * Upload internal application logo (JWT, company admin)
   */
  async uploadInternalLogo(req: AuthRequest, res: Response) {
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
        select: { internal_logo_storage_path: true },
      });
      if (!company) {
        return res.status(404).json({ error: 'Company not found', details: 'Company not found' });
      }

      const extMap: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/svg+xml': 'svg',
        'image/webp': 'webp',
      };
      const ext = extMap[file.mimetype] || 'png';
      const path = `internal-logos/${companyId}/logo.${ext}`;
      const bucket = storageService.getBucketName();

      if (company.internal_logo_storage_path && company.internal_logo_storage_path !== path) {
        try {
          await storageService.deleteFile(bucket, company.internal_logo_storage_path);
        } catch (e) {
          console.error('uploadInternalLogo: failed to delete previous logo from storage:', e);
        }
      }

      await storageService.uploadFile(bucket, path, file.buffer, file.mimetype);

      await prisma.company.update({
        where: { id: companyId },
        data: {
          internal_logo_storage_path: path,
          internal_logo_url: null,
        },
      });

      return res.json({ internal_logo_url: `/api/companies/${companyId}/internal-logo` });
    } catch (error) {
      console.error('uploadInternalLogo error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * DELETE /api/companies/:companyId/internal-logo
   * Remove internal app logo (JWT, company admin)
   */
  async deleteInternalLogo(req: AuthRequest, res: Response) {
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
        select: { internal_logo_storage_path: true },
      });
      if (!company) {
        return res.status(404).json({ error: 'Company not found', details: 'Company not found' });
      }

      if (company.internal_logo_storage_path) {
        const bucket = storageService.getBucketName();
        try {
          await storageService.deleteFile(bucket, company.internal_logo_storage_path);
        } catch (e) {
          console.error('deleteInternalLogo: failed to delete from MinIO:', e);
        }
      }

      await prisma.company.update({
        where: { id: companyId },
        data: { internal_logo_storage_path: null, internal_logo_url: null },
      });

      return res.status(204).send();
    } catch (error) {
      console.error('deleteInternalLogo error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/companies/:companyId/internal-logo
   * Stream uploaded internal app logo (authenticated company access required)
   */
  async getInternalLogo(req: AuthRequest, res: Response) {
    try {
      const { companyId } = req.params;
      if (!companyId) {
        return res.status(400).send();
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { internal_logo_storage_path: true },
      });
      if (!company || !company.internal_logo_storage_path) {
        return res.status(404).send();
      }

      const bucket = storageService.getBucketName();
      const stream = await storageService.downloadFile(bucket, company.internal_logo_storage_path);
      const ext = company.internal_logo_storage_path.split('.').pop()?.toLowerCase();
      const mime: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        svg: 'image/svg+xml',
        webp: 'image/webp',
      };
      const contentType = mime[ext ?? ''] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      stream.pipe(res);
    } catch (error) {
      console.error('getInternalLogo error:', error);
      if (!res.headersSent) {
        res.status(500).send();
      }
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
      const { name, value_kind: bodyKind, allowed_values: bodyAllowed } = req.body;

      if (!companyId) {
        return res.status(400).json({ error: 'Missing company ID', details: 'companyId is required' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const valueKind = parseValueKindInput(bodyKind) ?? FilesMetadataValueKind.free_text;
      const norm = normalizeAllowedValuesInput(bodyAllowed);
      if (!norm.ok) {
        return res.status(400).json({ error: 'Invalid metadata key', details: norm.message });
      }
      if (valueKind === FilesMetadataValueKind.predefined_list && norm.values.length === 0) {
        return res.status(400).json({
          error: 'Invalid metadata key',
          details: 'predefined_list keys require at least one allowed value',
        });
      }

      const key = await prisma.filesMetadataKey.create({
        data: {
          company_id: companyId,
          name: typeof name === 'string' ? name.trim() || null : null,
          value_kind: valueKind,
          allowed_values: valueKind === FilesMetadataValueKind.predefined_list ? norm.values : [],
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
      const { name, value_kind: bodyKind, allowed_values: bodyAllowed } = req.body;

      if (!companyId || !keyId) {
        return res.status(400).json({ error: 'Missing company ID or key ID', details: 'companyId and keyId are required' });
      }

      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) {
        return res.status(access.error.status).json(access.error.body);
      }

      const existing = await prisma.filesMetadataKey.findFirst({
        where: { id: keyId, company_id: companyId },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Metadata key not found', details: 'Key not found or access denied' });
      }

      let nextKind: FilesMetadataValueKind = existing.value_kind;
      if (bodyKind !== undefined) {
        const parsed = parseValueKindInput(bodyKind);
        if (!parsed) {
          return res.status(400).json({ error: 'Invalid value_kind', details: 'Must be free_text or predefined_list' });
        }
        nextKind = parsed;
      }

      let nextAllowed: string[] = parseAllowedValuesJson(existing.allowed_values);
      if (bodyAllowed !== undefined) {
        const norm = normalizeAllowedValuesInput(bodyAllowed);
        if (!norm.ok) {
          return res.status(400).json({ error: 'Invalid allowed_values', details: norm.message });
        }
        nextAllowed = norm.values;
      }

      if (nextKind === FilesMetadataValueKind.predefined_list && nextAllowed.length === 0) {
        return res.status(400).json({
          error: 'Invalid metadata key',
          details: 'predefined_list keys require at least one allowed value',
        });
      }

      const prevKind = existing.value_kind;
      const prevAllowed = parseAllowedValuesJson(existing.allowed_values);

      if (prevKind === FilesMetadataValueKind.predefined_list && nextKind === FilesMetadataValueKind.predefined_list) {
        const removalCheck = await assertEnumOptionsNotRemovedWhileInUse(companyId, keyId, prevAllowed, nextAllowed);
        if (!removalCheck.ok) {
          return res.status(409).json({ error: 'Conflict', details: removalCheck.message });
        }
      }

      if (prevKind === FilesMetadataValueKind.free_text && nextKind === FilesMetadataValueKind.predefined_list) {
        const cover = await assertPredefinedListCoversExistingValues(companyId, keyId, nextAllowed);
        if (!cover.ok) {
          return res.status(409).json({ error: 'Conflict', details: cover.message });
        }
      }

      const data: Prisma.FilesMetadataKeyUpdateInput = {};
      if (typeof name === 'string') data.name = name.trim() || null;
      data.value_kind = nextKind;
      if (nextKind === FilesMetadataValueKind.predefined_list) {
        data.allowed_values = nextAllowed;
      } else {
        data.allowed_values = [];
      }

      await prisma.filesMetadataKey.update({
        where: { id: keyId },
        data,
      });

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

      const existing = await prisma.filesMetadataKey.findFirst({
        where: { id: keyId, company_id: companyId },
        select: { name: true },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Metadata key not found', details: 'Key not found or access denied' });
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

      const file = await prisma.file.findFirst({ where: { id: fileId, company_id: companyId, is_archived: false } });
      if (!file) return res.status(404).json({ error: 'File not found' });

      const list = Array.isArray(entries) ? entries.filter((e) => e && typeof e.key === 'string' && e.key.trim() !== '') : [];
      const keys = await prisma.filesMetadataKey.findMany({
        where: { company_id: companyId },
        select: { id: true, name: true, value_kind: true, allowed_values: true },
      });
      const keyMap = new Map<string, string>();
      const keyById = new Map<string, { value_kind: FilesMetadataValueKind; allowed_values: Prisma.JsonValue }>();
      keys.forEach((k) => {
        if (k.name) keyMap.set(k.name, k.id);
        keyById.set(k.id, { value_kind: k.value_kind, allowed_values: k.allowed_values });
      });

      for (const entry of list) {
        let keyId = keyMap.get(entry.key.trim());
        if (!keyId) {
          const created = await prisma.filesMetadataKey.create({
            data: {
              company_id: companyId,
              name: entry.key.trim(),
              value_kind: FilesMetadataValueKind.free_text,
              allowed_values: [],
            },
            select: { id: true, name: true, value_kind: true, allowed_values: true },
          });
          keyId = created.id;
          if (created.name) keyMap.set(created.name, created.id);
          keyById.set(created.id, { value_kind: created.value_kind, allowed_values: created.allowed_values });
        }
        const row = keyById.get(keyId);
        if (!row) {
          return res.status(500).json({ error: 'Internal error', details: 'Could not resolve metadata key' });
        }
        const val = typeof entry.value === 'string' ? entry.value : String(entry.value ?? '');
        const v = validateMetadataValueForKey(row, val);
        if (!v.ok) {
          return res.status(v.status).json({ error: v.error, details: v.details });
        }
      }

      const existingMeta = await prisma.filesMetadataValue.findMany({
        where: { files_id: fileId, company_id: companyId },
        include: { metadata: { select: { id: true, name: true } } },
      });
      const prevByKeyId = new Map(
        existingMeta.map((r) => [
          r.metadata_id,
          { value: r.value, keyName: r.metadata.name?.trim() || r.metadata_id },
        ]),
      );

      const desired = list.map((entry) => {
        const keyId = keyMap.get(entry.key.trim())!;
        const value = typeof entry.value === 'string' ? entry.value.trim() : String(entry.value).trim();
        return { keyId, value, keyName: entry.key.trim() };
      });
      const desiredIds = new Set(desired.map((d) => d.keyId));

      const metaChanges: Array<{
        key: string;
        keyId: string;
        action: 'add' | 'edit' | 'remove';
        previous?: string;
        next?: string;
      }> = [];
      for (const [kid, prev] of prevByKeyId) {
        if (!desiredIds.has(kid)) {
          metaChanges.push({ key: prev.keyName, keyId: kid, action: 'remove', previous: prev.value });
        }
      }
      for (const d of desired) {
        const prev = prevByKeyId.get(d.keyId);
        if (!prev) {
          metaChanges.push({ key: d.keyName, keyId: d.keyId, action: 'add', next: d.value });
        } else if (prev.value !== d.value) {
          metaChanges.push({
            key: d.keyName,
            keyId: d.keyId,
            action: 'edit',
            previous: prev.value,
            next: d.value,
          });
        }
      }

      await prisma.filesMetadataValue.deleteMany({ where: { files_id: fileId, company_id: companyId } });

      for (const entry of list) {
        const keyId = keyMap.get(entry.key.trim())!;
        await prisma.filesMetadataValue.create({
          data: {
            files_id: fileId,
            metadata_id: keyId,
            value: typeof entry.value === 'string' ? entry.value.trim() : String(entry.value).trim(),
            company_id: companyId,
          },
        });
      }

      if (metaChanges.length > 0) {
        const actorId = normalizeFileHistoryActorId(req.user?.id);
        await appendFileHistoryEvent({
          companyId,
          fileId,
          eventType: FILE_HISTORY_EVENT_TYPE.METADATA_CHANGED,
          actorId,
          details: {
            source: 'replace_all',
            ...(req.company && !req.user ? { actorSource: 'company_api_key' } : {}),
            changes: metaChanges,
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

  /**
   * POST /api/companies/:companyId/users/:userId/reset-password
   * Reset a user's password (super admin)
   */
  async resetUserPassword(req: AuthRequest, res: Response) {
    try {
      const { companyId, userId: targetUserId } = req.params;
      const { password } = req.body || {};

      if (!companyId || !targetUserId) {
        return res.status(400).json({ error: 'Missing company ID or user ID' });
      }

      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Missing required fields', details: 'password is required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      if (!req.user?.super_admin) {
        return res.status(403).json({ error: 'Forbidden', details: 'Super admin only' });
      }

      const targetMembership = await prisma.userCompany.findFirst({
        where: { user_id: targetUserId, company_id: companyId },
        select: { user_id: true },
      });

      if (!targetMembership) {
        return res.status(404).json({ error: 'User not found', details: 'The user does not belong to this company' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await prisma.user.updateMany({
        where: { id: targetUserId },
        data: { encrypted_password: hashedPassword },
      });

      if (result.count === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('resetUserPassword error:', error);
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
      const includeArchivedParam = String(req.query.includeArchived ?? '').toLowerCase() === 'true';
      const includeArchived = includeArchivedParam && isCompanyAdmin;
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
      const includeArchivedParam = String(req.query.includeArchived ?? '').toLowerCase() === 'true';
      const includeArchived = includeArchivedParam && isCompanyAdmin;
      const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);

      if (companyId !== ALL_COMPANIES && folderId !== undefined && folderId !== '') {
        const allowed = await canUserAccessFolder(userId, companyId, folderId, isCompanyAdmin, userGroupIds);
        if (!allowed) return res.status(403).json({ error: 'You do not have access to this folder' });
      }

      const where: { company_id?: string; folder_id?: string | { in: string[] }; id?: { in: string[] }; is_archived?: boolean } = { ...companyFilter(companyId) };
      if (!includeArchived) {
        where.is_archived = false;
      }
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
      await appendFileHistoryEvent({
        companyId,
        fileId: file.id,
        eventType: FILE_HISTORY_EVENT_TYPE.FILE_UPLOADED,
        actorId: normalizeFileHistoryActorId(userId),
        details: {
          name: file.name,
          source: 'api_create_file',
          ...(req.company && !req.user ? { actorSource: 'company_api_key' } : {}),
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
          where: { id: { in: fileIds }, ...companyFilter(companyId), is_archived: false },
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

  /**
   * GET /api/companies/:companyId/files/:fileId/history
   * Timeline of file events (same read access as document preview).
   */
  async getFileHistory(req: AuthRequest, res: Response) {
    try {
      const { companyId, fileId } = req.params;
      if (!companyId || !fileId) {
        return res.status(400).json({ error: 'Missing company ID or file ID' });
      }
      const access = await ensureCompanyAccess(req, companyId);
      if (access.error) return res.status(access.error.status).json(access.error.body);

      const file = await prisma.file.findFirst({
        where: { id: fileId, company_id: companyId },
        select: { id: true, folder_id: true, is_archived: true },
      });
      if (!file || file.is_archived) {
        return res.status(404).json({ error: 'File not found' });
      }

      const isPrivileged =
        req.user?.super_admin === true
        || (!!req.company && !req.user)
        || access.userCompany?.role === 'company_admin';

      const userId = req.user?.id;
      if (!isPrivileged) {
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
        const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);
        if (file.folder_id) {
          const allowed = await canUserAccessFolder(userId, companyId, file.folder_id, isCompanyAdmin, userGroupIds);
          if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        } else {
          const level = await canUserAccessFileByMetadata({
            userId,
            companyId,
            fileId: file.id,
            isCompanyAdmin,
            userGroupIds,
          });
          if (level == null) return res.status(403).json({ error: 'Forbidden' });
        }
      }

      const events = await prisma.fileHistoryEvent.findMany({
        where: { file_id: fileId, company_id: companyId },
        orderBy: { created_at: 'asc' },
        include: { actor: { select: { id: true, email: true, full_name: true } } },
      });

      return res.json({
        events: events.map((e) => ({
          id: e.id,
          eventType: e.event_type,
          createdAt: e.created_at.toISOString(),
          actor: e.actor
            ? { id: e.actor.id, email: e.actor.email, fullName: e.actor.full_name }
            : null,
          details: e.details ?? null,
        })),
      });
    } catch (error) {
      console.error('getFileHistory error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

};
