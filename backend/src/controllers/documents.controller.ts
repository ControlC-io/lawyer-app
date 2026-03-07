import { Response } from 'express';
import { AuthRequest, ALL_COMPANIES, companyFilter } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getAccessibleFileIds, getAccessibleFileIdsWithLevels, buildVirtualTree, getAllowedMetadataValues, canUserAccessFileByMetadata } from '../lib/documentAccess';
import { getUserGroupIdsInCompany } from '../lib/folderAccess';

async function ensureCompanyAccess(req: AuthRequest, companyId: string) {
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

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Super admin 'all': return all files across companies without permission filtering
    if (companyId === ALL_COMPANIES && req.user?.super_admin) {
      const files = await prisma.file.findMany({
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

    const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
    const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);

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

    // Full-text search in OCR content
    const searchQuery = req.query.q as string | undefined;
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      const searchResults = await prisma.$queryRaw`
        SELECT
          f.id,
          f.name,
          f.storage_path,
          f.mime_type,
          f.size_bytes::text as size_bytes_str,
          f.created_at,
          f.company_id,
          f.ocr_status AS "ocrStatus",
          ts_rank(to_tsvector('simple', coalesce(f.ocr_markdown, '')), plainto_tsquery('simple', ${q})) AS rank,
          ts_headline(
            'simple',
            coalesce(f.ocr_markdown, ''),
            plainto_tsquery('simple', ${q}),
            'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, ShortWord=3, MaxFragments=2, FragmentDelimiter= … '
          ) AS "ocrSnippet"
        FROM "files" f
        WHERE f.company_id = ${companyId}::uuid
          AND f.id = ANY(${accessibleIds}::uuid[])
          AND to_tsvector('simple', coalesce(f.ocr_markdown, '')) @@ plainto_tsquery('simple', ${q})
        ORDER BY rank DESC
        LIMIT 100
      ` as any[];

      const results = searchResults.map((r: any) => ({
        ...r,
        size_bytes: r.size_bytes_str ? Number(r.size_bytes_str) : 0,
        ocrSnippet: r.ocrSnippet,
        ocrSearchRank: r.rank ? Number(r.rank) : 0,
        accessLevel: writeFileIds.has(r.id) ? 'write' : 'read',
      }));

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
      where: { id: { in: accessibleIds }, ...companyFilter(companyId) },
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

  // ─── Virtual Tree ───

  async getVirtualTree(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;

    let accessibleIds: string[];
    if (companyId === ALL_COMPANIES && req.user?.super_admin) {
      const allFiles = await prisma.file.findMany({ select: { id: true } });
      accessibleIds = allFiles.map((f) => f.id);
    } else {
      const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);
      accessibleIds = await getAccessibleFileIds({
        userId,
        companyId,
        isCompanyAdmin,
        userGroupIds,
      });
    }

    if (accessibleIds.length === 0) return res.json({ tree: [], keyOrder: [], totalFiles: 0 });

    // Get files
    const files = await prisma.file.findMany({
      where: { id: { in: accessibleIds }, ...companyFilter(companyId) },
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

    // Get user's tree config (skip for 'all' since compound key requires real UUID)
    const treeConfig = companyId !== ALL_COMPANIES
      ? await prisma.userDocumentTreeConfig.findUnique({
          where: { user_id_company_id: { user_id: userId, company_id: companyId } },
        })
      : null;

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

    return res.json({ tree, keyOrder, totalFiles: files.length });
  },

  // ─── Tree Config ───

  async getTreeConfig(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const config = await prisma.userDocumentTreeConfig.findUnique({
      where: { user_id_company_id: { user_id: userId, company_id: companyId } },
    });

    return res.json(config || { key_order: [] });
  },

  async updateTreeConfig(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const { key_order } = req.body || {};
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!Array.isArray(key_order)) {
      return res.status(400).json({ error: 'key_order must be an array of metadata key IDs' });
    }

    const config = await prisma.userDocumentTreeConfig.upsert({
      where: { user_id_company_id: { user_id: userId, company_id: companyId } },
      update: { key_order },
      create: {
        user_id: userId,
        company_id: companyId,
        key_order,
      },
    });

    return res.json(config);
  },

  // ─── Flat Upload (no folder required) ───

  async uploadFlatFile(req: AuthRequest, res: Response) {
    const { companyId } = req.params;
    const access = await ensureCompanyAccess(req, companyId);
    if (access.error) return res.status(access.error.status).json(access.error.body);

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
    if (!isCompanyAdmin) {
      // Check if user has any write permission rules
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

    const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const { storageService: storage } = await import('../services/storage.service');

    const sanitized = file.originalname
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '') || 'file';

    const storagePath = `companies/${companyId}/flat/${Date.now()}_${sanitized}`;

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
        folder_id: null,
      },
    });

    // Apply metadata from query params if provided
    const metadataParam = req.body?.metadata;
    if (metadataParam) {
      try {
        const entries: Array<{ key_id: string; value: string }> = typeof metadataParam === 'string'
          ? JSON.parse(metadataParam)
          : metadataParam;
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            if (entry.key_id && typeof entry.value === 'string') {
              await prisma.filesMetadataValue.create({
                data: {
                  files_id: dbFile.id,
                  metadata_id: entry.key_id,
                  value: entry.value,
                  company_id: companyId,
                },
              });
            }
          }
        }
      } catch {
        // ignore invalid metadata
      }
    }

    // Trigger OCR if requested
    if (req.body?.ocr === 'true') {
      const { processDocumentOcr } = await import('../services/ocr.service');
      await prisma.file.update({
        where: { id: dbFile.id },
        data: { ocr_status: 'pending' },
      });
      processDocumentOcr(dbFile.id).catch((err) => {
        console.error(`OCR processing failed for file ${dbFile.id}:`, err);
      });
    }

    return res.status(201).json({
      ...dbFile,
      size_bytes: dbFile.size_bytes != null ? Number(dbFile.size_bytes) : 0,
      ocr_status: req.body?.ocr === 'true' ? 'pending' : null,
    });
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

    const validEntries = entries.filter(
      (e: unknown) => e && typeof e === 'object' && typeof (e as Record<string, unknown>).key === 'string',
    );

    // Resolve key names to IDs
    const keyMap = new Map<string, string>();
    const keys = await prisma.filesMetadataKey.findMany({
      where: { company_id: companyId },
      select: { id: true, name: true },
    });
    keys.forEach((k) => { if (k.name) keyMap.set(k.name, k.id); });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const isCompanyAdmin = access.userCompany?.role === 'company_admin' || !!req.user?.super_admin;
    const userGroupIds = await getUserGroupIdsInCompany(userId, companyId);

    const files = await prisma.file.findMany({
      where: { id: { in: file_ids }, company_id: companyId },
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

    for (const fileId of validFileIds) {
      if (mode === 'replace') {
        await prisma.filesMetadataValue.deleteMany({
          where: { files_id: fileId, company_id: companyId },
        });
      }

      for (const entry of validEntries) {
        const e = entry as { key: string; value: string };
        let keyId = keyMap.get(e.key.trim());
        if (!keyId) {
          const created = await prisma.filesMetadataKey.create({
            data: { company_id: companyId, name: e.key.trim() },
          });
          keyId = created.id;
          keyMap.set(e.key.trim(), keyId);
        }

        if (mode === 'replace') {
          await prisma.filesMetadataValue.create({
            data: {
              files_id: fileId,
              metadata_id: keyId,
              value: typeof e.value === 'string' ? e.value : String(e.value),
              company_id: companyId,
            },
          });
        } else {
          // merge mode: upsert
          const existing = await prisma.filesMetadataValue.findFirst({
            where: { files_id: fileId, metadata_id: keyId },
          });
          if (existing) {
            await prisma.filesMetadataValue.update({
              where: { id: existing.id },
              data: { value: typeof e.value === 'string' ? e.value : String(e.value) },
            });
          } else {
            await prisma.filesMetadataValue.create({
              data: {
                files_id: fileId,
                metadata_id: keyId,
                value: typeof e.value === 'string' ? e.value : String(e.value),
                company_id: companyId,
              },
            });
          }
        }
      }
    }

    return res.json({ updated: validFileIds.length });
  },
};
