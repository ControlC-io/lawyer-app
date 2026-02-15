import { Plus, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkflowStep } from "@/pages/WorkflowEditor";
import {
  type FieldValidationRule,
  type FieldValidationType,
  getValidationsForFieldType,
  VALIDATION_TYPE_CONFIG,
  VALIDATIONS_BY_FIELD_TYPE,
} from "@/lib/formConfig";

interface DataStructureField {
  id: string;
  name: string;
  field_type?: string;
  options?: string[] | null;
  parent_item_id?: string | null;
}

interface FieldValidationsEditorProps {
  step: WorkflowStep;
  dataStructureItems: Array<{
    id: string;
    name: string;
    data_structure_name: string;
    field_type?: string;
  }>;
  fullDataStructure?: DataStructureField[];
  onUpdate: (step: WorkflowStep) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFieldValidations(step: WorkflowStep): FieldValidationRule[] {
  return (step.config.field_validations as FieldValidationRule[] | undefined) ?? [];
}

/** Get only top-level fields (no array children) that are included in the form */
function getFormFieldIds(step: WorkflowStep): string[] {
  const pages = step.config.form_pages as
    | Array<{ blocks: Array<{ columns_content: string[][] }> }>
    | undefined;
  if (!pages) return [];
  const ids: string[] = [];
  for (const page of pages) {
    for (const block of page.blocks) {
      for (const col of block.columns_content) {
        ids.push(...col);
      }
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldValidationsEditor({
  step,
  dataStructureItems,
  fullDataStructure,
  onUpdate,
}: FieldValidationsEditorProps) {
  const validations = getFieldValidations(step);
  const formFieldIds = getFormFieldIds(step);

  /** All form fields with their metadata */
  const formFields = formFieldIds
    .map((id) => {
      const ds =
        fullDataStructure?.find((f) => f.id === id) ??
        dataStructureItems.find((f) => f.id === id);
      if (!ds) return null;
      return {
        id: ds.id,
        name: ds.name,
        field_type: ds.field_type ?? dataStructureItems.find((f) => f.id === id)?.field_type,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    name: string;
    field_type?: string;
  }>;

  // Only show fields that have at least one validation type available
  const validatableFields = formFields.filter((f) => {
    const types = VALIDATIONS_BY_FIELD_TYPE[f.field_type ?? ""];
    return types && types.length > 0;
  });

  // ----- mutations ----------------------------------------------------------

  function updateValidations(newValidations: FieldValidationRule[]) {
    onUpdate({
      ...step,
      config: { ...step.config, field_validations: newValidations },
    });
  }

  function addValidation() {
    const newRule: FieldValidationRule = {
      id: crypto.randomUUID(),
      target_field_id: "",
      validation_type: "min_length",
    };
    updateValidations([...validations, newRule]);
  }

  function removeValidation(ruleId: string) {
    updateValidations(validations.filter((r) => r.id !== ruleId));
  }

  function patchValidation(ruleId: string, patch: Partial<FieldValidationRule>) {
    updateValidations(
      validations.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <Label className="text-sm font-semibold">Field Validation Rules</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Validate field values on submission (format, length, range, etc.)
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addValidation}>
          <Plus className="h-4 w-4 mr-1" />
          Add Validation
        </Button>
      </div>

      {validations.length === 0 ? (
        <div className="p-4 border border-dashed rounded-md text-center">
          <p className="text-sm text-muted-foreground">
            No validation rules configured. Click &quot;Add Validation&quot; to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {validations.map((rule) => (
            <ValidationRow
              key={rule.id}
              rule={rule}
              formFields={validatableFields}
              onRemove={() => removeValidation(rule.id)}
              onPatch={(patch) => patchValidation(rule.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ValidationRowProps {
  rule: FieldValidationRule;
  formFields: Array<{
    id: string;
    name: string;
    field_type?: string;
  }>;
  onRemove: () => void;
  onPatch: (patch: Partial<FieldValidationRule>) => void;
}

function ValidationRow({ rule, formFields, onRemove, onPatch }: ValidationRowProps) {
  const targetField = formFields.find((f) => f.id === rule.target_field_id);
  const availableTypes = getValidationsForFieldType(targetField?.field_type);
  const selectedType = VALIDATION_TYPE_CONFIG[rule.validation_type];

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
      {/* Row 1: target field + validation type + delete */}
      <div className="flex items-center gap-2">
        {/* Target field */}
        <Select
          value={rule.target_field_id || "none"}
          onValueChange={(v) => {
            const newFieldId = v === "none" ? "" : v;
            const newField = formFields.find((f) => f.id === newFieldId);
            const newAvailableTypes = getValidationsForFieldType(newField?.field_type);
            // Reset validation_type if current one is not available for the new field type
            const currentTypeStillValid = newAvailableTypes.some(
              (t) => t.value === rule.validation_type,
            );
            onPatch({
              target_field_id: newFieldId,
              ...(currentTypeStillValid
                ? {}
                : {
                    validation_type: newAvailableTypes[0]?.value ?? ("min_length" as FieldValidationType),
                    value: undefined,
                  }),
            });
          }}
        >
          <SelectTrigger className="h-9 flex-1 min-w-0">
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" disabled>
              Select field...
            </SelectItem>
            {formFields.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Validation type */}
        <Select
          value={rule.validation_type}
          onValueChange={(v: string) =>
            onPatch({
              validation_type: v as FieldValidationType,
              value: undefined, // Reset value when type changes
            })
          }
        >
          <SelectTrigger className="h-9 w-[170px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableTypes.length > 0 ? (
              availableTypes.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))
            ) : (
              <SelectItem value={rule.validation_type}>
                {selectedType?.label ?? rule.validation_type}
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Row 2: value input (when needed) + custom error message */}
      <div className="flex items-center gap-2 pl-2 border-l-2 border-primary/30 ml-1">
        {selectedType?.needsValue && (
          <Input
            type={selectedType.valueInputType ?? "text"}
            className="h-9 flex-1 min-w-0"
            placeholder={selectedType.valuePlaceholder ?? "Value"}
            value={rule.value !== undefined && rule.value !== null ? String(rule.value) : ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onPatch({ value: undefined });
              } else if (selectedType.valueInputType === "number") {
                onPatch({ value: Number(raw) });
              } else {
                onPatch({ value: raw });
              }
            }}
          />
        )}
        <Input
          type="text"
          className="h-9 flex-1 min-w-0"
          placeholder="Custom error message (optional)"
          value={rule.error_message ?? ""}
          onChange={(e) => onPatch({ error_message: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
