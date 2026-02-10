import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "time", label: "Time" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "select", label: "Select (single)" },
  { value: "multiselect", label: "Multi-select" },
  { value: "attachment", label: "Attachment" },
  { value: "link", label: "Link to another record" },
  { value: "formula", label: "Formula" },
  { value: "lookup", label: "Lookup" },
] as const;

export type DataFieldPayload = {
  name: string;
  field_type: string;
  options: Record<string, unknown> | null;
  is_required: boolean;
  position: number;
};

export type DataFieldToEdit = {
  id: string;
  name: string;
  field_type: string;
  options: Record<string, unknown> | null;
  is_required: boolean;
  position: number;
};

interface DataFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: DataFieldPayload) => Promise<void>;
  defaultPosition: number;
  /** When set, dialog is in edit mode: prefill and call onUpdate on submit. */
  fieldToEdit?: DataFieldToEdit | null;
  onUpdate?: (fieldId: string, payload: Omit<DataFieldPayload, "position">) => Promise<void>;
  /** For link type: list of tables. For lookup: current table fields and fetch fields by table. */
  companyId?: string | null;
  tableFields?: Array<{ id: string; name: string; field_type: string; options?: Record<string, unknown> | null }>;
  fetchFieldsForTable?: (tableId: string) => Promise<Array<{ id: string; name: string; field_type: string }>>;
}

export function DataFieldDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultPosition,
  fieldToEdit,
  onUpdate,
  companyId,
  tableFields = [],
  fetchFieldsForTable,
}: DataFieldDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<string>("text");
  const [choicesText, setChoicesText] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formulaExpression, setFormulaExpression] = useState("");
  const [linkedTableId, setLinkedTableId] = useState<string>("");
  const [lookupLinkFieldId, setLookupLinkFieldId] = useState<string>("");
  const [lookupFieldId, setLookupFieldId] = useState<string>("");
  const [multipleRecordHandling, setMultipleRecordHandling] = useState<"first" | "concatenate">("first");

  const isEditMode = !!fieldToEdit;

  const { data: tables = [] } = useQuery({
    queryKey: ["data-tables", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const list = await api.get<Array<{ id: string; name: string }>>(
        `/api/companies/${companyId}/data-tables`
      );
      return list;
    },
    enabled: !!companyId && open && (fieldType === "link" || fieldType === "lookup"),
  });

  const linkFields = tableFields.filter((f) => f.field_type === "link");
  const selectedLinkField = tableFields.find((f) => f.id === lookupLinkFieldId);
  const linkedTableIdForLookup = (selectedLinkField?.options as { linked_table_id?: string } | undefined)?.linked_table_id;

  const { data: linkedTableFields = [] } = useQuery({
    queryKey: ["data-table-fields", linkedTableIdForLookup],
    queryFn: () => (fetchFieldsForTable && linkedTableIdForLookup ? fetchFieldsForTable(linkedTableIdForLookup) : Promise.resolve([])),
    enabled: !!linkedTableIdForLookup && !!fetchFieldsForTable && open && fieldType === "lookup",
  });

  useEffect(() => {
    if (open && fieldToEdit) {
      setName(fieldToEdit.name);
      setFieldType(fieldToEdit.field_type);
      setIsRequired(fieldToEdit.is_required);
      const opts = fieldToEdit.options as Record<string, unknown> | undefined;
      if (!opts) {
        setChoicesText("");
        setFormulaExpression("");
        setLinkedTableId("");
        setLookupLinkFieldId("");
        setLookupFieldId("");
      } else {
        if (Array.isArray(opts.choices)) setChoicesText((opts.choices as string[]).join("\n"));
        else setChoicesText("");
        if (typeof opts.formula_expression === "string") setFormulaExpression(opts.formula_expression);
        else setFormulaExpression("");
        if (typeof opts.linked_table_id === "string") setLinkedTableId(opts.linked_table_id);
        if (typeof opts.linked_field_id === "string") setLookupLinkFieldId(opts.linked_field_id);
        if (typeof opts.lookup_field_id === "string") setLookupFieldId(opts.lookup_field_id);
        if (opts.multiple_record_handling === "concatenate") setMultipleRecordHandling("concatenate");
        else setMultipleRecordHandling("first");
      }
    }
    if (open && !fieldToEdit) {
      setName("");
      setFieldType("text");
      setChoicesText("");
      setFormulaExpression("");
      setIsRequired(false);
      setLinkedTableId("");
      setLookupLinkFieldId("");
      setLookupFieldId("");
      setMultipleRecordHandling("first");
    }
  }, [open, fieldToEdit]);

  const needsChoices = fieldType === "select" || fieldType === "multiselect";
  const needsFormula = fieldType === "formula";
  const needsLink = fieldType === "link";
  const needsLookup = fieldType === "lookup";
  const choices = choicesText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      let options: Record<string, unknown> | null = null;
      if (needsChoices && choices.length > 0) options = { choices };
      if (needsFormula && formulaExpression.trim()) options = { ...(options ?? {}), formula_expression: formulaExpression.trim() };
      if (needsLink && linkedTableId) options = { ...(options ?? {}), linked_table_id: linkedTableId };
      if (needsLookup && lookupLinkFieldId && lookupFieldId) options = { linked_field_id: lookupLinkFieldId, lookup_field_id: lookupFieldId, multiple_record_handling: multipleRecordHandling };
      const payload = {
        name: name.trim(),
        field_type: fieldType,
        options,
        is_required: isRequired,
        position: defaultPosition,
      };
      if (isEditMode && fieldToEdit && onUpdate) {
        await onUpdate(fieldToEdit.id, { name: payload.name, field_type: payload.field_type, options: payload.options, is_required: payload.is_required });
      } else {
        await onSubmit(payload);
      }
      setName("");
      setFieldType("text");
      setChoicesText("");
      setFormulaExpression("");
      setIsRequired(false);
      setLinkedTableId("");
      setLookupLinkFieldId("");
      setLookupFieldId("");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    name.trim() &&
    !(
      (needsLink && !linkedTableId) ||
      (needsLookup && (!lookupLinkFieldId || !lookupFieldId))
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? t("data.editField") : t("data.addField")}</DialogTitle>
          <DialogDescription>{isEditMode ? t("data.editField") : t("data.noColumnsDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="field-name">{t("data.fieldName")}</Label>
            <Input
              id="field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("data.fieldName")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("data.fieldType")}</Label>
            <Select value={fieldType} onValueChange={setFieldType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsChoices && (
            <div className="space-y-2">
              <Label htmlFor="field-choices">{t("data.choices")}</Label>
              <Textarea
                id="field-choices"
                value={choicesText}
                onChange={(e) => setChoicesText(e.target.value)}
                placeholder={t("data.choicesPlaceholder")}
                rows={3}
                className="font-mono text-sm"
              />
            </div>
          )}
          {needsFormula && (
            <div className="space-y-2">
              <Label htmlFor="field-formula">{t("data.formulaExpression")}</Label>
              <Textarea
                id="field-formula"
                value={formulaExpression}
                onChange={(e) => setFormulaExpression(e.target.value)}
                placeholder={t("data.formulaExpressionPlaceholder")}
                rows={2}
                className="font-mono text-sm"
              />
            </div>
          )}
          {needsLink && (
            <div className="space-y-2">
              <Label>{t("data.linkedTable")}</Label>
              <Select value={linkedTableId} onValueChange={setLinkedTableId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("data.linkedTable")} />
                </SelectTrigger>
                <SelectContent>
                  {tables
                    .filter((tb) => tb.id)
                    .map((tb) => (
                      <SelectItem key={tb.id} value={tb.id}>
                        {tb.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {needsLookup && (
            <>
              <div className="space-y-2">
                <Label>{t("data.linkField")}</Label>
                <Select value={lookupLinkFieldId} onValueChange={(v) => { setLookupLinkFieldId(v); setLookupFieldId(""); }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("data.linkField")} />
                  </SelectTrigger>
                  <SelectContent>
                    {linkFields.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {lookupLinkFieldId && (
                <>
                  <div className="space-y-2">
                    <Label>{t("data.lookupField")}</Label>
                    <Select value={lookupFieldId} onValueChange={setLookupFieldId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("data.lookupField")} />
                      </SelectTrigger>
                      <SelectContent>
                        {linkedTableFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("data.multipleRecordHandling")}</Label>
                    <Select value={multipleRecordHandling} onValueChange={(v) => setMultipleRecordHandling(v as "first" | "concatenate")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="first">{t("data.multipleFirst")}</SelectItem>
                        <SelectItem value="concatenate">{t("data.multipleConcatenate")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="field-required"
              checked={isRequired}
              onCheckedChange={(c) => setIsRequired(!!c)}
            />
            <Label htmlFor="field-required" className="cursor-pointer">
              {t("data.required")}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("data.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
            {saving ? "..." : t("data.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
