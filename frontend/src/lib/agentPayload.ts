type DataStructureFieldLike = {
  id?: string;
  name?: string;
  field_type?: string;
  parent_item_id?: string | null;
};

/**
 * Maps each top-level array field id to a child-field id -> name lookup, so array item
 * values can be re-keyed by field name for consumers.
 *
 * Mirrors buildChildFieldNameMaps in backend/src/controllers/workflow.controller.ts so
 * frontend-built agent payloads (and the dev-mode preview) match what the backend sends.
 */
export function buildChildFieldNameMaps(
  fields: DataStructureFieldLike[]
): Record<string, Record<string, string>> {
  const maps: Record<string, Record<string, string>> = {};
  for (const field of fields) {
    if (field.field_type === "array" && field.id && !field.parent_item_id) {
      maps[field.id] = {};
      for (const child of fields) {
        if (child.parent_item_id === field.id && child.id && child.name) {
          maps[field.id][child.id] = child.name;
        }
      }
    }
  }
  return maps;
}

/**
 * Re-keys one array item from child field ids to child field names. `_id` and keys
 * without a matching child field are preserved as-is.
 */
function mapArrayItemKeysToNames(
  item: unknown,
  idToName: Record<string, string>
): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const itemRecord = item as Record<string, unknown>;
  const transformed: Record<string, unknown> = {};
  if (itemRecord._id) transformed._id = itemRecord._id;
  for (const [key, value] of Object.entries(itemRecord)) {
    if (key === "_id") continue;
    transformed[idToName[key] ?? key] = value;
  }
  return transformed;
}

/**
 * Returns a field value ready for an agent payload: array field values are re-keyed by
 * child field name; everything else passes through unchanged.
 */
export function resolveAgentFieldValue(
  value: unknown,
  fieldId: string,
  childNameMaps: Record<string, Record<string, string>>
): unknown {
  const idToName = childNameMaps[fieldId];
  if (idToName && Array.isArray(value)) {
    return value.map((item) => mapArrayItemKeysToNames(item, idToName));
  }
  return value;
}
