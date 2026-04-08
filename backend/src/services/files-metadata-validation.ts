import { FilesMetadataValueKind, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type FilesMetadataKeyRow = {
  value_kind: FilesMetadataValueKind;
  allowed_values: Prisma.JsonValue;
};

export type ValidateMetadataValueResult =
  | { ok: true }
  | { ok: false; status: 400; error: string; details?: string };

/** Parse stored JSON allowed values into a clean string list (order preserved, first occurrence wins). */
export function parseAllowedValuesJson(j: Prisma.JsonValue): string[] {
  if (!Array.isArray(j)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of j) {
    if (typeof x !== 'string') continue;
    const t = x.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Normalize user input for allowed_values; returns error message or list. */
export function normalizeAllowedValuesInput(raw: unknown):
  | { ok: true; values: string[] }
  | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, values: [] };
  if (!Array.isArray(raw)) return { ok: false, message: 'allowed_values must be an array of strings' };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') return { ok: false, message: 'allowed_values must contain only strings' };
    const t = item.trim();
    if (!t) return { ok: false, message: 'allowed_values entries must be non-empty' };
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return { ok: true, values: out };
}

export function parseValueKindInput(raw: unknown): FilesMetadataValueKind | null {
  if (raw === undefined || raw === null) return null;
  if (raw === 'free_text' || raw === 'predefined_list') return raw;
  return null;
}

export function validateMetadataValueForKey(
  key: FilesMetadataKeyRow,
  rawValue: string,
): ValidateMetadataValueResult {
  const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue);
  if (key.value_kind !== 'predefined_list') return { ok: true };
  const allowed = parseAllowedValuesJson(key.allowed_values);
  if (allowed.length === 0) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid metadata value',
      details: 'This metadata key is configured as a predefined list but has no allowed values',
    };
  }
  if (!allowed.includes(value)) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid metadata value',
      details: 'Value must be one of the allowed options for this metadata key',
    };
  }
  return { ok: true };
}

/**
 * Implicitly created keys (e.g. from free-form entry names) are always free_text.
 * Enum keys must be created via the metadata-keys API with predefined_list.
 */
export async function assertMetadataValueAllowed(
  companyId: string,
  metadataId: string,
  value: string,
): Promise<ValidateMetadataValueResult> {
  const key = await prisma.filesMetadataKey.findFirst({
    where: { id: metadataId, company_id: companyId },
    select: { value_kind: true, allowed_values: true },
  });
  if (!key) {
    return { ok: false, status: 400, error: 'Invalid metadata key', details: 'Unknown metadata key' };
  }
  return validateMetadataValueForKey(key, value);
}

/** When setting predefined_list, every value currently stored for this key must appear in the new list. */
export async function assertPredefinedListCoversExistingValues(
  companyId: string,
  keyId: string,
  nextAllowed: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const allowed = new Set(nextAllowed);
  const distinct = await prisma.filesMetadataValue.findMany({
    where: { metadata_id: keyId, company_id: companyId },
    select: { value: true },
    distinct: ['value'],
  });
  for (const row of distinct) {
    if (!allowed.has(row.value)) {
      return {
        ok: false,
        message:
          'Cannot apply this predefined list: one or more files use a value that is not in the new list',
      };
    }
  }
  return { ok: true };
}

/** Block removing (or renaming away) an option that is still stored on any file. */
export async function assertEnumOptionsNotRemovedWhileInUse(
  companyId: string,
  keyId: string,
  previousAllowed: string[],
  nextAllowed: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const nextSet = new Set(nextAllowed);
  const removed = previousAllowed.filter((x) => !nextSet.has(x));
  if (removed.length === 0) return { ok: true };

  const inUse = await prisma.filesMetadataValue.findFirst({
    where: {
      company_id: companyId,
      metadata_id: keyId,
      value: { in: removed },
    },
    select: { id: true },
  });
  if (inUse) {
    return {
      ok: false,
      message: 'Cannot remove or rename an option that is still in use on one or more files',
    };
  }
  return { ok: true };
}
