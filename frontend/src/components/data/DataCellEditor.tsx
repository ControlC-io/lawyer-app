import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { Textarea } from "@/components/ui/textarea";
import type { DataTableField } from "./DataCell";
import { DateField } from "@/components/execution/form/fields/DateField";
import { DateTimeField } from "@/components/execution/form/fields/DateTimeField";
import { TimeField } from "@/components/execution/form/fields/TimeField";

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

interface DataCellEditorProps {
  field: DataTableField;
  value: unknown;
  onSave: (value: unknown) => void;
  onCancel: () => void;
  /** Required for attachment upload path. */
  recordId?: string;
  tableId?: string;
  companyId?: string;
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

export function DataCellEditor({ field, value, onSave, onCancel, recordId, tableId, companyId }: DataCellEditorProps) {
  const { t } = useLanguage();
  const type = field.field_type || "text";

  const [text, setText] = useState("");
  const [num, setNum] = useState<string>("");
  const [dateVal, setDateVal] = useState("");
  const [datetimeVal, setDatetimeVal] = useState("");
  const [timeVal, setTimeVal] = useState("");
  const [checked, setChecked] = useState(false);
  const [selectVal, setSelectVal] = useState<string>("");
  const [multiVal, setMultiVal] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [htmlVal, setHtmlVal] = useState("");
  useEffect(() => {
    if (value === null || value === undefined || value === "") {
      setText("");
      setHtmlVal("");
      setNum("");
      setDateVal("");
      setDatetimeVal("");
      setTimeVal("");
      setChecked(false);
      setSelectVal("");
      setMultiVal([]);
      return;
    }
    setText(String(value));
    if (type === "html") setHtmlVal(typeof value === "string" ? value : String(value));
    else setHtmlVal("");
    setNum(typeof value === "number" ? String(value) : "");
    if (type === "date") {
      try {
        const d = typeof value === "string" ? new Date(value) : (value as Date);
        if (d instanceof Date && !isNaN(d.getTime())) setDateVal(format(d, "yyyy-MM-dd"));
        else setDateVal("");
      } catch {
        setDateVal("");
      }
    } else {
      setDateVal("");
    }
    if (type === "datetime") {
      try {
        const d = typeof value === "string" ? new Date(value) : (value as Date);
        if (d instanceof Date && !isNaN(d.getTime())) setDatetimeVal(format(d, "yyyy-MM-dd'T'HH:mm"));
        else setDatetimeVal("");
      } catch {
        setDatetimeVal("");
      }
    } else {
      setDatetimeVal("");
    }
    if (type === "time") {
      if (typeof value === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
        setTimeVal(value.length === 5 ? value : value.slice(0, 5));
      } else {
        try {
          const d = typeof value === "string" ? new Date("1970-01-01T" + value) : (value as Date);
          if (d instanceof Date && !isNaN(d.getTime())) setTimeVal(format(d, "HH:mm"));
          else setTimeVal("");
        } catch {
          setTimeVal("");
        }
      }
    } else {
      setTimeVal("");
    }
    setChecked(value === true || value === "true" || value === 1);
    setSelectVal(typeof value === "string" ? value : "");
    setMultiVal(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  }, [value, type]);

  const choices = getChoices(field);

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !recordId || !companyId) return;
    if (tableId !== "global-variables" && !tableId) return;
    setUploading(true);
    try {
      const safe = sanitizeFileName(file.name);
      const path =
        tableId === "global-variables"
          ? `global-variables/${companyId}/${recordId}/${Date.now()}_${safe}`
          : `data/${companyId}/${tableId}/${recordId}/${Date.now()}_${safe}`;
      const formData = new FormData();
      formData.append("path", path);
      formData.append("file", file);
      await api.postFormData<{ path: string }>("/api/files/documents/upload", formData);
      setText(path);
      toast.success(t("data.uploadFile"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = () => {
    switch (type) {
      case "text":
      case "url":
      case "email":
      case "attachment":
      case "file":
      case "formula":
      case "lookup":
        onSave(text === "" ? null : text);
        break;
      case "html":
        onSave(htmlVal === "" ? null : htmlVal);
        break;
      case "number":
        onSave(num === "" ? null : Number(num));
        break;
      case "date":
        onSave(dateVal === "" ? null : dateVal);
        break;
      case "datetime":
        onSave(datetimeVal === "" ? null : datetimeVal);
        break;
      case "time":
        onSave(timeVal === "" ? null : timeVal);
        break;
      case "checkbox":
      case "boolean":
        onSave(checked);
        break;
      case "select":
        onSave(selectVal === "" ? null : selectVal);
        break;
      case "multiselect":
        onSave(multiVal.length === 0 ? null : multiVal);
        break;
      case "link":
        onSave(multiVal.length === 0 ? null : multiVal);
        break;
      default:
        onSave(text === "" ? null : text);
    }
  };

  const linkedTableId = (field.options as { linked_table_id?: string } | null)?.linked_table_id;
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
      return api.get<Array<{ id: string; field_type: string }>>(
        `/api/companies/${companyId}/data-tables/${linkedTableId}/fields`
      );
    },
    enabled: type === "link" && !!companyId && !!linkedTableId,
  });
  const labelFieldId = linkedFields.find((f) => ["text", "url", "email"].includes(f.field_type))?.id ?? linkedFields[0]?.id;

  const isReadOnly = type === "formula" || type === "lookup";
  if (isReadOnly) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{String(value ?? "—")}</p>
        <Button size="sm" variant="outline" onClick={onCancel}>
          {t("data.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-[200px]">
      {(type === "checkbox" || type === "boolean") && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="cell-checkbox"
            checked={checked}
            onCheckedChange={(c) => setChecked(!!c)}
          />
          <label htmlFor="cell-checkbox" className="text-sm cursor-pointer">
            {field.name}
          </label>
        </div>
      )}
      {(type === "text" || type === "url" || type === "email") && (
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          type={type === "email" ? "email" : "text"}
          placeholder={field.name}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") onCancel();
          }}
        />
      )}
      {(type === "attachment" || type === "file") && (
        <div className="space-y-2">
          {text && <p className="text-xs text-muted-foreground truncate">{text.split("/").pop()}</p>}
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
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Or paste path/URL"
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
      )}
      {type === "html" && (
        <Textarea
          value={htmlVal}
          onChange={(e) => setHtmlVal(e.target.value)}
          placeholder={field.name}
          className="min-w-[280px] min-h-[120px]"
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
      )}
      {type === "number" && (
        <Input
          type="number"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          placeholder={field.name}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") onCancel();
          }}
        />
      )}
      {type === "date" && (
        <DateField
          field={{ ...field, label: field.name }}
          value={dateVal || value}
          onChange={(v) => setDateVal(v ?? "")}
          labelPosition="top"
        />
      )}
      {type === "datetime" && (
        <DateTimeField
          field={{ ...field, label: field.name }}
          value={datetimeVal || value}
          onChange={(v) => setDatetimeVal(v ?? "")}
          labelPosition="top"
        />
      )}
      {type === "time" && (
        <TimeField
          field={{ ...field, label: field.name }}
          value={timeVal || value}
          onChange={(v) => setTimeVal(v ?? "")}
          labelPosition="top"
        />
      )}
      {type === "select" && (
        <Select value={selectVal || "_empty"} onValueChange={(v) => setSelectVal(v === "_empty" ? "" : v)}>
          <SelectTrigger>
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
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {choices.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <Checkbox
                id={`multi-${c}`}
                checked={multiVal.includes(c)}
                onCheckedChange={(checked) => {
                  setMultiVal((prev) =>
                    checked ? [...prev, c] : prev.filter((x) => x !== c)
                  );
                }}
              />
              <label htmlFor={`multi-${c}`} className="text-sm cursor-pointer">
                {c}
              </label>
            </div>
          ))}
        </div>
      )}
      {type === "link" && linkedTableId && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{(t("data.linkedRecords") as string).replace("{{count}}", String(multiVal.length))}</p>
          <ScrollArea className="h-48 rounded border p-2">
            <div className="space-y-1.5">
              {linkedRecords.map((rec) => {
                const label = labelFieldId && rec.data && labelFieldId in rec.data
                  ? String(rec.data[labelFieldId] ?? rec.id)
                  : rec.id.slice(0, 8);
                const checked = multiVal.includes(rec.id);
                return (
                  <div key={rec.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`link-${rec.id}`}
                      checked={checked}
                      onCheckedChange={(c) => {
                        setMultiVal((prev) =>
                          c ? [...prev, rec.id] : prev.filter((x) => x !== rec.id)
                        );
                      }}
                    />
                    <label htmlFor={`link-${rec.id}`} className="text-sm cursor-pointer truncate flex-1">
                      {label}
                    </label>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave}>
          {t("data.save")}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          {t("data.cancel")}
        </Button>
      </div>
    </div>
  );
}
