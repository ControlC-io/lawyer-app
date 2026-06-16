import { Response } from 'express';
import { FilesMetadataValueKind, Prisma } from '@prisma/client';

import { AuthRequest, ALL_COMPANIES, companyFilter } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getAccessibleFileIds, getAccessibleFileIdsWithLevels, buildVirtualTree, getAllowedMetadataValues, canUserAccessFileByMetadata } from '../lib/documentAccess';
import { getUserGroupIdsInCompany } from '../lib/folderAccess';
import {
  assertMetadataValueAllowed,
  parseAllowedValuesJson,
  validateMetadataValueForKey,
} from '../services/files-metadata-validation';
import {
  extractAndApplyMetadataFromOcr,
  type ExtractMetadataFromOcrHttpError,
} from '../services/metadata-from-ocr-extraction.service';
import {
  appendFileHistoryEvent,
  FILE_HISTORY_EVENT_TYPE,
  normalizeFileHistoryActorId,
} from '../lib/fileHistory';

async function ensureCompanyAccess(req: AuthRequest, companyId: string) {
  if (req.company && !req.user) {
    if (req.company.id !== companyId) {
      return { error: { status: 403, body: { error: 'Forbidden', details: 'API key is not valid for this company' } } };
    }
    return { userCompany: { role: 'company_admin' } };
  }

  const userId = req.user?.id;
  if (!userId) {
    return { error: { status: 401, body: { error: 'Unauthorized', details: 'Authentication required' } } };
  }
  if (req.user?.super_admin) return {};
  if (companyId === ALL_COMPANIES) {
    return { error: { status: 403, body: { error: 'Forbidden', details: 'companyId=all is reserved for super admin' } } };
  }
  const userCompany = await prisma.userCompany.findFirst({
    where: { user_id: userId, company_id: companyId },
  });
  if (!userCompany) {
    return { error: { status: 403, body: { error: 'Forbidden', details: 'You do not have access to this company' } } };
  }
  return { userCompany };
}

async function resolveCompanyFolderId(
  companyId: string,
  folderId: unknown,
): Promise<{ folderId: string | null } | { error: string; status: number }> {
  if (folderId === undefined || folderId === null || folderId === '') {
    return { folderId: null };
  }
  if (typeof folderId !== 'string') {
    return { error: 'folderId must be a string', status: 400 };
  }
  const trimmed = folderId.trim();
  if (!trimmed) return { folderId: null };
  const folder = await prisma.folder.findFirst({
    where: { id: trimmed, company_id: companyId },
    select: { id: true },
  });
  if (!folder) {
    return { error: 'Invalid folderId for this company', status: 400 };
  }
  return { folderId: folder.id };
}

function sanitizeFlatFileName(original: string): string {
  return original
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '') || 'file';
}

function splitNameAndExtension(fileName: string): { base: string; extension: string } {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return { base: trimmed, extension: '' };
  }
  return {
    base: trimmed.slice(0, lastDot),
    extension: trimmed.slice(lastDot),
  };
}

function sanitizeFileRenameBase(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/^[. ]+/g, '')
    .trim();
}

async function assertFlatDocumentWriteAccess(
  req: AuthRequest,
  companyId: string,
  res: Response,
): Promise<boolean> {
  const access = await ensureCompanyAccess(req, companyId);
  if (access.error) {
    res.status(access.error.status).json(access.error.body);
    return false;
  }

  const userId = req.user?.id ?? null;
  const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
  if (!userId && !isCompanyAdmin) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  if (!isCompanyAdmin) {
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);
    const rules = await prisma.documentPermissionRule.findMany({
      where: {
        company_id: companyId,
        permission_type: 'write',
        assignments: {
          some: {
            OR: [
              { user_id: userId },
              ...(userGroupIds.length > 0 ? [{ group_id: { in: userGroupIds } }] : []),
            ],
          },
        },
      },
      select: { id: true },
      take: 1,
    });
    if (rules.length === 0) {
      res.status(403).json({ error: 'Forbidden', details: 'No write access rules assigned to you' });
      return false;
    }
  }
  return true;
}

function normalizeDocumentTypeMetadataKeyIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id ?? '').trim()).filter(Boolean))];
}

function documentTypeMetadataKeyIdsFromJson(raw: Prisma.JsonValue): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean);
}


export const documentsController = {
  // ─── Permission Rules CRUD ───

  async listPermissionRules(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const rules = await prisma.documentPermissionRule.findMany({
      where: { ...companyFilter(companyId) },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, email: true, full_name: true } },
            group: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return res.json(rules);
  },

  async createPermissionRule(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const { name, permission_type, conditions } = req.body || {};
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const validTypes = ['read', 'write'];
    const type = typeof permission_type === 'string' && validTypes.includes(permission_type) ? permission_type : 'read';
    const conds = Array.isArray(conditions) ? conditions.filter(
      (c: unknown) => c && typeof c === 'object' && typeof (c as Record<string, unknown>).key_id === 'string',
    ) : [];

    const rule = await prisma.documentPermissionRule.create({
      data: {
        company_id: companyId,
        name: name.trim(),
        permission_type: type,
        conditions: conds,
      },
      include: { assignments: true },
    });
    return res.status(201).json(rule);
  },

  async updatePermissionRule(req: AuthRequest, res: Response) {
    const { companyId, ruleId } = req.params;
    const { name, permission_type, conditions } = req.body || {};
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const existing = await prisma.documentPermissionRule.findFirst({
      where: { id: ruleId, company_id: companyId },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const data: Record<string, unknown> = {};
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (typeof permission_type === 'string' && ['read', 'write'].includes(permission_type)) data.permission_type = permission_type;
    if (Array.isArray(conditions)) {
      data.conditions = conditions.filter(
        (c: unknown) => c && typeof c === 'object' && typeof (c as Record<string, unknown>).key_id === 'string',
      );
    }

    const updated = await prisma.documentPermissionRule.update({
      where: { id: ruleId },
      data,
      include: {
        assignments: {
          include: {
            user: { select: { id: true, email: true, full_name: true } },
            group: { select: { id: true, name: true } },
          },
        },
      },
    });
    return res.json(updated);
  },

  async deletePermissionRule(req: AuthRequest, res: Response) {
    const { companyId, ruleId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const result = await prisma.documentPermissionRule.deleteMany({
      where: { id: ruleId, company_id: companyId },
    });
    if (result.count === 0) return res.status(404).json({ error: 'Rule not found' });
    return res.status(204).send();
  },

  // ─── Permission Assignments ───

  async addPermissionAssignment(req: AuthRequest, res: Response) {
    const { companyId, ruleId } = req.params;
    const { user_id, group_id } = req.body || {};
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    if ((user_id && group_id) || (!user_id && !group_id)) {
      return res.status(400).json({ error: 'Provide exactly one of user_id or group_id' });
    }

    const rule = await prisma.documentPermissionRule.findFirst({
      where: { id: ruleId, company_id: companyId },
    });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const assignment = await prisma.documentPermissionAssignment.create({
      data: {
        rule_id: ruleId,
        company_id: companyId,
        user_id: user_id || null,
        group_id: group_id || null,
      },
      include: {
        user: { select: { id: true, email: true, full_name: true } },
        group: { select: { id: true, name: true } },
      },
    });
    return res.status(201).json(assignment);
  },

  async removePermissionAssignment(req: AuthRequest, res: Response) {
    const { companyId, ruleId, assignmentId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const result = await prisma.documentPermissionAssignment.deleteMany({
      where: { id: assignmentId, rule_id: ruleId, company_id: companyId },
    });
    if (result.count === 0) return res.status(404).json({ error: 'Assignment not found' });
    return res.status(204).send();
  },

  // ─── Flat File Listing (metadata-permission-filtered) ───

  async listFlatFiles(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const userId = req.user?.id ?? '';
    const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
    const includeArchivedParam = String(req.query.includeArchived ?? '').toLowerCase() === 'true';
    const includeArchived = includeArchivedParam && isCompanyAdmin;
    const userGroupIds = userId
      ? await getUserGroupIdsInCompany(userId, companyId)
      : [];

    // Super admin 'all': return all files across companies without permission filtering
    if (companyId === ALL_COMPANIES && req.user?.super_admin) {
      const files = await prisma.file.findMany({
        where: includeArchived ? undefined : { is_archived: false },
        orderBy: { name: 'asc' },
        include: {
          metadata_values: { include: { metadata: { select: { id: true, name: true } } } },
        },
      });
      const serialized = files.map((f) => ({
        ...f,
        size_bytes: f.size_bytes != null ? Number(f.size_bytes) : 0,
        accessLevel: 'write',
      }));
      return res.json({ files: serialized, hasWriteAccess: true });
    }

    // Parse metadata filters from query: ?filters=[{"key_id":"x","value":"y"}] or [{"key_id":"x","missing":true}]
    let metadataFilters: Array<{ key_id: string; value: string }> | undefined;
    let missingKeyFilters: string[] | undefined;
    const filtersParam = req.query.filters as string | undefined;
    if (filtersParam) {
      try {
        const parsed = JSON.parse(filtersParam);
        if (Array.isArray(parsed)) {
          const positiveFilters: Array<{ key_id: string; value: string }> = [];
          const missingKeys: string[] = [];
          for (const f of parsed) {
            if (f && typeof f === 'object' && typeof f.key_id === 'string') {
              if (f.missing === true) {
                missingKeys.push(f.key_id);
              } else if (typeof f.value === 'string') {
                positiveFilters.push({ key_id: f.key_id, value: f.value });
              }
            }
          }
          if (positiveFilters.length > 0) metadataFilters = positiveFilters;
          if (missingKeys.length > 0) missingKeyFilters = missingKeys;
        }
      } catch {
        // ignore invalid JSON
      }
    }

    const { fileIds: accessibleIds, writeFileIds, hasAnyWriteRule } = await getAccessibleFileIdsWithLevels({
      userId,
      companyId,
      isCompanyAdmin,
      userGroupIds,
      metadataFilters,
      missingKeyFilters,
    });

    if (accessibleIds.length === 0) return res.json({ files: [], hasWriteAccess: hasAnyWriteRule });

    // Full-text search in OCR content (prefix matching enabled)
    const searchQuery = req.query.q as string | undefined;
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      // Build a prefix tsquery: each word gets :* so "Richm" matches "Richmond"
      const prefixQuery = q
        .replace(/[^\w\s]/g, ' ')  // strip special chars to prevent tsquery syntax errors
        .split(/\s+/)
        .filter(Boolean)
        .map(word => `${word}:*`)
        .join(' & ');
      const searchResults = await prisma.$queryRaw`
        SELECT
          f.id,
          f.name,
          f.storage_path,
          f.mime_type,
          f.size_bytes::text as size_bytes_str,
          f.created_at,
          f.company_id,
          f.ocr_status AS "ocr_status",
          ts_rank(to_tsvector('simple', coalesce(f.ocr_markdown, '')), to_tsquery('simple', ${prefixQuery})) AS rank,
          ts_headline(
            'simple',
            coalesce(f.ocr_markdown, ''),
            to_tsquery('simple', ${prefixQuery}),
            'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, ShortWord=3, MaxFragments=2, FragmentDelimiter= … '
          ) AS "ocrSnippet"
        FROM "files" f
        WHERE f.company_id = ${companyId}::uuid
          AND f.id = ANY(${accessibleIds}::uuid[])
          ${includeArchived ? Prisma.empty : Prisma.sql`AND f.is_archived = false`}
          AND to_tsvector('simple', coalesce(f.ocr_markdown, '')) @@ to_tsquery('simple', ${prefixQuery})
        ORDER BY rank DESC
        LIMIT 100
      ` as any[];

      const searchResultIds = searchResults.map((r: any) => r.id as string);
      const filesWithMetadata = searchResultIds.length > 0
        ? await prisma.file.findMany({
            where: {
              id: { in: searchResultIds },
              ...companyFilter(companyId),
              ...(includeArchived ? {} : { is_archived: false }),
            },
            include: {
              metadata_values: {
                include: { metadata: { select: { id: true, name: true } } },
              },
            },
          })
        : [];
      const filesById = new Map(filesWithMetadata.map((f) => [f.id, f]));

      const results = searchResults.map((r: any) => {
        const fileDetails = filesById.get(r.id);
        return {
          ...r,
          ...(fileDetails ?? {}),
          size_bytes: fileDetails
            ? (fileDetails.size_bytes != null ? Number(fileDetails.size_bytes) : 0)
            : (r.size_bytes_str ? Number(r.size_bytes_str) : 0),
          metadata_values: fileDetails?.metadata_values ?? [],
          ocr_status: fileDetails?.ocr_status ?? r.ocr_status ?? r.ocrStatus ?? null,
          ocr_error: fileDetails?.ocr_error ?? null,
          ocr_processed_at: fileDetails?.ocr_processed_at ?? null,
          ocrSnippet: r.ocrSnippet,
          ocrSearchRank: r.rank ? Number(r.rank) : 0,
          accessLevel: writeFileIds.has(r.id) ? 'write' : 'read',
        };
      });

      return res.json({ files: results, hasWriteAccess: hasAnyWriteRule, searchActive: true });
    }

    // For non-admins, get allowed metadata values to filter out unauthorized values
    const allowedValues = await getAllowedMetadataValues({
      userId,
      companyId,
      isCompanyAdmin,
      userGroupIds,
    });

    const files = await prisma.file.findMany({
      where: {
        id: { in: accessibleIds },
        ...companyFilter(companyId),
        ...(includeArchived ? {} : { is_archived: false }),
      },
      orderBy: { name: 'asc' },
      include: {
        metadata_values: {
          include: { metadata: { select: { id: true, name: true } } },
        },
      },
    });

    const serialized = files.map((f) => ({
      ...f,
      size_bytes: f.size_bytes != null ? Number(f.size_bytes) : 0,
      accessLevel: writeFileIds.has(f.id) ? 'write' : 'read',
      metadata_values: allowedValues
        ? f.metadata_values.filter((mv) => {
            const allowedSet = allowedValues.get(mv.metadata_id);
            return !allowedSet || allowedSet.has(mv.value);
          })
        : f.metadata_values,
    }));

    return res.json({ files: serialized, hasWriteAccess: hasAnyWriteRule });
  },

  async listMetadataValueSuggestions(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const metadataKeyId = String(req.query.metadata_key_id ?? '').trim();
    if (!metadataKeyId) {
      return res.status(400).json({ error: 'metadata_key_id is required' });
    }

    const userId = req.user?.id ?? '';
    const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
    const userGroupIds = userId ? await getUserGroupIdsInCompany(userId, companyId) : [];
    const queryText = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const key = await prisma.filesMetadataKey.findFirst({
      where: { id: metadataKeyId, ...companyFilter(companyId) },
      select: { id: true },
    });
    if (!key) {
      return res.status(404).json({ error: 'Metadata key not found' });
    }

    const { fileIds: accessibleIds } = await getAccessibleFileIdsWithLevels({
      userId,
      companyId,
      isCompanyAdmin,
      userGroupIds,
    });

    if (accessibleIds.length === 0) {
      return res.json({ values: [] });
    }

    const valueRows = await prisma.filesMetadataValue.findMany({
      where: {
        company_id: companyId,
        metadata_id: metadataKeyId,
        files_id: { in: accessibleIds },
        ...(queryText
          ? {
              value: {
                contains: queryText,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: { value: true },
      distinct: ['value'],
      orderBy: { value: 'asc' },
      take: 400,
    });

    const allowedValues = await getAllowedMetadataValues({
      userId,
      companyId,
      isCompanyAdmin,
      userGroupIds,
    });
    const allowedForKey = allowedValues?.get(metadataKeyId);

    const values = allowedForKey
      ? valueRows.map((row) => row.value).filter((value) => allowedForKey.has(value))
      : valueRows.map((row) => row.value);

    return res.json({ values });
  },

  // ─── Virtual Tree ───

  async getVirtualTree(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const userId = req.user?.id ?? '';
    const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
    const includeArchivedParam = String(req.query.includeArchived ?? '').toLowerCase() === 'true';
    const includeArchived = includeArchivedParam && isCompanyAdmin;

    let accessibleIds: string[];
    if (companyId === ALL_COMPANIES && req.user?.super_admin) {
      const allFiles = await prisma.file.findMany({
        where: includeArchived ? undefined : { is_archived: false },
        select: { id: true },
      });
      accessibleIds = allFiles.map((f) => f.id);
    } else {
      const userGroupIds = userId ? await getUserGroupIdsInCompany(userId, companyId) : [];
      accessibleIds = await getAccessibleFileIds({
        userId: userId || 'api-key',
        companyId,
        isCompanyAdmin,
        userGroupIds,
      });
    }

    let treeConfig: { key_order: unknown; hide_key_labels: boolean } | null = null;
    if (companyId !== ALL_COMPANIES && userId) {
      treeConfig = await prisma.userDocumentTreeConfig.findUnique({
        where: { user_id_company_id: { user_id: userId, company_id: companyId } },
      });
    }

    if (accessibleIds.length === 0) {
      return res.json({
        tree: [],
        keyOrder: [],
        totalFiles: 0,
        hide_key_labels: treeConfig?.hide_key_labels ?? false,
      });
    }

    // Get files
    const files = await prisma.file.findMany({
      where: {
        id: { in: accessibleIds },
        ...companyFilter(companyId),
        ...(includeArchived ? {} : { is_archived: false }),
      },
      select: { id: true, name: true },
    });

    // Get all metadata for these files
    const metadataRows = await prisma.filesMetadataValue.findMany({
      where: { files_id: { in: accessibleIds }, ...companyFilter(companyId) },
      select: { files_id: true, metadata_id: true, value: true },
    });

    // For non-admins, get allowed metadata values per rule condition key
    const allowedValues = (companyId === ALL_COMPANIES && req.user?.super_admin) ? null : await getAllowedMetadataValues({
      userId,
      companyId,
      isCompanyAdmin,
      userGroupIds: companyId !== ALL_COMPANIES ? await getUserGroupIdsInCompany(userId, companyId) : [],
    });

    const metadata: Record<string, Record<string, string[]>> = {};
    for (const m of metadataRows) {
      // Filter out values that the user's rules don't grant access to
      if (allowedValues) {
        const allowedSet = allowedValues.get(m.metadata_id);
        if (allowedSet && !allowedSet.has(m.value)) continue;
      }
      if (!metadata[m.files_id]) metadata[m.files_id] = {};
      if (!metadata[m.files_id][m.metadata_id]) metadata[m.files_id][m.metadata_id] = [];
      metadata[m.files_id][m.metadata_id].push(m.value);
    }

    const keyIds: string[] = Array.isArray(treeConfig?.key_order) ? (treeConfig.key_order as string[]) : [];

    // Only keep keys that actually appear on accessible files
    const accessibleKeyIdSet = new Set(metadataRows.map((m) => m.metadata_id));

    // Resolve key names (filtered to accessible keys only)
    let keyOrder: Array<{ id: string; name: string }> = [];
    const filteredKeyIds = keyIds.filter((id) => accessibleKeyIdSet.has(id));
    if (filteredKeyIds.length > 0) {
      const keys = await prisma.filesMetadataKey.findMany({
        where: { id: { in: filteredKeyIds }, ...companyFilter(companyId) },
        select: { id: true, name: true },
      });
      const keyMap = new Map(keys.map((k) => [k.id, k.name || k.id]));
      keyOrder = filteredKeyIds.filter((id) => keyMap.has(id)).map((id) => ({ id, name: keyMap.get(id)! }));
    }

    const tree = buildVirtualTree(files, metadata, keyOrder);

    return res.json({
      tree,
      keyOrder,
      totalFiles: files.length,
      hide_key_labels: treeConfig?.hide_key_labels ?? false,
    });
  },

  // ─── Tree Config ───

  async getTreeConfig(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const userId = req.user?.id;
    if (!userId && !(access.userCompany?.role === 'company_admin')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!userId) return res.json({ key_order: [], hide_key_labels: false }); // API key: no per-user config

    const config = await prisma.userDocumentTreeConfig.findUnique({
      where: { user_id_company_id: { user_id: userId, company_id: companyId } },
    });

    return res.json(config || { key_order: [], hide_key_labels: false });
  },

  async updateTreeConfig(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const { key_order, hide_key_labels } = req.body || {};
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ error: 'Tree config is per-user; JWT required' });
    }

    if (!Array.isArray(key_order)) {
      return res.status(400).json({ error: 'key_order must be an array of metadata key IDs' });
    }

    if (hide_key_labels !== undefined && typeof hide_key_labels !== 'boolean') {
      return res.status(400).json({ error: 'hide_key_labels must be a boolean when provided' });
    }

    const config = await prisma.userDocumentTreeConfig.upsert({
      where: { user_id_company_id: { user_id: userId, company_id: companyId } },
      update: {
        key_order,
        ...(typeof hide_key_labels === 'boolean' ? { hide_key_labels } : {}),
      },
      create: {
        user_id: userId,
        company_id: companyId,
        key_order,
        hide_key_labels: typeof hide_key_labels === 'boolean' ? hide_key_labels : false,
      },
    });

    return res.json(config);
  },

  // ─── Flat Upload (no folder required) ───

  async uploadFlatFile(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const userId = req.user?.id ?? null;
    const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
    if (!userId && !isCompanyAdmin) return res.status(401).json({ error: 'Unauthorized' });
    if (!isCompanyAdmin) {
      // Check if user has any write permission rules (userId is defined when !isCompanyAdmin due to check above)
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);
      const rules = await prisma.documentPermissionRule.findMany({
        where: {
          company_id: companyId,
          permission_type: 'write',
          assignments: {
            some: {
              OR: [
                { user_id: userId },
                ...(userGroupIds.length > 0 ? [{ group_id: { in: userGroupIds } }] : []),
              ],
            },
          },
        },
        select: { id: true },
        take: 1,
      });
      if (rules.length === 0) {
        return res.status(403).json({ error: 'Forbidden', details: 'No write access rules assigned to you' });
      }
    }

    const uploaded = (req as AuthRequest & { files?: Express.Multer.File[] }).files;
    if (!uploaded || !Array.isArray(uploaded) || uploaded.length === 0) {
      return res.status(400).json({ error: 'No file provided' });
    }
    if (uploaded.length > 25) {
      return res.status(400).json({ error: 'At most 25 files per upload' });
    }

    const metadataParam = req.body?.metadata;
    let parsedMetadata: Array<{ key_id: string; value: string }> | null = null;
    if (metadataParam !== undefined && metadataParam !== null && metadataParam !== '') {
      try {
        const entries: Array<{ key_id: string; value: string }> = typeof metadataParam === 'string'
          ? JSON.parse(metadataParam)
          : metadataParam;
        if (!Array.isArray(entries)) {
          return res.status(400).json({ error: 'metadata must be a JSON array' });
        }
        for (const entry of entries) {
          if (entry?.key_id && typeof entry.value === 'string') {
            const check = await assertMetadataValueAllowed(companyId, entry.key_id, entry.value);
            if (!check.ok) {
              return res.status(check.status).json({ error: check.error, details: check.details });
            }
          }
        }
        parsedMetadata = entries.filter((e) => e?.key_id && typeof e.value === 'string');
      } catch {
        return res.status(400).json({ error: 'Invalid metadata JSON' });
      }
    }

    const { storageService: storage } = await import('../services/storage.service');
    const ocrRequested = req.body?.ocr === 'true';
    const { processDocumentOcr } = await import('../services/ocr.service');
    const extractMetadataRenameInstructions =
      typeof req.body?.extractMetadataRenameInstructions === 'string' && req.body.extractMetadataRenameInstructions.trim().length > 0
        ? req.body.extractMetadataRenameInstructions.trim()
        : undefined;

    let pendingExtractKeyIds: string[] | null = null;
    if (ocrRequested) {
      const rawExtract = req.body?.extractMetadataKeyIds;
      if (rawExtract !== undefined && rawExtract !== null && rawExtract !== '') {
        try {
          const parsed: unknown =
            typeof rawExtract === 'string' ? JSON.parse(rawExtract) : rawExtract;
          if (!Array.isArray(parsed)) {
            return res.status(400).json({ error: 'extractMetadataKeyIds must be a JSON array' });
          }
          const ids = [...new Set(parsed.map((id: unknown) => String(id).trim()).filter(Boolean))];
          if (ids.length === 0) {
            return res.status(400).json({ error: 'extractMetadataKeyIds must contain at least one id' });
          }
          const keyRows = await prisma.filesMetadataKey.findMany({
            where: { company_id: companyId, id: { in: ids } },
            select: { id: true },
          });
          if (keyRows.length !== ids.length) {
            return res.status(400).json({ error: 'One or more extractMetadataKeyIds are invalid for this company' });
          }
          pendingExtractKeyIds = ids;
        } catch {
          return res.status(400).json({ error: 'Invalid extractMetadataKeyIds JSON' });
        }
      }
    }

    const baseTs = Date.now();
    const resolvedUploadFolder = await resolveCompanyFolderId(companyId, req.body?.folderId);
    if ('error' in resolvedUploadFolder) {
      return res.status(resolvedUploadFolder.status).json({ error: resolvedUploadFolder.error });
    }
    const uploadFolderId = resolvedUploadFolder.folderId;

    const created: Array<{
      id: string;
      name: string;
      storage_path: string;
      mime_type: string;
      size_bytes: number;
      ocr_status: string | null;
      metadata_ai_extract_status?: string | null;
    }> = [];

    for (let i = 0; i < uploaded.length; i++) {
      const file = uploaded[i];
      const sanitized = file.originalname
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '') || 'file';

      const storagePath = `companies/${companyId}/flat/${baseTs}_${i}_${sanitized}`;

      await storage.getClient().putObject(
        'documents',
        storagePath,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype },
      );

      const dbFile = await prisma.file.create({
        data: {
          company_id: companyId,
          name: file.originalname,
          storage_path: storagePath,
          mime_type: file.mimetype,
          size_bytes: BigInt(file.size),
          uploaded_by: userId,
          folder_id: uploadFolderId,
          ...(pendingExtractKeyIds && pendingExtractKeyIds.length > 0
            ? {
                ocr_pending_metadata_key_ids: {
                  metadataKeyIds: pendingExtractKeyIds,
                  ...(extractMetadataRenameInstructions
                    ? { renameInstructions: extractMetadataRenameInstructions }
                    : {}),
                },
                metadata_ai_extract_status: 'pending',
              }
            : {}),
        },
      });

      await appendFileHistoryEvent({
        companyId,
        fileId: dbFile.id,
        eventType: FILE_HISTORY_EVENT_TYPE.FILE_UPLOADED,
        actorId: normalizeFileHistoryActorId(userId),
        details: { name: dbFile.name },
      });

      if (parsedMetadata && parsedMetadata.length > 0) {
        for (const entry of parsedMetadata) {
          await prisma.filesMetadataValue.create({
            data: {
              files_id: dbFile.id,
              metadata_id: entry.key_id,
              value: entry.value.trim(),
              company_id: companyId,
            },
          });
        }
        const keyIds = [...new Set(parsedMetadata.map((e) => e.key_id))];
        const metaKeys = await prisma.filesMetadataKey.findMany({
          where: { id: { in: keyIds } },
          select: { id: true, name: true },
        });
        const idToName = new Map(metaKeys.map((k) => [k.id, k.name?.trim() || k.id]));
        const changes = parsedMetadata.map((e) => ({
          key: idToName.get(e.key_id) || e.key_id,
          keyId: e.key_id,
          action: 'add' as const,
          next: e.value.trim(),
        }));
        await appendFileHistoryEvent({
          companyId,
          fileId: dbFile.id,
          eventType: FILE_HISTORY_EVENT_TYPE.METADATA_CHANGED,
          actorId: normalizeFileHistoryActorId(userId),
          details: { source: 'upload', changes },
        });
      }

      if (ocrRequested) {
        await appendFileHistoryEvent({
          companyId,
          fileId: dbFile.id,
          eventType: FILE_HISTORY_EVENT_TYPE.OCR_REQUESTED,
          actorId: normalizeFileHistoryActorId(userId),
          details: {},
        });
        await prisma.file.update({
          where: { id: dbFile.id },
          data: { ocr_status: 'pending' },
        });
        processDocumentOcr(dbFile.id).catch((err) => {
          console.error(`OCR processing failed for file ${dbFile.id}:`, err);
        });
      }

      created.push({
        id: dbFile.id,
        name: dbFile.name,
        storage_path: dbFile.storage_path,
        mime_type: dbFile.mime_type ?? 'application/octet-stream',
        size_bytes: dbFile.size_bytes != null ? Number(dbFile.size_bytes) : 0,
        ocr_status: ocrRequested ? 'pending' : null,
        ...(pendingExtractKeyIds && pendingExtractKeyIds.length > 0
          ? { metadata_ai_extract_status: 'pending' as const }
          : {}),
      });
    }

    return res.status(201).json({ files: created });
  },

  // ─── Bulk Metadata Assignment ───

  async bulkUpdateMetadata(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const { file_ids, entries, mode } = req.body || {};
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    if (!Array.isArray(file_ids) || file_ids.length === 0) {
      return res.status(400).json({ error: 'file_ids is required and must be a non-empty array' });
    }
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries is required and must be an array' });
    }
    if (mode === 'replace') {
      return res.status(400).json({
        error: 'Bulk metadata replace mode is no longer supported',
        details: 'Bulk metadata updates only modify provided keys and preserve all others',
      });
    }

    const validEntries = entries.filter(
      (e: unknown) => e && typeof e === 'object' && typeof (e as Record<string, unknown>).key === 'string',
    );

    const keyMap = new Map<string, string>();
    const keyRows = await prisma.filesMetadataKey.findMany({
      where: { company_id: companyId },
      select: { id: true, name: true, value_kind: true, allowed_values: true },
    });
    const keyById = new Map<string, { value_kind: FilesMetadataValueKind; allowed_values: Prisma.JsonValue }>();
    keyRows.forEach((k) => {
      if (k.name) keyMap.set(k.name, k.id);
      keyById.set(k.id, { value_kind: k.value_kind, allowed_values: k.allowed_values });
    });

    for (const entry of validEntries) {
      const e = entry as { key: string; value: string };
      let keyId = keyMap.get(e.key.trim());
      if (!keyId) {
        const created = await prisma.filesMetadataKey.create({
          data: {
            company_id: companyId,
            name: e.key.trim(),
            value_kind: FilesMetadataValueKind.free_text,
            allowed_values: [],
          },
          select: { id: true, name: true, value_kind: true, allowed_values: true },
        });
        keyId = created.id;
        keyMap.set(e.key.trim(), keyId);
        keyById.set(created.id, { value_kind: created.value_kind, allowed_values: created.allowed_values });
      }
      const row = keyById.get(keyId);
      if (!row) {
        return res.status(500).json({ error: 'Internal error', details: 'Could not resolve metadata key' });
      }
      const val = typeof e.value === 'string' ? e.value : String(e.value ?? '');
      const v = validateMetadataValueForKey(row, val);
      if (!v.ok) {
        return res.status(v.status).json({ error: v.error, details: v.details });
      }
    }

    const userId = req.user?.id ?? '';
    const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
    if (!userId && !isCompanyAdmin) return res.status(401).json({ error: 'Unauthorized' });
    const userGroupIds = userId ? await getUserGroupIdsInCompany(userId, companyId) : [];

    const files = await prisma.file.findMany({
      where: { id: { in: file_ids }, company_id: companyId, is_archived: false },
      select: { id: true },
    });
    let validFileIds = files.map((f) => f.id);

    if (validFileIds.length === 0) {
      return res.status(404).json({ error: 'No valid files found' });
    }

    // Filter to only files the user has write access to
    if (!isCompanyAdmin) {
      const writeChecks = await Promise.all(
        validFileIds.map(async (fileId) => {
          const level = await canUserAccessFileByMetadata({ userId, companyId, fileId, isCompanyAdmin, userGroupIds });
          return level === 'write' ? fileId : null;
        }),
      );
      validFileIds = writeChecks.filter((id): id is string => id !== null);
      if (validFileIds.length === 0) {
        return res.status(403).json({ error: 'Forbidden', details: 'No write access to the selected files' });
      }
    }

    const actorId = normalizeFileHistoryActorId(userId);

    for (const fileId of validFileIds) {
      const changes: Array<{
        key: string;
        keyId: string;
        action: 'add' | 'edit';
        previous?: string;
        next: string;
      }> = [];
      for (const entry of validEntries) {
        const e = entry as { key: string; value: string };
        const keyId = keyMap.get(e.key.trim())!;
        const keyLabel = e.key.trim();
        const strVal = typeof e.value === 'string' ? e.value.trim() : String(e.value).trim();

        const existing = await prisma.filesMetadataValue.findFirst({
          where: { files_id: fileId, metadata_id: keyId },
        });
        if (existing) {
          if (existing.value !== strVal) {
            changes.push({
              key: keyLabel,
              keyId,
              action: 'edit',
              previous: existing.value,
              next: strVal,
            });
          }
          await prisma.filesMetadataValue.update({
            where: { id: existing.id },
            data: { value: strVal },
          });
        } else {
          changes.push({ key: keyLabel, keyId, action: 'add', next: strVal });
          await prisma.filesMetadataValue.create({
            data: {
              files_id: fileId,
              metadata_id: keyId,
              value: strVal,
              company_id: companyId,
            },
          });
        }
      }
      if (changes.length > 0) {
        await appendFileHistoryEvent({
          companyId,
          fileId,
          eventType: FILE_HISTORY_EVENT_TYPE.METADATA_CHANGED,
          actorId,
          details: { bulk: true, changes },
        });
      }
    }

    return res.json({ updated: validFileIds.length });
  },

  async renameFlatFile(req: AuthRequest, res: Response) {
    const { companyId, fileId } = req.params;
    const { name } = req.body || {};

    if (!(await assertFlatDocumentWriteAccess(req, companyId, res))) return;

    if (!fileId || typeof fileId !== 'string') {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const requestedBase = typeof name === 'string' ? name.trim() : '';
    if (!requestedBase) {
      return res.status(400).json({ error: 'name is required' });
    }

    const file = await prisma.file.findFirst({
      where: { id: fileId, company_id: companyId, is_archived: false },
      select: { id: true, name: true },
    });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const { base: currentBase, extension } = splitNameAndExtension(file.name);
    const nextBase = sanitizeFileRenameBase(requestedBase);
    if (!nextBase) {
      return res.status(400).json({ error: 'name is invalid' });
    }

    const updatedName = `${nextBase}${extension}`;
    if (updatedName === file.name) {
      return res.json({ name: file.name });
    }

    await prisma.file.update({
      where: { id: file.id },
      data: { name: updatedName },
    });

    const actorId = normalizeFileHistoryActorId(req.user?.id);
    await appendFileHistoryEvent({
      companyId,
      fileId: file.id,
      eventType: FILE_HISTORY_EVENT_TYPE.FILE_RENAMED,
      actorId,
      details: { from: file.name, to: updatedName },
    });

    return res.json({
      name: updatedName,
      baseName: nextBase,
      extension,
      previousBaseName: currentBase,
    });
  },

  async listDocumentTypes(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const types = await prisma.documentType.findMany({
      where: { company_id: companyId },
      orderBy: [{ created_at: 'desc' }],
    });

    return res.json({
      presets: types.map((t) => ({
        id: t.id,
        name: t.name,
        namingInstructions: t.naming_instructions,
        metadataKeyIds: documentTypeMetadataKeyIdsFromJson(t.metadata_key_ids),
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    });
  },

  async createDocumentType(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const { name, namingInstructions, metadataKeyIds } = req.body || {};
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedInstructions = typeof namingInstructions === 'string' ? namingInstructions.trim() : '';
    const uniqueMetadataKeyIds = normalizeDocumentTypeMetadataKeyIds(metadataKeyIds);

    if (!trimmedName) return res.status(400).json({ error: 'name is required' });
    if (!trimmedInstructions) return res.status(400).json({ error: 'namingInstructions is required' });
    if (uniqueMetadataKeyIds.length === 0) {
      return res.status(400).json({ error: 'metadataKeyIds must be a non-empty array' });
    }

    const keyRows = await prisma.filesMetadataKey.findMany({
      where: { company_id: companyId, id: { in: uniqueMetadataKeyIds } },
      select: { id: true },
    });
    if (keyRows.length !== uniqueMetadataKeyIds.length) {
      return res.status(400).json({ error: 'One or more metadataKeyIds are invalid for this company' });
    }

    const created = await prisma.documentType.create({
      data: {
        company_id: companyId,
        name: trimmedName,
        naming_instructions: trimmedInstructions,
        metadata_key_ids: uniqueMetadataKeyIds,
      },
    });

    return res.status(201).json({
      id: created.id,
      name: created.name,
      namingInstructions: created.naming_instructions,
      metadataKeyIds: documentTypeMetadataKeyIdsFromJson(created.metadata_key_ids),
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    });
  },

  async updateDocumentType(req: AuthRequest, res: Response) {
    const { companyId, documentTypeId } = req.params;
    const { name, namingInstructions, metadataKeyIds } = req.body || {};
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const existing = await prisma.documentType.findFirst({
      where: { id: documentTypeId, company_id: companyId },
      select: { id: true, name: true },
    });
    if (!existing) return res.status(404).json({ error: 'Document type not found' });

    const data: {
      name?: string;
      naming_instructions?: string;
      metadata_key_ids?: string[];
    } = {};

    if (name !== undefined) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return res.status(400).json({ error: 'name must be a non-empty string when provided' });
      data.name = trimmedName;
    }

    if (namingInstructions !== undefined) {
      const trimmedInstructions = typeof namingInstructions === 'string' ? namingInstructions.trim() : '';
      if (!trimmedInstructions) {
        return res.status(400).json({ error: 'namingInstructions must be a non-empty string when provided' });
      }
      data.naming_instructions = trimmedInstructions;
    }

    if (metadataKeyIds !== undefined) {
      const uniqueMetadataKeyIds = normalizeDocumentTypeMetadataKeyIds(metadataKeyIds);
      if (uniqueMetadataKeyIds.length === 0) {
        return res.status(400).json({ error: 'metadataKeyIds must be a non-empty array when provided' });
      }
      const keyRows = await prisma.filesMetadataKey.findMany({
        where: { company_id: companyId, id: { in: uniqueMetadataKeyIds } },
        select: { id: true },
      });
      if (keyRows.length !== uniqueMetadataKeyIds.length) {
        return res.status(400).json({ error: 'One or more metadataKeyIds are invalid for this company' });
      }
      data.metadata_key_ids = uniqueMetadataKeyIds;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const updated = await prisma.documentType.update({
      where: { id: documentTypeId },
      data,
    });

    return res.json({
      id: updated.id,
      name: updated.name,
      namingInstructions: updated.naming_instructions,
      metadataKeyIds: documentTypeMetadataKeyIdsFromJson(updated.metadata_key_ids),
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    });
  },

  async deleteDocumentType(req: AuthRequest, res: Response) {
    const { companyId, documentTypeId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const toDelete = await prisma.documentType.findFirst({
      where: { id: documentTypeId, company_id: companyId },
      select: { name: true },
    });
    if (!toDelete) return res.status(404).json({ error: 'Document type not found' });

    await prisma.documentType.delete({ where: { id: documentTypeId } });

    return res.status(204).send();
  },

  async splitPdfPropose(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const { fileId, currentDate, nativeText } = req.body || {};

    if (!(await assertFlatDocumentWriteAccess(req, companyId, res))) return;

    if (!fileId || typeof fileId !== 'string') {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const file = await prisma.file.findFirst({
      where: { id: fileId, company_id: companyId, is_archived: false },
      select: {
        id: true,
        mime_type: true,
        ocr_status: true,
        ocr_markdown: true,
        storage_path: true,
      },
    });
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (file.mime_type !== 'application/pdf') {
      return res.status(400).json({ error: 'file must be a PDF' });
    }

    // Use client-provided native text (native/digital PDF) or fall back to stored OCR markdown
    const ocrMarkdown = (typeof nativeText === 'string' && nativeText.trim())
      ? nativeText.trim()
      : file.ocr_markdown;

    if (!ocrMarkdown?.trim()) {
      return res.status(400).json({ error: 'OCR must be completed before proposing a split (or provide nativeText for native PDFs)' });
    }

    const dateStr =
      typeof currentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)
        ? currentDate
        : new Date().toISOString().slice(0, 10);

    try {
      const dbTypes = await prisma.documentType.findMany({
        where: { company_id: companyId },
        orderBy: { name: 'asc' },
      });
      if (dbTypes.length === 0) {
        return res.status(400).json({ error: 'At least one document type must be configured before proposing a split' });
      }

      const allKeyIds = [...new Set(dbTypes.flatMap((t) => documentTypeMetadataKeyIdsFromJson(t.metadata_key_ids)))];
      const dbKeys = await prisma.filesMetadataKey.findMany({ where: { company_id: companyId, id: { in: allKeyIds } } });
      const keysById = new Map(dbKeys.map((k) => [k.id, k]));

      const { storageService } = await import('../services/storage.service');
      const bucket = storageService.getDocumentsBucket();
      const stream = await storageService.downloadFile(bucket, file.storage_path);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const pdfBuffer = Buffer.concat(chunks);
      const { proposeSplitWithGemini, getPdfPageCount } = await import('../services/pdf-split.service');
      const pageCount = await getPdfPageCount(pdfBuffer);

      const documentTypes = dbTypes.map((t) => {
        const typeKeyIds = documentTypeMetadataKeyIdsFromJson(t.metadata_key_ids);
        return {
          id: t.id,
          name: t.name,
          namingInstructions: t.naming_instructions.trim(),
          metadataKeys: typeKeyIds
            .map((keyId) => keysById.get(keyId))
            .filter((k): k is NonNullable<typeof k> => k != null)
            .map((k) => ({
              id: k.id,
              name: k.name,
              valueKind: (k.value_kind === FilesMetadataValueKind.predefined_list
                ? 'predefined_list'
                : 'free_text') as 'free_text' | 'predefined_list',
              allowedValues: parseAllowedValuesJson(k.allowed_values),
            })),
        };
      });

      const segments = await proposeSplitWithGemini({
        ocrMarkdown,
        documentTypes,
        currentDate: dateStr,
      });
      return res.json({ segments, pageCount });
    } catch (e) {
      console.error('splitPdfPropose:', e);
      return res.status(400).json({
        error: e instanceof Error ? e.message : 'Failed to propose split',
      });
    }
  },

  /**
   * POST /api/companies/:companyId/documents/split-pdf/auto
   *
   * Multipart form-data:
   * - file (PDF)
   * - runOcr (default true)
   * - keepOriginalFile (default false)
   * - ocrCreatedFiles (default true)
   * - currentDate (optional yyyy-mm-dd)
   */
  async splitPdfAuto(req: AuthRequest, res: Response) {
    const { companyId } = req.params;

    if (!(await assertFlatDocumentWriteAccess(req, companyId, res))) return;

    const uploaded = (req as AuthRequest & { file?: Express.Multer.File }).file;
    if (!uploaded) return res.status(400).json({ error: 'file is required' });
    if (uploaded.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'file must be a PDF' });
    }

    const keepSource = (req.body as Record<string, unknown> | undefined)?.keepOriginalFile === 'true';
    const runOcr = (req.body as Record<string, unknown> | undefined)?.runOcr !== 'false';
    const runOcrOnCreated = (req.body as Record<string, unknown> | undefined)?.ocrCreatedFiles !== 'false';
    const currentDateRaw = (req.body as Record<string, unknown> | undefined)?.currentDate;
    const dateStr =
      typeof currentDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(currentDateRaw)
        ? currentDateRaw
        : new Date().toISOString().slice(0, 10);

    const dbTypes = await prisma.documentType.findMany({
      where: { company_id: companyId },
      orderBy: { name: 'asc' },
    });
    if (dbTypes.length === 0) {
      return res.status(400).json({ error: 'At least one document type must be configured before auto-splitting' });
    }

    const userId = req.user?.id ?? null;

    const { storageService } = await import('../services/storage.service');
    const bucket = storageService.getDocumentsBucket();

    const storageBase = sanitizeFlatFileName(uploaded.originalname.replace(/\.pdf$/i, '')) || 'file';
    const storagePath = `companies/${companyId}/flat/${Date.now()}_source_${storageBase}.pdf`;
    try {
      await storageService.uploadFile(bucket, storagePath, uploaded.buffer, 'application/pdf');
    } catch (e) {
      console.error('splitPdfAuto upload source:', e);
      return res.status(500).json({ error: 'Failed to upload source PDF' });
    }

    const sourceFile = await prisma.file.create({
      data: {
        company_id: companyId,
        name: uploaded.originalname.length > 512 ? `${storageBase}.pdf` : uploaded.originalname,
        storage_path: storagePath,
        mime_type: 'application/pdf',
        size_bytes: BigInt(uploaded.size),
        uploaded_by: userId,
        folder_id: null,
      },
      select: { id: true, storage_path: true },
    });

    await appendFileHistoryEvent({
      companyId,
      fileId: sourceFile.id,
      eventType: FILE_HISTORY_EVENT_TYPE.FILE_UPLOADED,
      actorId: normalizeFileHistoryActorId(userId),
      details: { source: 'split_pdf_auto', name: uploaded.originalname },
    });

    let ocrMarkdown: string | null = null;
    if (runOcr) {
      const { runOcrAndGetMarkdown } = await import('../services/ocr.service');
      await appendFileHistoryEvent({
        companyId,
        fileId: sourceFile.id,
        eventType: FILE_HISTORY_EVENT_TYPE.OCR_REQUESTED,
        actorId: normalizeFileHistoryActorId(userId),
        details: { source: 'split_pdf_auto' },
      });
      await prisma.file.update({
        where: { id: sourceFile.id },
        data: { ocr_status: 'pending' },
      });
      try {
        ocrMarkdown = await runOcrAndGetMarkdown(sourceFile.id);
      } catch (e) {
        return res.status(400).json({ error: e instanceof Error ? e.message : 'OCR failed' });
      }
    } else {
      return res.status(400).json({ error: 'runOcr=false is not supported for auto split (OCR is required)' });
    }

    const allKeyIds = [...new Set(dbTypes.flatMap((t) => documentTypeMetadataKeyIdsFromJson(t.metadata_key_ids)))];
    const dbKeys = await prisma.filesMetadataKey.findMany({ where: { company_id: companyId, id: { in: allKeyIds } } });
    const keysById = new Map(dbKeys.map((k) => [k.id, k]));

    const documentTypes = dbTypes.map((t) => {
      const typeKeyIds = documentTypeMetadataKeyIdsFromJson(t.metadata_key_ids);
      return {
        id: t.id,
        name: t.name,
        namingInstructions: t.naming_instructions.trim(),
        metadataKeys: typeKeyIds
          .map((keyId) => keysById.get(keyId))
          .filter((k): k is NonNullable<typeof k> => k != null)
          .map((k) => ({
            id: k.id,
            name: k.name,
            valueKind: (k.value_kind === FilesMetadataValueKind.predefined_list
              ? 'predefined_list'
              : 'free_text') as 'free_text' | 'predefined_list',
            allowedValues: parseAllowedValuesJson(k.allowed_values),
          })),
      };
    });

    const { proposeSplitWithGemini, getPdfPageCount, validateSegments, applyPdfSplit } = await import(
      '../services/pdf-split.service'
    );

    let pageCount = 0;
    try {
      pageCount = await getPdfPageCount(uploaded.buffer);
    } catch (e) {
      console.error('splitPdfAuto pageCount:', e);
      return res.status(400).json({ error: 'Invalid PDF' });
    }

    let proposed;
    try {
      proposed = await proposeSplitWithGemini({
        ocrMarkdown: ocrMarkdown ?? '',
        documentTypes,
        currentDate: dateStr,
      });
    } catch (e) {
      console.error('splitPdfAuto propose:', e);
      return res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to propose split' });
    }

    let validated;
    try {
      validated = validateSegments(proposed);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid segments' });
    }

    // Validate extracted metadata values (predefined list enforcement, etc.)
    for (const seg of validated) {
      if (!seg.metadata) continue;
      for (const keyId of Object.keys(seg.metadata)) {
        const row = keysById.get(keyId);
        if (!row) { delete seg.metadata![keyId]; continue; }
        const raw = seg.metadata[keyId];
        const val = typeof raw === 'string' ? raw.trim() : String(raw).trim();
        if (!val) continue;
        const check = validateMetadataValueForKey(row, val);
        if (!check.ok) {
          return res.status(check.status).json({ error: check.error, details: check.details });
        }
      }
    }

    let parts: Array<{ buffer: Buffer; suggestedFileName: string }>;
    try {
      parts = await applyPdfSplit(uploaded.buffer, validated);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to split PDF' });
    }

    const created: Array<{ id: string; name: string }> = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const outBase = sanitizeFlatFileName(part.suggestedFileName.replace(/\.pdf$/i, ''));
      const outPath = `companies/${companyId}/flat/${Date.now()}_${i}_${outBase}.pdf`;
      const size = part.buffer.length;
      await storageService.uploadFile(bucket, outPath, part.buffer, 'application/pdf');
      const dbFile = await prisma.file.create({
        data: {
          company_id: companyId,
          name: part.suggestedFileName.length > 512 ? `${outBase}.pdf` : part.suggestedFileName,
          storage_path: outPath,
          mime_type: 'application/pdf',
          size_bytes: BigInt(size),
          uploaded_by: userId,
          folder_id: null,
        },
      });
      await appendFileHistoryEvent({
        companyId,
        fileId: dbFile.id,
        eventType: FILE_HISTORY_EVENT_TYPE.FILE_UPLOADED,
        actorId: normalizeFileHistoryActorId(userId),
        details: { source: 'split_pdf_auto' },
      });
      const seg = validated[i];
      const meta = seg?.metadata;
      const metaChanges: Array<{ key: string; keyId: string; action: 'add'; next: string }> = [];

      if (meta) {
        for (const [keyId, rawVal] of Object.entries(meta)) {
          if (!keysById.has(keyId)) continue;
          const strVal = typeof rawVal === 'string' ? rawVal.trim() : String(rawVal).trim();
          if (!strVal) continue;
          await prisma.filesMetadataValue.create({
            data: {
              files_id: dbFile.id,
              metadata_id: keyId,
              value: strVal,
              company_id: companyId,
            },
          });
          const keyRow = keysById.get(keyId);
          metaChanges.push({
            key: keyRow?.name?.trim() || keyId,
            keyId,
            action: 'add',
            next: strVal,
          });
        }
      }

      if (metaChanges.length > 0) {
        await appendFileHistoryEvent({
          companyId,
          fileId: dbFile.id,
          eventType: FILE_HISTORY_EVENT_TYPE.METADATA_CHANGED,
          actorId: normalizeFileHistoryActorId(userId),
          details: { source: 'split_pdf_auto', changes: metaChanges },
        });
      }
      created.push({ id: dbFile.id, name: dbFile.name });
    }

    if (runOcrOnCreated && created.length > 0) {
      const { processDocumentOcr } = await import('../services/ocr.service');
      for (const row of created) {
        await appendFileHistoryEvent({
          companyId,
          fileId: row.id,
          eventType: FILE_HISTORY_EVENT_TYPE.OCR_REQUESTED,
          actorId: null,
          details: { source: 'split_pdf_auto_child' },
        });
        await prisma.file.update({
          where: { id: row.id },
          data: { ocr_status: 'pending' },
        });
        processDocumentOcr(row.id).catch((err) => {
          console.error(`OCR processing failed for split file ${row.id}:`, err);
        });
      }
    }

    let removedOriginal = false;
    let originalRemoveFailed = false;
    if (!keepSource) {
      try {
        try {
          await storageService.deleteFile(bucket, storagePath);
        } catch {
          // Object may not exist in storage; proceed with DB cleanup
        }
        await prisma.filesMetadataValue.deleteMany({ where: { files_id: sourceFile.id } });
        await prisma.file.delete({ where: { id: sourceFile.id } });
        removedOriginal = true;
      } catch (e) {
        console.error('splitPdfAuto: failed to remove source file:', e);
        originalRemoveFailed = true;
      }
    }

    return res.status(201).json({
      created,
      removedOriginal,
      ocrQueued: runOcrOnCreated && created.length > 0,
      segments: validated,
      pageCount,
      sourceFileId: sourceFile.id,
      ...(originalRemoveFailed ? { warningCode: 'original_remove_failed' as const } : {}),
    });
  },

  async splitPdfApply(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const { fileId, segments, keepOriginalFile, ocrCreatedFiles, folderId: rawFolderId } = req.body || {};

    if (!(await assertFlatDocumentWriteAccess(req, companyId, res))) return;

    if (!fileId || typeof fileId !== 'string') {
      return res.status(400).json({ error: 'fileId is required' });
    }
    if (!Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({ error: 'segments must be a non-empty array' });
    }
    const keepSource = keepOriginalFile === true;
    /** Queue OCR on each output PDF unless explicitly disabled (default: true). */
    const runOcrOnCreated = ocrCreatedFiles !== false;

    const resolvedFolder = await resolveCompanyFolderId(companyId, rawFolderId);
    if ('error' in resolvedFolder) {
      return res.status(resolvedFolder.status).json({ error: resolvedFolder.error });
    }
    const globalFolderId = resolvedFolder.folderId;

    const userId = req.user?.id ?? null;

    const { validateSegments, applyPdfSplit } = await import('../services/pdf-split.service');
    let validated;
    try {
      validated = validateSegments(segments);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid segments' });
    }

    const companyMetaKeys = await prisma.filesMetadataKey.findMany({
      where: { company_id: companyId },
      select: { id: true, name: true, value_kind: true, allowed_values: true },
    });
    const companyMetaById = new Map(companyMetaKeys.map((k) => [k.id, k]));
    for (const seg of validated) {
      if (!seg.metadata) continue;
      for (const keyId of Object.keys(seg.metadata)) {
        const row = companyMetaById.get(keyId);
        if (!row) { delete seg.metadata![keyId]; continue; }
        const raw = seg.metadata[keyId];
        const val = typeof raw === 'string' ? raw.trim() : String(raw).trim();
        if (!val) continue;
        const check = validateMetadataValueForKey(row, val);
        if (!check.ok) {
          return res.status(check.status).json({ error: check.error, details: check.details });
        }
      }
    }

    // Batch-resolve person_id → root_folder_id for segments that carry a person
    const segPersonIds = [...new Set(validated.filter((s) => s.person_id).map((s) => s.person_id!))];
    const personFolderMap = new Map<string, string | null>();
    if (segPersonIds.length > 0) {
      const personRows = await prisma.person.findMany({
        where: { id: { in: segPersonIds }, company_id: companyId },
        select: { id: true, root_folder_id: true },
      });
      for (const p of personRows) personFolderMap.set(p.id, p.root_folder_id);
    }

    const file = await prisma.file.findFirst({
      where: { id: fileId, company_id: companyId, is_archived: false },
      select: {
        id: true,
        mime_type: true,
        storage_path: true,
      },
    });
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (file.mime_type !== 'application/pdf') {
      return res.status(400).json({ error: 'file must be a PDF' });
    }

    const { storageService } = await import('../services/storage.service');
    const bucket = storageService.getDocumentsBucket();

    let pdfBuffer: Buffer;
    try {
      const stream = await storageService.downloadFile(bucket, file.storage_path);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      pdfBuffer = Buffer.concat(chunks);
    } catch (e) {
      console.error('splitPdfApply download:', e);
      return res.status(500).json({ error: 'Failed to read source PDF' });
    }

    let parts: Array<{ buffer: Buffer; suggestedFileName: string }>;
    try {
      parts = await applyPdfSplit(pdfBuffer, validated);
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to split PDF' });
    }

    const created: Array<{ id: string; name: string }> = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const storageBase = sanitizeFlatFileName(part.suggestedFileName.replace(/\.pdf$/i, ''));
      const storagePath = `companies/${companyId}/flat/${Date.now()}_${i}_${storageBase}.pdf`;
      const size = part.buffer.length;
      await storageService.uploadFile(bucket, storagePath, part.buffer, 'application/pdf');
      const seg = validated[i];
      const segFolderId = seg?.person_id
        ? (personFolderMap.get(seg.person_id) ?? globalFolderId)
        : globalFolderId;
      const dbFile = await prisma.file.create({
        data: {
          company_id: companyId,
          name: part.suggestedFileName.length > 512 ? `${storageBase}.pdf` : part.suggestedFileName,
          storage_path: storagePath,
          mime_type: 'application/pdf',
          size_bytes: BigInt(size),
          uploaded_by: userId,
          folder_id: segFolderId,
        },
      });
      await appendFileHistoryEvent({
        companyId,
        fileId: dbFile.id,
        eventType: FILE_HISTORY_EVENT_TYPE.FILE_UPLOADED,
        actorId: normalizeFileHistoryActorId(userId),
        details: { source: 'split_pdf_apply' },
      });
      const meta = seg?.metadata;
      const metaChanges: Array<{ key: string; keyId: string; action: 'add'; next: string }> = [];

      if (meta && companyMetaById.size > 0) {
        for (const [keyId, rawVal] of Object.entries(meta)) {
          if (!companyMetaById.has(keyId)) continue;
          const strVal = typeof rawVal === 'string' ? rawVal.trim() : String(rawVal).trim();
          if (!strVal) continue;
          await prisma.filesMetadataValue.create({
            data: {
              files_id: dbFile.id,
              metadata_id: keyId,
              value: strVal,
              company_id: companyId,
            },
          });
          const keyRow = companyMetaById.get(keyId);
          metaChanges.push({
            key: keyRow?.name?.trim() || keyId,
            keyId,
            action: 'add',
            next: strVal,
          });
        }
      }

      if (metaChanges.length > 0) {
        await appendFileHistoryEvent({
          companyId,
          fileId: dbFile.id,
          eventType: FILE_HISTORY_EVENT_TYPE.METADATA_CHANGED,
          actorId: normalizeFileHistoryActorId(userId),
          details: { source: 'split_pdf_apply', changes: metaChanges },
        });
      }
      created.push({ id: dbFile.id, name: dbFile.name });
    }

    if (runOcrOnCreated && created.length > 0) {
      const { processDocumentOcr } = await import('../services/ocr.service');
      for (const row of created) {
        await appendFileHistoryEvent({
          companyId,
          fileId: row.id,
          eventType: FILE_HISTORY_EVENT_TYPE.OCR_REQUESTED,
          actorId: null,
          details: { source: 'split_pdf_apply_child' },
        });
        await prisma.file.update({
          where: { id: row.id },
          data: { ocr_status: 'pending' },
        });
        processDocumentOcr(row.id).catch((err) => {
          console.error(`OCR processing failed for split file ${row.id}:`, err);
        });
      }
    }

    let removedOriginal = false;
    let originalRemoveFailed = false;
    if (!keepSource) {
      try {
        try {
          await storageService.deleteFile(bucket, file.storage_path);
        } catch {
          // Object may not exist in storage; proceed with DB cleanup
        }
        await prisma.filesMetadataValue.deleteMany({ where: { files_id: fileId } });
        await prisma.file.delete({ where: { id: fileId } });
        removedOriginal = true;
      } catch (e) {
        console.error('splitPdfApply: failed to remove source file:', e);
        originalRemoveFailed = true;
      }
    }

    return res.status(201).json({
      created,
      removedOriginal,
      ocrQueued: runOcrOnCreated && created.length > 0,
      ...(originalRemoveFailed ? { warningCode: 'original_remove_failed' as const } : {}),
    });
  },

  async extractMetadataFromOcr(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const { fileId, metadataKeyIds, currentDate, renameInstructions } = req.body || {};

    if (!(await assertFlatDocumentWriteAccess(req, companyId, res))) return;

    if (!fileId || typeof fileId !== 'string') {
      return res.status(400).json({ error: 'fileId is required' });
    }
    if (!Array.isArray(metadataKeyIds) || metadataKeyIds.length === 0) {
      return res.status(400).json({ error: 'metadataKeyIds must be a non-empty array' });
    }

    const requestedIds = [...new Set(metadataKeyIds.map((id: unknown) => String(id).trim()).filter(Boolean))];
    if (requestedIds.length === 0) {
      return res.status(400).json({ error: 'metadataKeyIds must contain at least one valid id' });
    }

    const dateStr =
      typeof currentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)
        ? currentDate
        : new Date().toISOString().slice(0, 10);
    const normalizedRenameInstructions =
      typeof renameInstructions === 'string' && renameInstructions.trim().length > 0
        ? renameInstructions.trim()
        : undefined;

    try {
      const result = await extractAndApplyMetadataFromOcr({
        companyId,
        fileId,
        metadataKeyIds: requestedIds,
        renameInstructions: normalizedRenameInstructions,
        currentDate: dateStr,
      });
      return res.json({
        values: result.values,
        ...(result.renamedTo ? { renamedTo: result.renamedTo } : {}),
      });
    } catch (e) {
      const http = e as ExtractMetadataFromOcrHttpError;
      if (typeof http?.status === 'number' && typeof http?.error === 'string') {
        return res.status(http.status).json({
          error: http.error,
          ...(http.details !== undefined ? { details: http.details } : {}),
        });
      }
      console.error('extractMetadataFromOcr:', e);
      return res.status(400).json({
        error: e instanceof Error ? e.message : 'Failed to extract metadata',
      });
    }
  },
};
