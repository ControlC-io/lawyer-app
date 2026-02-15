import { Plus, Trash2, Eye, Asterisk } from "lucide-react";
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
  type FieldRule,
  getOperatorsForFieldType,
} from "@/lib/formConfig";

interface DataStructureField {
  id: string;
  name: string;
  field_type?: string;
  options?: string[] | null;
  parent_item_id?: string | null;
}

interface FieldRulesEditorProps {
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

function getFieldRules(step: WorkflowStep): FieldRule[] {
  return (step.config.field_rules as FieldRule[] | undefined) ?? [];
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

export function FieldRulesEditor({
  step,
  dataStructureItems,
  fullDataStructure,
  onUpdate,
}: FieldRulesEditorProps) {
  const rules = getFieldRules(step);
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
        field_type: ds.field_type ?? (dataStructureItems.find((f) => f.id === id)?.field_type),
        options: (ds as DataStructureField).options ?? null,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    name: string;
    field_type?: string;
    options: string[] | null;
  }>;

  // ----- mutations ----------------------------------------------------------

  function updateRules(newRules: FieldRule[]) {
    onUpdate({
      ...step,
      config: { ...step.config, field_rules: newRules },
    });
  }

  function addRule(ruleType: "visibility" | "required") {
    const newRule: FieldRule = {
      id: crypto.randomUUID(),
      target_field_id: "",
      rule_type: ruleType,
      condition: "always",
    };
    updateRules([...rules, newRule]);
  }

  function removeRule(ruleId: string) {
    updateRules(rules.filter((r) => r.id !== ruleId));
  }

  function patchRule(ruleId: string, patch: Partial<FieldRule>) {
    updateRules(
      rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    );
  }

  // ----- sub-render ---------------------------------------------------------

  const visibilityRules = rules.filter((r) => r.rule_type === "visibility");
  const requiredRules = rules.filter((r) => r.rule_type === "required");

  return (
    <div className="space-y-8">
      <RulesSection
        title="Visibility Rules"
        description="Control when a field is visible on the form."
        icon={<Eye className="h-4 w-4" />}
        ruleType="visibility"
        rules={visibilityRules}
        formFields={formFields}
        onAdd={() => addRule("visibility")}
        onRemove={removeRule}
        onPatch={patchRule}
      />
      <RulesSection
        title="Required Rules"
        description="Control when a field is required for submission."
        icon={<Asterisk className="h-4 w-4" />}
        ruleType="required"
        rules={requiredRules}
        formFields={formFields}
        onAdd={() => addRule("required")}
        onRemove={removeRule}
        onPatch={patchRule}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RulesSectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  ruleType: "visibility" | "required";
  rules: FieldRule[];
  formFields: Array<{
    id: string;
    name: string;
    field_type?: string;
    options: string[] | null;
  }>;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onPatch: (id: string, patch: Partial<FieldRule>) => void;
}

function RulesSection({
  title,
  description,
  icon,
  rules,
  formFields,
  onAdd,
  onRemove,
  onPatch,
}: RulesSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            {icon}
            <Label className="text-sm font-semibold">{title}</Label>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="p-4 border border-dashed rounded-md text-center">
          <p className="text-sm text-muted-foreground">
            No rules configured. Click &quot;Add Rule&quot; to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              formFields={formFields}
              onRemove={() => onRemove(rule.id)}
              onPatch={(patch) => onPatch(rule.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface RuleRowProps {
  rule: FieldRule;
  formFields: Array<{
    id: string;
    name: string;
    field_type?: string;
    options: string[] | null;
  }>;
  onRemove: () => void;
  onPatch: (patch: Partial<FieldRule>) => void;
}

function RuleRow({ rule, formFields, onRemove, onPatch }: RuleRowProps) {
  const sourceField = formFields.find((f) => f.id === rule.source_field_id);
  const operators = getOperatorsForFieldType(sourceField?.field_type);
  const selectedOp = operators.find((o) => o.value === rule.operator);

  // Fields available as source (exclude the target itself)
  const sourceFields = formFields.filter((f) => f.id !== rule.target_field_id);

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
      {/* Row 1: target field + condition selector + delete */}
      <div className="flex items-center gap-2">
        {/* Target field */}
        <Select
          value={rule.target_field_id || "none"}
          onValueChange={(v) => onPatch({ target_field_id: v === "none" ? "" : v })}
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

        {/* Condition: always / only_if */}
        <Select
          value={rule.condition}
          onValueChange={(v: "always" | "only_if") =>
            onPatch({
              condition: v,
              // Reset dependent fields when switching to "always"
              ...(v === "always"
                ? { source_field_id: undefined, operator: undefined, value: undefined }
                : {}),
            })
          }
        >
          <SelectTrigger className="h-9 w-[130px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="always">Always</SelectItem>
            <SelectItem value="only_if">Only if</SelectItem>
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

      {/* Row 2: condition details (only when "only_if") */}
      {rule.condition === "only_if" && (
        <div className="flex items-center gap-2 pl-2 border-l-2 border-primary/30 ml-1">
          {/* Source field */}
          <Select
            value={rule.source_field_id || "none"}
            onValueChange={(v) =>
              onPatch({
                source_field_id: v === "none" ? undefined : v,
                operator: undefined,
                value: undefined,
              })
            }
          >
            <SelectTrigger className="h-9 flex-1 min-w-0">
              <SelectValue placeholder="Select field..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>
                Select field...
              </SelectItem>
              {sourceFields.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Operator */}
          {rule.source_field_id && (
            <Select
              value={rule.operator || "none"}
              onValueChange={(v) =>
                onPatch({ operator: v === "none" ? undefined : v, value: undefined })
              }
            >
              <SelectTrigger className="h-9 w-[160px] shrink-0">
                <SelectValue placeholder="Operator..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>
                  Operator...
                </SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Value input (only when operator needs a value) */}
          {selectedOp?.needsValue && <ValueInput rule={rule} sourceField={sourceField} onPatch={onPatch} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Value input — adapts to source field type
// ---------------------------------------------------------------------------

function ValueInput({
  rule,
  sourceField,
  onPatch,
}: {
  rule: FieldRule;
  sourceField?: { field_type?: string; options: string[] | null };
  onPatch: (patch: Partial<FieldRule>) => void;
}) {
  const fieldType = sourceField?.field_type;

  // Option / multiple_option → dropdown
  if (
    (fieldType === "option" || fieldType === "multiple_option") &&
    sourceField?.options &&
    sourceField.options.length > 0
  ) {
    return (
      <Select
        value={String(rule.value ?? "none")}
        onValueChange={(v) => onPatch({ value: v === "none" ? undefined : v })}
      >
        <SelectTrigger className="h-9 flex-1 min-w-0">
          <SelectValue placeholder="Value..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" disabled>
            Value...
          </SelectItem>
          {sourceField.options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Number
  if (fieldType === "number") {
    return (
      <Input
        type="number"
        className="h-9 flex-1 min-w-0"
        placeholder="Value"
        value={rule.value !== undefined && rule.value !== null ? String(rule.value) : ""}
        onChange={(e) => {
          const val = e.target.value;
          onPatch({ value: val === "" ? undefined : Number(val) });
        }}
      />
    );
  }

  // Date / datetime / time
  if (fieldType === "date") {
    return (
      <Input
        type="date"
        className="h-9 flex-1 min-w-0"
        value={rule.value !== undefined ? String(rule.value) : ""}
        onChange={(e) => onPatch({ value: e.target.value || undefined })}
      />
    );
  }
  if (fieldType === "datetime") {
    return (
      <Input
        type="datetime-local"
        className="h-9 flex-1 min-w-0"
        value={rule.value !== undefined ? String(rule.value) : ""}
        onChange={(e) => onPatch({ value: e.target.value || undefined })}
      />
    );
  }
  if (fieldType === "time") {
    return (
      <Input
        type="time"
        className="h-9 flex-1 min-w-0"
        value={rule.value !== undefined ? String(rule.value) : ""}
        onChange={(e) => onPatch({ value: e.target.value || undefined })}
      />
    );
  }

  // Default: text input
  return (
    <Input
      type="text"
      className="h-9 flex-1 min-w-0"
      placeholder="Value"
      value={rule.value !== undefined && rule.value !== null ? String(rule.value) : ""}
      onChange={(e) => onPatch({ value: e.target.value || undefined })}
    />
  );
}
