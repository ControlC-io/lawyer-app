/**
 * Airtable-style lookup and rollup: compute values from linked records.
 */

export type LinkedRecord = {
  id: string;
  data: Record<string, unknown>;
};

export type DataTableFieldLike = {
  id: string;
  field_type: string;
  options?: Record<string, unknown> | null;
};

/** Get linked record IDs from a record's link field value. */
export function getLinkedRecordIds(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((id): id is string => typeof id === "string");
  if (typeof value === "string") return [value];
  return [];
}

/**
 * Compute lookup value: for each linked record, get the lookup field's value; then first or concatenate.
 */
export function computeLookup(
  linkFieldValue: unknown,
  lookupFieldId: string,
  linkedRecordsMap: Map<string, LinkedRecord>,
  multipleRecordHandling: "first" | "concatenate" = "first"
): unknown {
  const ids = getLinkedRecordIds(linkFieldValue);
  const values: unknown[] = [];
  for (const id of ids) {
    const rec = linkedRecordsMap.get(id);
    if (!rec?.data || !(lookupFieldId in rec.data)) continue;
    const v = rec.data[lookupFieldId];
    if (v !== null && v !== undefined && v !== "") values.push(v);
  }
  if (values.length === 0) return null;
  if (multipleRecordHandling === "first") return values[0];
  return values.map(String).join(", ");
}

/**
 * Compute rollup value: aggregate (count, sum, average) the rollup field across linked records.
 */
export function computeRollup(
  linkFieldValue: unknown,
  rollupFieldId: string,
  linkedRecordsMap: Map<string, LinkedRecord>,
  aggregation: "count" | "sum" | "average"
): unknown {
  const ids = getLinkedRecordIds(linkFieldValue);
  const values: number[] = [];
  for (const id of ids) {
    const rec = linkedRecordsMap.get(id);
    if (!rec?.data || !(rollupFieldId in rec.data)) continue;
    const v = rec.data[rollupFieldId];
    if (v === null || v === undefined) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isNaN(n)) values.push(n);
  }
  if (aggregation === "count") return values.length;
  if (values.length === 0) return null;
  if (aggregation === "sum") return values.reduce((a, b) => a + b, 0);
  if (aggregation === "average") return values.reduce((a, b) => a + b, 0) / values.length;
  return null;
}
