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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DataFieldDialog, type DataFieldToEdit } from "@/components/data/DataFieldDialog";

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  datetime: "Date & time",
  time: "Time",
  checkbox: "Checkbox",
  url: "URL",
  email: "Email",
  select: "Select (single)",
  multiselect: "Multi-select",
  attachment: "Attachment",
  link: "Link to another record",
  formula: "Formula",
  lookup: "Lookup",
};

export type DataTableFieldForEdit = {
  id: string;
  name: string;
  field_type: string;
  options: Record<string, unknown> | null;
  is_required: boolean;
  position: number;
};

interface DataTableEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  description: string | null;
  primaryFieldId: string | null;
  /** Fields for primary field dropdown (id, name). */
  fields: Array<{ id: string; name: string }>;
  /** Full field list for Fields tab (add, edit, delete). */
  fullFields: DataTableFieldForEdit[];
  onSubmit: (payload: { name: string; description: string | null; primary_field_id: string | null }) => Promise<void>;
  companyId?: string | null;
  tableFields?: Array<{ id: string; name: string; field_type: string; options?: Record<string, unknown> | null }>;
  fetchFieldsForTable?: (tableId: string) => Promise<Array<{ id: string; name: string; field_type: string }>>;
  onAddField?: (payload: { name: string; field_type: string; options: Record<string, unknown> | null; is_required: boolean; position: number }) => Promise<void>;
  onUpdateField?: (fieldId: string, payload: { name: string; field_type: string; options: Record<string, unknown> | null; is_required: boolean }) => Promise<void>;
  onDeleteField?: (fieldId: string) => void | Promise<void>;
}

export function DataTableEditDialog({
  open,
  onOpenChange,
  name: initialName,
  description: initialDescription,
  primaryFieldId: initialPrimaryFieldId,
  fields,
  fullFields,
  onSubmit,
  companyId,
  tableFields = [],
  fetchFieldsForTable,
  onAddField,
  onUpdateField,
  onDeleteField,
}: DataTableEditDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [primaryFieldId, setPrimaryFieldId] = useState<string>(initialPrimaryFieldId ?? "");
  const [saving, setSaving] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState<"add" | DataTableFieldForEdit | null>(null);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<DataTableFieldForEdit | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription ?? "");
      setPrimaryFieldId(initialPrimaryFieldId ?? "");
    } else {
      setFieldDialogOpen(null);
      setDeleteFieldTarget(null);
    }
  }, [open, initialName, initialDescription, initialPrimaryFieldId]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        primary_field_id: primaryFieldId || null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const fieldToEdit: DataFieldToEdit | null =
    fieldDialogOpen && fieldDialogOpen !== "add"
      ? {
          id: fieldDialogOpen.id,
          name: fieldDialogOpen.name,
          field_type: fieldDialogOpen.field_type,
          options: fieldDialogOpen.options,
          is_required: fieldDialogOpen.is_required,
          position: fieldDialogOpen.position,
        }
      : null;

  const handleDeleteField = () => {
    if (deleteFieldTarget && onDeleteField) {
      onDeleteField(deleteFieldTarget.id);
      setDeleteFieldTarget(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("data.editTableTitle")}</DialogTitle>
          <DialogDescription>{t("data.tableDescription")}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">{t("data.generalTab")}</TabsTrigger>
            <TabsTrigger value="fields">{t("data.fieldsTab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="table-name">{t("data.tableName")}</Label>
              <Input
                id="table-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("data.tableName")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="table-description">{t("data.tableDescription")}</Label>
              <Textarea
                id="table-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("data.tableDescriptionPlaceholder")}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("data.primaryField")}</Label>
              <Select value={primaryFieldId || "_none"} onValueChange={(v) => setPrimaryFieldId(v === "_none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("data.primaryField")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {fields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("data.primaryFieldDescription")}</p>
            </div>
          </TabsContent>
          <TabsContent value="fields" className="pt-4">
            <div className="space-y-3">
              {fullFields.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{t("data.noColumns")}</p>
              ) : (
                <ul className="space-y-1.5 max-h-[280px] overflow-y-auto rounded-md border p-2">
                  {fullFields.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium truncate block">{f.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}
                          {f.is_required ? " · " + t("data.required") : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={t("data.editField")}
                          onClick={() => setFieldDialogOpen(f)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title={t("data.deleteField")}
                          onClick={() => setDeleteFieldTarget(f)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {onAddField && companyId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setFieldDialogOpen("add")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("data.addField")}
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("data.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || saving}>
            {saving ? "..." : t("data.save")}
          </Button>
        </DialogFooter>
      </DialogContent>

      {onAddField && onUpdateField && companyId && (
        <DataFieldDialog
          open={fieldDialogOpen !== null}
          onOpenChange={(open) => !open && setFieldDialogOpen(null)}
          defaultPosition={fullFields.length}
          onSubmit={async (payload) => {
            await onAddField(payload);
            setFieldDialogOpen(null);
          }}
          fieldToEdit={fieldToEdit}
          onUpdate={async (fieldId, payload) => {
            await onUpdateField(fieldId, payload);
            setFieldDialogOpen(null);
          }}
          companyId={companyId}
          tableFields={tableFields}
          fetchFieldsForTable={fetchFieldsForTable}
        />
      )}

      {onDeleteField && (
        <AlertDialog open={!!deleteFieldTarget} onOpenChange={(open) => !open && setDeleteFieldTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("data.deleteField")}</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteFieldTarget
                  ? (t("data.deleteFieldConfirm") as string).replace("{{name}}", deleteFieldTarget.name)
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("data.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDeleteField}
              >
                {t("data.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Dialog>
  );
}
