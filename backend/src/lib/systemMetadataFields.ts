import { prisma } from './prisma';

/**
 * System metadata fields — entities that live in their OWN dedicated tables
 * (persons, document_types, …) but are surfaced uniformly in the document UI
 * as read-only "system reference" metadata: shown as tags, used in filters and
 * the virtual tree, and edited through a picker (never as free text).
 *
 * To add a future system entity (e.g. Court, Case):
 *   1. Add a nullable FK column to the `files` table (migration + schema.prisma).
 *   2. Add one entry below with its file column, source model and label column.
 *   3. Add a query branch in `loadOptions` and `loadLabels`.
 * Every consuming surface (keys list, tags, filters, tree) picks it up automatically.
 */
export interface SystemMetadataFieldDef {
  /** Synthetic, stable key id used everywhere a metadata-key id is expected. */
  id: string;
  /** Default display name (frontend may localize). */
  name: string;
  /** Column on the `files` table holding the FK. */
  fileColumn: 'person_id' | 'document_type_id';
}

export const SYSTEM_METADATA_FIELDS: SystemMetadataFieldDef[] = [
  { id: '__person__', name: 'Person', fileColumn: 'person_id' },
  { id: '__document_type__', name: 'Document Type', fileColumn: 'document_type_id' },
];

const BY_ID = new Map(SYSTEM_METADATA_FIELDS.map((f) => [f.id, f]));

export function isSystemFieldId(id: string): boolean {
  return BY_ID.has(id);
}

export function getSystemFieldDef(id: string): SystemMetadataFieldDef | undefined {
  return BY_ID.get(id);
}

export type SystemFieldOption = { value: string; label: string };

/** Available options (the rows of each source table) for a company. */
async function loadOptions(companyId: string): Promise<Record<string, SystemFieldOption[]>> {
  const [persons, documentTypes] = await Promise.all([
    prisma.person.findMany({
      where: { company_id: companyId },
      select: { id: true, full_name: true },
      orderBy: { full_name: 'asc' },
    }),
    prisma.documentType.findMany({
      where: { company_id: companyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  return {
    __person__: persons.map((p) => ({ value: p.id, label: p.full_name })),
    __document_type__: documentTypes.map((d) => ({ value: d.id, label: d.name })),
  };
}

/**
 * System fields shaped like `FilesMetadataKey` rows so they merge cleanly into
 * the metadata-keys list. `value_kind: 'system_reference'` + `system: true`
 * tell the frontend to render a picker and treat the value as read-only-by-text.
 * `allowed_values` carries the selectable options as `{ value, label }`.
 */
export async function getSystemMetadataKeys(companyId: string): Promise<Array<{
  id: string;
  name: string;
  value_kind: 'system_reference';
  system: true;
  allowed_values: SystemFieldOption[];
}>> {
  const options = await loadOptions(companyId);
  return SYSTEM_METADATA_FIELDS.map((f) => ({
    id: f.id,
    name: f.name,
    value_kind: 'system_reference' as const,
    system: true as const,
    allowed_values: options[f.id] ?? [],
  }));
}

/**
 * Inject the system FK *ids* into a `fileId -> Map<keyId, values[]>` metadata map
 * so the existing filter/permission machinery treats them like any other metadata.
 * Filter values for system keys are therefore the FK ids (robust against name clashes).
 */
export function injectSystemFieldIds(
  metadataByFile: Map<string, Map<string, string[]>>,
  files: Array<{ id: string; person_id?: string | null; document_type_id?: string | null }>,
): void {
  for (const f of files) {
    for (const def of SYSTEM_METADATA_FIELDS) {
      const fkVal = (f as Record<string, unknown>)[def.fileColumn] as string | null | undefined;
      if (!fkVal) continue;
      let fileMap = metadataByFile.get(f.id);
      if (!fileMap) {
        fileMap = new Map();
        metadataByFile.set(f.id, fileMap);
      }
      fileMap.set(def.id, [fkVal]);
    }
  }
}

/**
 * Resolve system FK ids to human labels per file, for display surfaces
 * (the virtual tree groups by these labels). Returns fileId -> keyId -> label.
 */
export async function resolveSystemFieldLabels(
  companyId: string,
  files: Array<{ id: string; person_id?: string | null; document_type_id?: string | null }>,
): Promise<Map<string, Map<string, string>>> {
  const personIds = [...new Set(files.map((f) => f.person_id).filter(Boolean))] as string[];
  const docTypeIds = [...new Set(files.map((f) => f.document_type_id).filter(Boolean))] as string[];

  const [persons, docTypes] = await Promise.all([
    personIds.length > 0
      ? prisma.person.findMany({ where: { id: { in: personIds }, company_id: companyId }, select: { id: true, full_name: true } })
      : Promise.resolve([] as Array<{ id: string; full_name: string }>),
    docTypeIds.length > 0
      ? prisma.documentType.findMany({ where: { id: { in: docTypeIds }, company_id: companyId }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);

  const personLabels = new Map(persons.map((p) => [p.id, p.full_name]));
  const docTypeLabels = new Map(docTypes.map((d) => [d.id, d.name]));

  const result = new Map<string, Map<string, string>>();
  for (const f of files) {
    const m = new Map<string, string>();
    if (f.person_id) {
      const label = personLabels.get(f.person_id);
      if (label) m.set('__person__', label);
    }
    if (f.document_type_id) {
      const label = docTypeLabels.get(f.document_type_id);
      if (label) m.set('__document_type__', label);
    }
    if (m.size > 0) result.set(f.id, m);
  }
  return result;
}
