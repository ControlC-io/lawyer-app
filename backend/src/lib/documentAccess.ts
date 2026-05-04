import { prisma } from './prisma';

interface PermissionCondition {
  key_id: string;
  value: string;
}

function groupMetadataFiltersByKey(
  metadataFilters: PermissionCondition[],
): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const filter of metadataFilters) {
    let values = grouped.get(filter.key_id);
    if (!values) {
      values = new Set<string>();
      grouped.set(filter.key_id, values);
    }
    values.add(filter.value);
  }
  return grouped;
}

interface RuleWithAssignments {
  id: string;
  permission_type: string;
  conditions: PermissionCondition[] | unknown;
  assignments: Array<{ user_id: string | null; group_id: string | null }>;
}

export interface VirtualTreeNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: VirtualTreeNode[];
  fileCount?: number;
  keyName?: string;
  isUncategorized?: boolean;
}

/**
 * Get all permission rules applicable to a user in a company.
 * Includes rules assigned directly to the user or via their groups.
 */
async function getUserRules(
  userId: string,
  companyId: string,
  userGroupIds: string[],
): Promise<RuleWithAssignments[]> {
  const orConditions: Array<Record<string, unknown>> = [{ user_id: userId }];
  if (userGroupIds.length > 0) {
    orConditions.push({ group_id: { in: userGroupIds } });
  }

  return prisma.documentPermissionRule.findMany({
    where: {
      company_id: companyId,
      assignments: { some: { OR: orConditions } },
    },
    include: {
      assignments: {
        where: { OR: orConditions },
        select: { user_id: true, group_id: true },
      },
    },
  });
}

/**
 * Parse conditions from a rule's JSON field into typed array.
 */
function parseConditions(conditions: unknown): PermissionCondition[] {
  if (!Array.isArray(conditions)) return [];
  return conditions.filter(
    (c) => c && typeof c === 'object' && typeof c.key_id === 'string' && typeof c.value === 'string',
  );
}

/**
 * Check if a rule's conditions match a file's metadata.
 * All conditions must match (AND logic). Empty conditions match all files.
 * Supports multi-value metadata (any value matching counts as a match).
 */
function ruleMatchesFile(
  conditions: PermissionCondition[],
  fileMetadata: Map<string, string[]>,
): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => {
    const values = fileMetadata.get(c.key_id);
    return values != null && values.includes(c.value);
  });
}

/**
 * Check if a user can access a specific file based on metadata permission rules.
 * Returns the highest permission level ('write' > 'read') or null if no access.
 * Company admins always get 'write'.
 */
export async function canUserAccessFileByMetadata(params: {
  userId: string;
  companyId: string;
  fileId: string;
  isCompanyAdmin: boolean;
  userGroupIds: string[];
}): Promise<'read' | 'write' | null> {
  const { userId, companyId, fileId, isCompanyAdmin, userGroupIds } = params;

  if (isCompanyAdmin) return 'write';

  // If no permission rules exist at all for this company, grant read access
  const totalRules = await prisma.documentPermissionRule.count({
    where: { company_id: companyId },
  });
  if (totalRules === 0) return 'read';

  const rules = await getUserRules(userId, companyId, userGroupIds);
  if (rules.length === 0) return null;

  const metadataRows = await prisma.filesMetadataValue.findMany({
    where: { files_id: fileId },
    select: { metadata_id: true, value: true },
  });
  const fileMetadata = new Map<string, string[]>();
  for (const m of metadataRows) {
    const existing = fileMetadata.get(m.metadata_id);
    if (existing) existing.push(m.value);
    else fileMetadata.set(m.metadata_id, [m.value]);
  }

  let maxLevel: 'read' | 'write' | null = null;

  for (const rule of rules) {
    const conditions = parseConditions(rule.conditions);
    if (ruleMatchesFile(conditions, fileMetadata)) {
      if (rule.permission_type === 'write') return 'write'; // short-circuit
      if (maxLevel === null) maxLevel = 'read';
    }
  }

  return maxLevel;
}

/**
 * Get all file IDs in a company that a user can access based on metadata permissions.
 * Company admins get all files. Optionally filters by metadata key-value pairs.
 */
export async function getAccessibleFileIds(params: {
  userId: string;
  companyId: string;
  isCompanyAdmin: boolean;
  userGroupIds: string[];
  metadataFilters?: PermissionCondition[];
  missingKeyFilters?: string[];
}): Promise<string[]> {
  const { userId, companyId, isCompanyAdmin, userGroupIds, metadataFilters, missingKeyFilters } = params;

  // Get all files in the company
  const allFiles = await prisma.file.findMany({
    where: { company_id: companyId },
    select: { id: true },
  });

  if (allFiles.length === 0) return [];

  const fileIds = allFiles.map((f) => f.id);

  // Get all metadata for these files in one query
  const allMetadata = await prisma.filesMetadataValue.findMany({
    where: { files_id: { in: fileIds }, company_id: companyId },
    select: { files_id: true, metadata_id: true, value: true },
  });

  // Build metadata map: fileId -> Map<keyId, values[]> (supports multiple values per key)
  const metadataByFile = new Map<string, Map<string, string[]>>();
  for (const m of allMetadata) {
    let fileMap = metadataByFile.get(m.files_id);
    if (!fileMap) {
      fileMap = new Map();
      metadataByFile.set(m.files_id, fileMap);
    }
    const existing = fileMap.get(m.metadata_id);
    if (existing) {
      existing.push(m.value);
    } else {
      fileMap.set(m.metadata_id, [m.value]);
    }
  }

  // Apply user metadata filters first (narrows result set)
  let candidateFileIds = fileIds;
  if (metadataFilters && metadataFilters.length > 0) {
    const groupedFilters = groupMetadataFiltersByKey(metadataFilters);
    candidateFileIds = candidateFileIds.filter((fid) => {
      const fileMeta = metadataByFile.get(fid) || new Map<string, string[]>();
      return Array.from(groupedFilters.entries()).every(([keyId, wantedValues]) => {
        const values = fileMeta.get(keyId);
        return values != null && values.some((value) => wantedValues.has(value));
      });
    });
  }
  // Apply missing key filters (files that do NOT have a value for the given key)
  if (missingKeyFilters && missingKeyFilters.length > 0) {
    candidateFileIds = candidateFileIds.filter((fid) => {
      const fileMeta = metadataByFile.get(fid) || new Map();
      return missingKeyFilters.every((keyId) => !fileMeta.has(keyId));
    });
  }

  // Company admin bypasses permission rules
  if (isCompanyAdmin) return candidateFileIds;

  // If no permission rules exist at all for this company, all files are accessible
  const totalRules = await prisma.documentPermissionRule.count({
    where: { company_id: companyId },
  });
  if (totalRules === 0) return candidateFileIds;

  // Get user's permission rules
  const rules = await getUserRules(userId, companyId, userGroupIds);
  if (rules.length === 0) return [];

  // Filter files by permission rules
  return candidateFileIds.filter((fid) => {
    const fileMeta = metadataByFile.get(fid) || new Map();
    return rules.some((rule) => {
      const conditions = parseConditions(rule.conditions);
      return ruleMatchesFile(conditions, fileMeta);
    });
  });
}

/**
 * Same as getAccessibleFileIds but also returns the set of file IDs with write access
 * and whether the user has any write rule at all (for upload gating).
 */
export async function getAccessibleFileIdsWithLevels(params: {
  userId: string;
  companyId: string;
  isCompanyAdmin: boolean;
  userGroupIds: string[];
  metadataFilters?: PermissionCondition[];
  missingKeyFilters?: string[];
}): Promise<{ fileIds: string[]; writeFileIds: Set<string>; hasAnyWriteRule: boolean }> {
  const { userId, companyId, isCompanyAdmin, userGroupIds, metadataFilters, missingKeyFilters } = params;

  const allFiles = await prisma.file.findMany({
    where: { company_id: companyId },
    select: { id: true },
  });

  if (allFiles.length === 0) return { fileIds: [], writeFileIds: new Set(), hasAnyWriteRule: isCompanyAdmin };

  const fileIds = allFiles.map((f) => f.id);

  const allMetadata = await prisma.filesMetadataValue.findMany({
    where: { files_id: { in: fileIds }, company_id: companyId },
    select: { files_id: true, metadata_id: true, value: true },
  });

  const metadataByFile = new Map<string, Map<string, string[]>>();
  for (const m of allMetadata) {
    let fileMap = metadataByFile.get(m.files_id);
    if (!fileMap) {
      fileMap = new Map();
      metadataByFile.set(m.files_id, fileMap);
    }
    const existing = fileMap.get(m.metadata_id);
    if (existing) existing.push(m.value);
    else fileMap.set(m.metadata_id, [m.value]);
  }

  let candidateFileIds = fileIds;
  if (metadataFilters && metadataFilters.length > 0) {
    const groupedFilters = groupMetadataFiltersByKey(metadataFilters);
    candidateFileIds = candidateFileIds.filter((fid) => {
      const fileMeta = metadataByFile.get(fid) || new Map<string, string[]>();
      return Array.from(groupedFilters.entries()).every(([keyId, wantedValues]) => {
        const values = fileMeta.get(keyId);
        return values != null && values.some((value) => wantedValues.has(value));
      });
    });
  }
  if (missingKeyFilters && missingKeyFilters.length > 0) {
    candidateFileIds = candidateFileIds.filter((fid) => {
      const fileMeta = metadataByFile.get(fid) || new Map();
      return missingKeyFilters.every((keyId) => !fileMeta.has(keyId));
    });
  }

  if (isCompanyAdmin) {
    return { fileIds: candidateFileIds, writeFileIds: new Set(candidateFileIds), hasAnyWriteRule: true };
  }

  const totalRules = await prisma.documentPermissionRule.count({
    where: { company_id: companyId },
  });
  if (totalRules === 0) {
    return { fileIds: candidateFileIds, writeFileIds: new Set(), hasAnyWriteRule: false };
  }

  const rules = await getUserRules(userId, companyId, userGroupIds);
  if (rules.length === 0) return { fileIds: [], writeFileIds: new Set(), hasAnyWriteRule: false };

  const hasAnyWriteRule = rules.some((r) => r.permission_type === 'write');
  const accessibleIds: string[] = [];
  const writeFileIds = new Set<string>();

  for (const fid of candidateFileIds) {
    const fileMeta = metadataByFile.get(fid) || new Map();
    let hasAccess = false;
    for (const rule of rules) {
      const conditions = parseConditions(rule.conditions);
      if (ruleMatchesFile(conditions, fileMeta)) {
        hasAccess = true;
        if (rule.permission_type === 'write') {
          writeFileIds.add(fid);
          break;
        }
      }
    }
    if (hasAccess) accessibleIds.push(fid);
  }

  return { fileIds: accessibleIds, writeFileIds, hasAnyWriteRule };
}

/**
 * Build a virtual tree from files and their metadata, grouped by the given key order.
 * Pure function - no database calls.
 * Metadata supports multiple values per key (file appears under each value's group).
 */
export function buildVirtualTree(
  files: Array<{ id: string; name: string }>,
  metadata: Record<string, Record<string, string[]>>,
  keyOrder: Array<{ id: string; name: string }>,
): VirtualTreeNode[] {
  if (keyOrder.length === 0) {
    return files.map((f) => ({ id: f.id, name: f.name, type: 'file' as const }));
  }

  function buildLevel(
    items: Array<{ id: string; name: string }>,
    keyIndex: number,
    parentPath: string,
  ): VirtualTreeNode[] {
    if (keyIndex >= keyOrder.length) {
      return items.map((f) => ({ id: f.id, name: f.name, type: 'file' as const }));
    }

    const currentKey = keyOrder[keyIndex];
    const grouped: Record<string, Array<{ id: string; name: string }>> = {};
    const uncategorized: Array<{ id: string; name: string }> = [];

    for (const item of items) {
      const fileMeta = metadata[item.id] || {};
      const values = fileMeta[currentKey.id];
      if (values && values.length > 0) {
        for (const value of values) {
          if (value !== '') {
            if (!grouped[value]) grouped[value] = [];
            grouped[value].push(item);
          }
        }
        // If all values were empty, treat as uncategorized
        if (!values.some((v) => v !== '')) {
          uncategorized.push(item);
        }
      } else {
        uncategorized.push(item);
      }
    }

    const nodes: VirtualTreeNode[] = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, groupFiles]) => {
        const nodePath = `${parentPath}|${currentKey.id}:${value}`;
        const children = buildLevel(groupFiles, keyIndex + 1, nodePath);
        return {
          id: `node_${keyIndex}_${nodePath}`,
          name: value,
          type: 'folder' as const,
          children,
          fileCount: groupFiles.length,
          keyName: currentKey.name,
        };
      });

    if (uncategorized.length > 0) {
      const uncategorizedPath = `${parentPath}|${currentKey.id}:__uncategorized__`;
      nodes.push({
        id: `uncategorized_${keyIndex}_${uncategorizedPath}`,
        name: 'Uncategorized',
        type: 'folder' as const,
        children: buildLevel(uncategorized, keyIndex + 1, uncategorizedPath),
        fileCount: uncategorized.length,
        keyName: currentKey.name,
        isUncategorized: true,
      });
    }

    return nodes;
  }

  return buildLevel(files, 0, 'root');
}

/**
 * Get the set of allowed metadata values per condition key for a user's rules.
 * Returns a Map<keyId, Set<value>> for keys that appear in rule conditions.
 * Keys NOT in the map have no restrictions (all values allowed).
 * If a rule has empty conditions, returns null (no filtering needed — all values visible).
 */
export async function getAllowedMetadataValues(params: {
  userId: string;
  companyId: string;
  isCompanyAdmin: boolean;
  userGroupIds: string[];
}): Promise<Map<string, Set<string>> | null> {
  const { userId, companyId, isCompanyAdmin, userGroupIds } = params;

  if (isCompanyAdmin) return null;

  const totalRules = await prisma.documentPermissionRule.count({
    where: { company_id: companyId },
  });
  if (totalRules === 0) return null;

  const rules = await getUserRules(userId, companyId, userGroupIds);
  if (rules.length === 0) return new Map();

  const allowed = new Map<string, Set<string>>();

  for (const rule of rules) {
    const conditions = parseConditions(rule.conditions);
    if (conditions.length === 0) return null; // rule with no conditions = no filtering
    for (const c of conditions) {
      let set = allowed.get(c.key_id);
      if (!set) {
        set = new Set();
        allowed.set(c.key_id, set);
      }
      set.add(c.value);
    }
  }

  return allowed;
}
