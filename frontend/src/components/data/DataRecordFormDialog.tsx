import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DateField } from "@/components/execution/form/fields/DateField";
import { DateTimeField } from "@/components/execution/form/fields/DateTimeField";
import { TimeField } from "@/components/execution/form/fields/TimeField";
import { computeLookup, type LinkedRecord } from "@/lib/dataTableLookup";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import type { DataTableField } from "./DataCell";

export type DataTableFieldRow = {
  id: string;
  name: string;
  field_type: string;
  options: Record<string, unknown> | null;
  is_required: boolean;
  position: number;
};
export type DataTableRecordRow = {
  id: string;
  table_id: string;
  data: Record<string, unknown> | null;
  position: number;
};

function getChoices(field: DataTableField): string[] {
  const opts = field.options;
  if (!opts || typeof opts !== "object") return [];
  if (Array.isArray((opts as { choices?: unknown }).choices)) {
    return ((opts as { choices: unknown[] }).choices).map((c) =>
      typeof c === "string" ? c : String((c as { value?: string }).value ?? c)
    );
  }
  if (Array.isArray((opts as { options?: unknown }).options)) {
    return ((opts as { options: unknown[] }).options).map((c) =>
      typeof c === "string" ? c : String((c as { value?: string }).value ?? c)
    );
  }
  return [];
}

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1f,;=+&%$#@!~`{}[\]()]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "") || "file";
}

interface RecordFormFieldProps {
  field: DataTableField;
  value: unknown;
  onChange: (value: unknown) => void;
  formData: Record<string, unknown>;
  allFields: DataTableField[];
  recordId?: string;
  tableId?: string;
  companyId?: string;
  isRequired?: boolean;
}

function RecordFormField({ field, value, onChange, formData, allFields, recordId, tableId, companyId, isRequired }: RecordFormFieldProps) {
  const { t } = useLanguage();
  const type = field.field_type || "text";

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const choices = getChoices(field);
  const linkedTableId = (field.options as { linked_table_id?: string } | null)?.linked_table_id;

  const lookupOpts = type === "lookup" ? (field.options as { linked_field_id?: string; lookup_field_id?: string; multiple_record_handling?: "first" | "concatenate" } | null) : null;
  const lookupLinkFieldId = lookupOpts?.linked_field_id;
  const lookupFieldId = lookupOpts?.lookup_field_id;
  const lookupHandling = lookupOpts?.multiple_record_handling ?? "first";
  const lookupLinkField = lookupLinkFieldId ? allFields.find((f) => f.id === lookupLinkFieldId) : null;
  const lookupLinkedTableId = (lookupLinkField?.options as { linked_table_id?: string } | null)?.linked_table_id;
  const lookupLinkValue = lookupLinkFieldId ? formData[lookupLinkFieldId] : null;
  const lookupRecordIds = lookupLinkValue != null && lookupLinkedTableId ? (() => {
    const ids = Array.isArray(lookupLinkValue) ? lookupLinkValue.filter((id): id is string => typeof id === "string") : typeof lookupLinkValue === "string" ? [lookupLinkValue] : [];
    return ids;
  })() : [];

  const { data: lookupLinkedRecords = [] } = useQuery({
    queryKey: ["data-table-records-lookup", companyId, lookupLinkedTableId, lookupRecordIds],
    queryFn: async () => {
      if (!companyId || !lookupLinkedTableId || lookupRecordIds.length === 0) return [];
      const list = await api.get<Array<{ id: string; data: Record<string, unknown> | null }>>(
        `/api/companies/${companyId}/data-tables/${lookupLinkedTableId}/records`
      );
      return list.filter((r) => lookupRecordIds.includes(r.id)).map((r) => ({ id: r.id, data: r.data ?? {} }));
    },
    enabled: type === "lookup" && !!companyId && !!lookupLinkedTableId && lookupRecordIds.length > 0,
  });

  const lookupDisplayValue = type === "lookup" && lookupFieldId && lookupRecordIds.length > 0 ? (() => {
    const map = new Map<string, LinkedRecord>();
    for (const row of lookupLinkedRecords) {
      map.set(row.id, { id: row.id, data: row.data ?? {} });
    }
    return computeLookup(lookupLinkValue, lookupFieldId, map, lookupHandling);
  })() : null;

  const { data: linkedRecords = [] } = useQuery({
    queryKey: ["data-table-records", companyId, linkedTableId],
    queryFn: async () => {
      if (!companyId || !linkedTableId) return [];
      const list = await api.get<Array<{ id: string; data: Record<string, unknown> | null }>>(
        `/api/companies/${companyId}/data-tables/${linkedTableId}/records`
      );
      return list.map((r) => ({ id: r.id, data: r.data ?? {} }));
    },
    enabled: type === "link" && !!companyId && !!linkedTableId,
  });

  const { data: linkedFields = [] } = useQuery({
    queryKey: ["data-table-fields", companyId, linkedTableId],
    queryFn: async () => {
      if (!companyId || !linkedTableId) return [];
      const list = await api.get<Array<{ id: string; field_type: string }>>(
        `/api/companies/${companyId}/data-tables/${linkedTableId}/fields`
      );
      return list;
    },
    enabled: type === "link" && !!companyId && !!linkedTableId,
  });

  const labelFieldId = linkedFields.find((f) => ["text", "url", "email"].includes(f.field_type))?.id ?? linkedFields[0]?.id;

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !recordId || !tableId || !companyId) return;
    setUploading(true);
    try {
      const safe = sanitizeFileName(file.name);
      const path = `data/${companyId}/${tableId}/${recordId}/${Date.now()}_${safe}`;
      const formData = new FormData();
      formData.append("path", path);
      formData.append("file", file);
      await api.postFormData<{ path: string }>("/api/files/documents/upload", formData);
      onChange(path);
      toast.success(t("data.uploadFile"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const isReadOnly = type === "formula" || type === "lookup";
  if (isReadOnly) {
    const displayValue = type === "lookup" ? lookupDisplayValue : value;
    return (
      <div className="space-y-1.5">
        <Label className="text-muted-foreground">{field.name}</Label>
        <p className="text-sm text-muted-foreground py-1.5">{displayValue != null && displayValue !== "" ? String(displayValue) : "—"}</p>
      </div>
    );
  }

  const text = value === null || value === undefined || value === "" ? "" : String(value);
  const num = typeof value === "number" ? String(value) : "";
  const checked = value === true || value === "true" || value === 1;
  const selectVal = typeof value === "string" ? value : "";
  const multiVal = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];

  const fieldWithLabel = { ...field, label: field.name };
  const showLabel = type !== "checkbox" && type !== "date" && type !== "datetime" && type !== "time";

  return (
    <div className="space-y-1.5">
      {showLabel && (
        <Label htmlFor={`record-field-${field.id}`}>
          {field.name}
          {isRequired ? " *" : ""}
        </Label>
      )}
      {type === "checkbox" && (
        <div className="flex items-center gap-2 pt-6">
          <Checkbox
            id={`record-field-${field.id}`}
            checked={checked}
            onCheckedChange={(c) => onChange(!!c)}
          />
          <Label htmlFor={`record-field-${field.id}`} className="cursor-pointer font-normal">
            {field.name}
          </Label>
        </div>
      )}
      {(type === "text" || type === "url" || type === "email") && (
        <Input
          id={`record-field-${field.id}`}
          value={text}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
          type={type === "email" ? "email" : "text"}
          placeholder={field.name}
        />
      )}
      {type === "attachment" && (
        <div className="space-y-2">
          {text && <p className="text-xs text-muted-foreground truncate">{text.split("/").pop()}</p>}
          {recordId && tableId && companyId && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleAttachmentUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {t("data.uploadFile")}
              </Button>
            </>
          )}
          <Input
            value={text}
            onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
            placeholder="Path or URL"
            className="text-sm"
          />
        </div>
      )}
      {type === "number" && (
        <Input
          id={`record-field-${field.id}`}
          type="number"
          value={num}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder={field.name}
        />
      )}
      {type === "date" && (
        <DateField
          field={fieldWithLabel}
          value={value ?? ""}
          onChange={(v) => onChange(v)}
          required={isRequired}
          labelPosition="top"
        />
      )}
      {type === "datetime" && (
        <DateTimeField
          field={fieldWithLabel}
          value={value ?? ""}
          onChange={(v) => onChange(v)}
          required={isRequired}
          labelPosition="top"
        />
      )}
      {type === "time" && (
        <TimeField
          field={fieldWithLabel}
          value={value ?? ""}
          onChange={(v) => onChange(v)}
          required={isRequired}
          labelPosition="top"
        />
      )}
      {type === "select" && (
        <Select value={selectVal || "_empty"} onValueChange={(v) => onChange(v === "_empty" ? null : v)}>
          <SelectTrigger id={`record-field-${field.id}`}>
            <SelectValue placeholder={field.name} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_empty">—</SelectItem>
            {choices.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {type === "multiselect" && (
        <div className="space-y-2 max-h-40 overflow-y-auto rounded-md border p-2">
          {choices.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <Checkbox
                id={`record-multi-${field.id}-${c}`}
                checked={multiVal.includes(c)}
                onCheckedChange={(checked) => {
                  onChange(
                    checked ? [...multiVal, c] : multiVal.filter((x) => x !== c)
                  );
                }}
              />
              <Label htmlFor={`record-multi-${field.id}-${c}`} className="text-sm font-normal cursor-pointer">
                {c}
              </Label>
            </div>
          ))}
        </div>
      )}
      {type === "link" && linkedTableId && (
        <div className="space-y-2">
          <ScrollArea className="h-40 rounded-md border p-2">
            <div className="space-y-1.5">
              {linkedRecords.map((rec) => {
                const label =
                  labelFieldId && rec.data && labelFieldId in rec.data
                    ? String(rec.data[labelFieldId] ?? rec.id)
                    : rec.id.slice(0, 8);
                const isChecked = multiVal.includes(rec.id);
                return (
                  <div key={rec.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`record-link-${field.id}-${rec.id}`}
                      checked={isChecked}
                      onCheckedChange={(c) => {
                        onChange(
                          c ? [...multiVal, rec.id] : multiVal.filter((x) => x !== rec.id)
                        );
                      }}
                    />
                    <Label
                      htmlFor={`record-link-${field.id}-${rec.id}`}
                      className="text-sm font-normal cursor-pointer truncate flex-1"
                    >
                      {label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export interface DataRecordFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  record: DataTableRecordRow | null;
  tableId: string;
  companyId: string;
  fields: DataTableFieldRow[];
  onAdd: (data: Record<string, unknown>) => void | Promise<void>;
  onEdit: (recordId: string, data: Record<string, unknown>) => void | Promise<void>;
}

export function DataRecordFormDialog({
  open,
  onOpenChange,
  mode,
  record,
  tableId,
  companyId,
  fields,
  onAdd,
  onEdit,
}: DataRecordFormDialogProps) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const initial = (record?.data as Record<string, unknown>) ?? {};
      const next: Record<string, unknown> = {};
      for (const f of fields) {
        next[f.id] = f.id in initial ? initial[f.id] : null;
      }
      setFormData(next);
    }
  }, [open, record?.data, fields]);

  const fieldList: DataTableField[] = fields.map((f) => ({
    id: f.id,
    name: f.name,
    field_type: f.field_type,
    options: f.options,
  }));

  const requiredFields = fields.filter((f) => f.is_required);

  const handleSubmit = async () => {
    const missing = requiredFields.filter((f) => {
      const v = formData[f.id];
      return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
    });
    if (missing.length > 0) {
      toast.error(t("data.requiredFieldsMissing"));
      return;
    }
    setSaving(true);
    try {
      if (mode === "add") {
        await onAdd(formData);
      } else if (record) {
        await onEdit(record.id, formData);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {mode === "add" ? t("data.addRecord") : t("data.editRecord")}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? (t("data.addRecordDescription") as string) || "Fill the fields below to create a new record."
              : (t("data.editRecordDescription") as string) || "Update the record fields below."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-2 -mr-2">
          <div className="space-y-4 py-4">
            {fieldList.map((field) => (
              <RecordFormField
                key={field.id}
                field={field}
                value={formData[field.id]}
                onChange={(value) => setFormData((prev) => ({ ...prev, [field.id]: value }))}
                formData={formData}
                allFields={fieldList}
                recordId={mode === "edit" ? record?.id : undefined}
                tableId={tableId}
                companyId={companyId}
                isRequired={fields.find((f) => f.id === field.id)?.is_required ?? false}
              />
            ))}
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("data.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {t("data.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
