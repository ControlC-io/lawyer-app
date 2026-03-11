/**
 * Migration script: Convert all `multiple_files` fields to `array` + `file` child fields.
 *
 * This is a one-time migration. After running, no `multiple_files` fields should exist.
 *
 * What it does:
 * 1. Finds all workflows whose data_structure contains field_type = "multiple_files"
 * 2. Converts each such field to field_type = "array", creates a child "file" field
 * 3. Transforms execution data (WorkflowExecution.execution_data and WorkflowExecutionData.values)
 * 4. Updates WorkflowStep form_fields config to move allowed_file_types to child field
 *
 * Run with: node dist/scripts/migrate-multiple-files.js
 */

try { require('dotenv').config(); } catch (_) { /* dotenv not available, rely on env vars */ }

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

interface DataStructureField {
  id: string;
  name: string;
  field_type: string;
  parent_item_id?: string | null;
  position?: number;
  allowed_file_types?: string[];
  [key: string]: unknown;
}

interface FormFieldConfig {
  shown?: boolean;
  readonly?: boolean;
  allowed_file_types?: string[];
  allow_ai_extraction?: boolean;
  [key: string]: unknown;
}

/**
 * Transform a single multiple_files execution value into array-of-file-objects format.
 *
 * Input formats handled:
 * - null/undefined → skip
 * - { value: ["path1", "path2"], original_name: ["name1", "name2"] }
 * - { value: "single-path", original_name: "single-name" }
 * - { value: ["path1", "path2"] } (no original_name)
 * - { value: [{ value: "path", original_name: "name" }] } (already object items)
 *
 * Output: { value: [{ _id: uuid, childFieldId: { value: "path", original_name: "name" } }, ...] }
 */
function transformFieldValue(
  fieldData: Record<string, unknown> | null | undefined,
  childFieldId: string,
): Record<string, unknown> | null {
  if (!fieldData || fieldData.value === null || fieldData.value === undefined) {
    return null;
  }

  const rawValue = fieldData.value;
  const rawOriginalName = fieldData.original_name;

  // Normalize to arrays
  let paths: string[];
  let names: string[];

  if (Array.isArray(rawValue)) {
    // Check if items are already objects (partially migrated?)
    if (rawValue.length > 0 && typeof rawValue[0] === "object" && rawValue[0] !== null && "_id" in rawValue[0]) {
      // Already in new format, skip
      return null;
    }

    // Array of strings or objects with value/original_name
    paths = rawValue.map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null && "value" in item) return String(item.value);
      return String(item);
    });

    if (Array.isArray(rawOriginalName)) {
      names = rawOriginalName.map(String);
    } else if (typeof rawOriginalName === "string") {
      names = [rawOriginalName];
    } else {
      // Extract original_name from object items if available
      names = rawValue.map((item) => {
        if (typeof item === "object" && item !== null && "original_name" in item) return String(item.original_name);
        return "";
      });
    }
  } else if (typeof rawValue === "string") {
    paths = [rawValue];
    names = typeof rawOriginalName === "string" ? [rawOriginalName] : [""];
  } else {
    // Unknown format, skip
    return null;
  }

  // Build the new array items
  const newItems = paths.map((path, i) => {
    const item: Record<string, unknown> = {
      _id: randomUUID(),
    };
    item[childFieldId] = {
      value: path,
      original_name: names[i] || "",
    };
    return item;
  });

  return { value: newItems };
}

async function main() {
  console.log("=== Migration: multiple_files → array + file child ===\n");

  let workflowsUpdated = 0;
  let fieldsConverted = 0;
  let executionDataRowsUpdated = 0;
  let executionsUpdated = 0;
  let stepsUpdated = 0;

  // 1. Find all workflows with data_structure containing multiple_files fields
  const allWorkflows = await prisma.workflow.findMany({
    select: {
      id: true,
      data_structure: true,
    },
  });

  // Map of fieldId → childFieldId for execution data transformation
  const fieldIdToChildId: Map<string, string> = new Map();
  // Track which workflow IDs need execution data migration
  const workflowIdsToMigrate: Set<string> = new Set();

  for (const workflow of allWorkflows) {
    const dataStructure = workflow.data_structure as DataStructureField[] | null;
    if (!Array.isArray(dataStructure)) continue;

    const multipleFilesFields = dataStructure.filter(
      (f) => f.field_type === "multiple_files",
    );
    if (multipleFilesFields.length === 0) continue;

    console.log(`Workflow ${workflow.id}: found ${multipleFilesFields.length} multiple_files field(s)`);

    const updatedFields: DataStructureField[] = [...dataStructure];
    const newChildFields: DataStructureField[] = [];

    for (const field of multipleFilesFields) {
      const childId = randomUUID();
      fieldIdToChildId.set(field.id, childId);

      // Find the field in updatedFields and modify it
      const idx = updatedFields.findIndex((f) => f.id === field.id);
      if (idx === -1) continue;

      // Build the child field
      const childField: DataStructureField = {
        id: childId,
        name: "file",
        field_type: "file",
        parent_item_id: field.id,
        position: 0,
      };

      // Move allowed_file_types from parent to child if present
      if (field.allowed_file_types) {
        childField.allowed_file_types = field.allowed_file_types;
      }

      // Convert parent from multiple_files to array, remove allowed_file_types
      const { allowed_file_types: _aft, ...parentWithoutAft } = updatedFields[idx];
      updatedFields[idx] = {
        ...parentWithoutAft,
        field_type: "array",
      };

      newChildFields.push(childField);
      fieldsConverted++;
    }

    // Append child fields
    const finalDataStructure = [...updatedFields, ...newChildFields];

    // Update workflow
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { data_structure: finalDataStructure as any },
    });

    workflowIdsToMigrate.add(workflow.id);
    workflowsUpdated++;
  }

  if (workflowIdsToMigrate.size === 0) {
    console.log("\nNo workflows with multiple_files fields found. Nothing to migrate.");
    await prisma.$disconnect();
    return;
  }

  // 2. Transform execution data (WorkflowExecution.execution_data)
  const fieldEntries = Array.from(fieldIdToChildId.entries());
  const workflowIds = Array.from(workflowIdsToMigrate);

  for (const workflowId of workflowIds) {
    const executions = await prisma.workflowExecution.findMany({
      where: { workflow_id: workflowId },
      select: { id: true, execution_data: true },
    });

    for (const execution of executions) {
      const execData = execution.execution_data as Record<string, any> | null;
      if (!execData || typeof execData !== "object") continue;

      let modified = false;
      const updatedData = { ...execData };

      for (const [fieldId, childId] of fieldEntries) {
        if (!(fieldId in updatedData)) continue;

        const transformed = transformFieldValue(updatedData[fieldId], childId);
        if (transformed !== null) {
          updatedData[fieldId] = transformed;
          modified = true;
        }
      }

      if (modified) {
        await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: { execution_data: updatedData as any },
        });
        executionsUpdated++;
      }
    }
  }

  // 3. Transform WorkflowExecutionData.values
  for (const workflowId of workflowIds) {
    const execDataRecords = await prisma.workflowExecutionData.findMany({
      where: {
        execution: { workflow_id: workflowId },
      },
      select: { id: true, values: true },
    });

    for (const record of execDataRecords) {
      const values = record.values as Record<string, any> | null;
      if (!values || typeof values !== "object") continue;

      let modified = false;
      const updatedValues = { ...values };

      for (const [fieldId, childId] of fieldEntries) {
        if (!(fieldId in updatedValues)) continue;

        const transformed = transformFieldValue(updatedValues[fieldId], childId);
        if (transformed !== null) {
          updatedValues[fieldId] = transformed;
          modified = true;
        }
      }

      if (modified) {
        await prisma.workflowExecutionData.update({
          where: { id: record.id },
          data: { values: updatedValues as any },
        });
        executionDataRowsUpdated++;
      }
    }
  }

  // 4. Update WorkflowStep form_fields config
  for (const workflowId of workflowIds) {
    const steps = await prisma.workflowStep.findMany({
      where: { workflow_id: workflowId },
      select: { id: true, config: true },
    });

    for (const step of steps) {
      const config = step.config as Record<string, any> | null;
      if (!config || typeof config !== "object") continue;

      const formFields = config.form_fields as Record<string, FormFieldConfig> | undefined;
      if (!formFields || typeof formFields !== "object") continue;

      let modified = false;
      const updatedFormFields = { ...formFields };

      for (const [fieldId, childId] of fieldEntries) {
        const fieldConfig = updatedFormFields[fieldId];
        if (!fieldConfig) continue;

        // If the field config has allowed_file_types, move it to a new child field entry
        if (fieldConfig.allowed_file_types) {
          const { allowed_file_types, ...parentConfigWithoutAft } = fieldConfig;

          updatedFormFields[fieldId] = parentConfigWithoutAft;

          // Create config entry for child field
          updatedFormFields[childId] = {
            shown: true,
            readonly: fieldConfig.readonly || false,
            allowed_file_types: allowed_file_types,
            allow_ai_extraction: fieldConfig.allow_ai_extraction || false,
          };

          modified = true;
        }
      }

      if (modified) {
        await prisma.workflowStep.update({
          where: { id: step.id },
          data: {
            config: {
              ...config,
              form_fields: updatedFormFields,
            } as any,
          },
        });
        stepsUpdated++;
      }
    }
  }

  // 5. Summary
  console.log("\n=== Migration Complete ===");
  console.log(`Workflows updated:          ${workflowsUpdated}`);
  console.log(`Fields converted:           ${fieldsConverted}`);
  console.log(`Executions updated:         ${executionsUpdated}`);
  console.log(`Execution data rows updated: ${executionDataRowsUpdated}`);
  console.log(`Workflow steps updated:     ${stepsUpdated}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
