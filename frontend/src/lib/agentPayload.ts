type DataStructureFieldLike = {
  id?: string;
  name?: string;
  field_type?: string;
  field_type_new?: string;
  type?: string;
  parent_item_id?: string | null;
};

/** One entry in an agent webhook's `data_to_send` / `data_to_update` array. */
export interface AgentPayloadEntry {
  key: string | null;
  name: string | null;
  value: unknown;
  type: string;
}

/**
 * Maps each top-level array field id to a child-field id -> name lookup, so array item
 * values can be re-keyed by field name for consumers.
 *
 * Mirrors buildChildFieldNameMaps in backend/src/controllers/workflow.controller.ts so
 * frontend-built agent payloads (and the dev-mode preview) match what the backend sends.
 */
function buildChildFieldNameMaps(
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

/** Indexes fields by id to a `{ name, type }` lookup, with a text-type fallback. */
function buildFieldInfoMap(
  fields: DataStructureFieldLike[]
): Record<string, { name: string; type: string }> {
  const map: Record<string, { name: string; type: string }> = {};
  for (const field of fields) {
    if (field.id) {
      map[field.id] = {
        name: field.name || field.id,
        type: field.field_type || field.field_type_new || field.type || "text",
      };
    }
  }
  return map;
}

/**
 * Builds the structured `data_to_send` / `data_to_update` arrays an agent webhook expects,
 * mirroring the backend agent-action payload builder in workflow.controller.ts.
 *
 * - `data_to_send` includes only `{{field_id}}` bindings from `apiData`.
 * - `data_to_update` is taken from the step config (parsed if it arrives as a JSON string).
 * - Array field values are re-keyed by child field name in both.
 *
 * Returns the `fieldInfoMap` it built so callers can reuse it (e.g. for response write-back).
 */
export function buildAgentDataPayload(params: {
  apiData: unknown;
  dataToUpdateConfig: unknown;
  executionDataMap: Record<string, unknown>;
  fields: DataStructureFieldLike[];
}): {
  dataToSend: AgentPayloadEntry[];
  dataToUpdate: AgentPayloadEntry[];
  fieldInfoMap: Record<string, { name: string; type: string }>;
} {
  const { apiData, dataToUpdateConfig, executionDataMap, fields } = params;
  const fieldInfoMap = buildFieldInfoMap(fields);
  const childNameMaps = buildChildFieldNameMaps(fields);

  const resolveValue = (fieldId: string): unknown => {
    const value = executionDataMap[fieldId] ?? null;
    const idToName = childNameMaps[fieldId];
    if (idToName && Array.isArray(value)) {
      return value.map((item) => mapArrayItemKeysToNames(item, idToName));
    }
    return value;
  };

  const apiDataList = Array.isArray(apiData) ? apiData : [];
  const dataToSend = apiDataList
    .map((item: any): AgentPayloadEntry | null => {
      const raw = item?.value;
      if (typeof raw !== "string" || !raw.startsWith("{{") || !raw.endsWith("}}")) {
        return null;
      }
      const fieldId = raw.slice(2, -2).trim();
      const info = fieldInfoMap[fieldId] || { name: fieldId, type: "text" };
      return { key: fieldId, name: info.name, value: resolveValue(fieldId), type: info.type };
    })
    .filter((entry): entry is AgentPayloadEntry => entry !== null);

  let normalizedUpdate: unknown = dataToUpdateConfig;
  if (typeof normalizedUpdate === "string") {
    try {
      normalizedUpdate = JSON.parse(normalizedUpdate);
    } catch {
      normalizedUpdate = [];
    }
  }
  const dataToUpdateList = Array.isArray(normalizedUpdate) ? normalizedUpdate : [];
  const dataToUpdate = dataToUpdateList.map((item: any): AgentPayloadEntry => {
    const fieldId = item?.value;
    if (!fieldId) {
      return { key: null, name: item?.key ?? null, value: null, type: "text" };
    }
    const info = fieldInfoMap[fieldId] || { name: fieldId, type: "text" };
    return { key: fieldId, name: info.name, value: resolveValue(fieldId), type: info.type };
  });

  return { dataToSend, dataToUpdate, fieldInfoMap };
}
