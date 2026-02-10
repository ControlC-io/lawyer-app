import { api } from "@/lib/api";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Table2, Plus, Pencil, Trash2, MoreHorizontal, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Edit } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DataCell, type DataTableField } from "@/components/data/DataCell";
import { DataCellEditor } from "@/components/data/DataCellEditor";
import { DataFieldDialog } from "@/components/data/DataFieldDialog";
import { DataTableEditDialog } from "@/components/data/DataTableEditDialog";
import { DataRecordFormDialog } from "@/components/data/DataRecordFormDialog";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { computeLookup, type LinkedRecord } from "@/lib/dataTableLookup";

type DataTableRecordRow = { id: string; table_id: string; position: number; data: Record<string, unknown>; company_id: string | null; created_at: string; updated_at: string; created_by: string | null; [key: string]: unknown };
type DataTableFieldRow = { id: string; table_id: string; name: string; field_type: string; options: Record<string, unknown> | null; position: number; is_required: boolean; company_id: string | null; [key: string]: unknown };

type EditingCell = { recordId: string; fieldId: string } | null;

export interface DataTablePanelProps {
  tableId: string;
  onBack: () => void;
}

export function DataTablePanel({ tableId, onBack }: DataTablePanelProps) {
  const companyId = useCompanyId();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [editTableOpen, setEditTableOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [recordFormOpen, setRecordFormOpen] = useState<"add" | { edit: DataTableRecordRow } | null>(null);
  const [deleteRecordTarget, setDeleteRecordTarget] = useState<DataTableRecordRow | null>(null);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<DataTableFieldRow | null>(null);
  const [editFieldTarget, setEditFieldTarget] = useState<DataTableFieldRow | null>(null);

  const { data: table, isLoading: tableLoading, error: tableError } = useQuery({
    queryKey: ["data-table", companyId, tableId],
    queryFn: async () => {
      const list = await api.get<any[]>(`/api/companies/${companyId}/data-tables`);
      return list?.find((t) => t.id === tableId) ?? null;
    },
    enabled: !!companyId && !!tableId,
  });

  const { data: fields = [], isLoading: fieldsLoading } = useQuery({
    queryKey: ["data-table-fields", tableId],
    queryFn: async () => {
      const data = await api.get<DataTableFieldRow[]>(
        `/api/companies/${companyId}/data-tables/${tableId}/fields`
      );
      return data ?? [];
    },
    enabled: !!companyId && !!tableId,
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: ["data-table-records", tableId],
    queryFn: async () => {
      const data = await api.get<DataTableRecordRow[]>(
        `/api/companies/${companyId}/data-tables/${tableId}/records`
      );
      return data ?? [];
    },
    enabled: !!companyId && !!tableId,
  });

  const byLinkedTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const f of fields) {
      let linkedTableId: string | undefined;
      let getRecordIds: (rec: DataTableRecordRow) => string[] = () => [];
      if (f.field_type === "lookup") {
        const opts = f.options as { linked_field_id?: string } | null;
        const linkFieldId = opts?.linked_field_id;
        if (!linkFieldId) continue;
        const linkField = fields.find((x) => x.id === linkFieldId);
        linkedTableId = (linkField?.options as { linked_table_id?: string } | null)?.linked_table_id;
        getRecordIds = (rec) => {
          const raw = rec.data as Record<string, unknown> | null;
          const val = raw?.[linkFieldId];
          if (val == null) return [];
          return (Array.isArray(val) ? val : [val]).filter((id): id is string => typeof id === "string");
        };
      } else if (f.field_type === "link") {
        linkedTableId = (f.options as { linked_table_id?: string } | null)?.linked_table_id;
        if (!linkedTableId) continue;
        getRecordIds = (rec) => {
          const raw = rec.data as Record<string, unknown> | null;
          const val = raw?.[f.id];
          if (val == null) return [];
          return (Array.isArray(val) ? val : [val]).filter((id): id is string => typeof id === "string");
        };
      }
      if (!linkedTableId) continue;
      if (!map.has(linkedTableId)) map.set(linkedTableId, new Set());
      const set = map.get(linkedTableId)!;
      for (const rec of records) {
        getRecordIds(rec).forEach((id) => set.add(id));
      }
    }
    return map;
  }, [fields, records]);

  const linkedTableIds = useMemo(() => Array.from(byLinkedTable.keys()), [byLinkedTable]);

  const linkedTablesMetaQueries = useQueries({
    queries: linkedTableIds.map((linkedTableId) => ({
      queryKey: ["data-table-meta", companyId, linkedTableId],
      queryFn: async () => {
        const list = await api.get<any[]>(`/api/companies/${companyId}/data-tables`);
        const row = list?.find((t) => t.id === linkedTableId);
        return row ? { id: row.id, primary_field_id: row.primary_field_id ?? null } : null;
      },
      enabled: !!companyId && !!linkedTableId,
    })),
  });

  const linkedTablesMeta = useMemo(() => {
    const map = new Map<string, { primary_field_id: string | null }>();
    for (const result of linkedTablesMetaQueries) {
      const row = result.data;
      if (row) map.set(row.id, { primary_field_id: row.primary_field_id ?? null });
    }
    return map;
  }, [linkedTablesMetaQueries]);

  const linkedRecordsQueries = useQueries({
    queries: linkedTableIds.map((linkedTableId) => ({
      queryKey: ["data-table-linked-records", companyId, linkedTableId, Array.from(byLinkedTable.get(linkedTableId) ?? [])],
      queryFn: async () => {
        const ids = Array.from(byLinkedTable.get(linkedTableId) ?? []);
        if (ids.length === 0) return [];
        const data = await api.get<Array<{ id: string; data: Record<string, unknown> }>>(
          `/api/companies/${companyId}/data-tables/${linkedTableId}/records`
        );
        const list = data ?? [];
        return list.filter((r) => ids.includes(r.id));
      },
      enabled: !!companyId && (byLinkedTable.get(linkedTableId)?.size ?? 0) > 0,
    })),
  });

  const linkedRecordsMap = useMemo(() => {
    const map = new Map<string, LinkedRecord>();
    for (const result of linkedRecordsQueries) {
      const data = result.data ?? [];
      for (const row of data) {
        map.set(row.id, { id: row.id, data: (row.data as Record<string, unknown>) ?? {} });
      }
    }
    return map;
  }, [linkedRecordsQueries]);

  const addFieldMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      field_type: string;
      options: Record<string, unknown> | null;
      is_required: boolean;
      position: number;
    }) => {
      if (!companyId) throw new Error("Missing companyId");
      await api.post(`/api/companies/${companyId}/data-tables/${tableId}/fields`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-table-fields", tableId] });
      toast.success(t("data.save"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addRecordMutation = useMutation({
    mutationFn: async (recordData: Record<string, unknown>) => {
      if (!companyId) throw new Error("Missing companyId");
      const nextPosition = records.length;
      await api.post(`/api/companies/${companyId}/data-tables/${tableId}/records`, {
        data: recordData,
        position: nextPosition,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-table-records", tableId] });
      toast.success(t("data.addRecord"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateRecordMutation = useMutation({
    mutationFn: async ({
      recordId,
      data: newData,
    }: { recordId: string; data: Record<string, unknown> }) => {
      await api.patch(
        `/api/companies/${companyId}/data-tables/${tableId}/records/${recordId}`,
        { data: newData }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-table-records", tableId] });
      setEditingCell(null);
      toast.success(t("data.save"));
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateTableMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string | null; primary_field_id?: string | null }) => {
      await api.patch(`/api/companies/${companyId}/data-tables/${tableId}`, {
        name: payload.name,
        description: payload.description,
        primary_field_id: payload.primary_field_id ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-table", tableId] });
      toast.success(t("data.save"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (recordId: string) => {
      await api.delete(`/api/companies/${companyId}/data-tables/${tableId}/records/${recordId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-table-records", tableId] });
      setDeleteRecordTarget(null);
      toast.success(t("data.deleteRecord"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      await api.delete(`/api/companies/${companyId}/data-tables/${tableId}/fields/${fieldId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-table-fields", tableId] });
      setDeleteFieldTarget(null);
      toast.success(t("data.deleteField"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({
      fieldId,
      payload,
    }: {
      fieldId: string;
      payload: { name: string; field_type: string; options: Record<string, unknown> | null; is_required: boolean };
    }) => {
      await api.patch(
        `/api/companies/${companyId}/data-tables/${tableId}/fields/${fieldId}`,
        payload
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-table-fields", tableId] });
      setEditFieldTarget(null);
      toast.success(t("data.save"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reorderFieldMutation = useMutation({
    mutationFn: async ({ fieldId, direction }: { fieldId: string; direction: "left" | "right" }) => {
      const idx = fields.findIndex((f) => f.id === fieldId);
      if (idx < 0) return;
      const swapIdx = direction === "left" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= fields.length) return;
      const a = fields[idx];
      const b = fields[swapIdx];
      await api.patch(`/api/companies/${companyId}/data-tables/${tableId}/fields/${a.id}`, { position: b.position });
      await api.patch(`/api/companies/${companyId}/data-tables/${tableId}/fields/${b.id}`, { position: a.position });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-table-fields", tableId] });
      toast.success(t("data.save"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reorderRecordMutation = useMutation({
    mutationFn: async ({ recordId, direction }: { recordId: string; direction: "up" | "down" }) => {
      const idx = records.findIndex((r) => r.id === recordId);
      if (idx < 0) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= records.length) return;
      const a = records[idx];
      const b = records[swapIdx];
      const posA = "position" in a && typeof (a as { position: number }).position === "number" ? (a as { position: number }).position : idx;
      const posB = "position" in b && typeof (b as { position: number }).position === "number" ? (b as { position: number }).position : swapIdx;
      await api.patch(`/api/companies/${companyId}/data-tables/${tableId}/records/${a.id}`, { position: posB });
      await api.patch(`/api/companies/${companyId}/data-tables/${tableId}/records/${b.id}`, { position: posA });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-table-records", tableId] });
      toast.success(t("data.save"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSaveCell = (recordId: string, fieldId: string, value: unknown) => {
    const record = records.find((r) => r.id === recordId);
    if (!record) return;
    const current = (record.data as Record<string, unknown>) ?? {};
    const next = { ...current, [fieldId]: value };
    updateRecordMutation.mutate({ recordId, data: next });
  };

  if (!companyId) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">{t("noOrganization.description")}</p>
      </div>
    );
  }

  if (tableLoading && !table) {
    return (
      <div className="p-4">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (tableError || !table) {
    return (
      <div className="p-4 space-y-2 border rounded-lg">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("data.backToList")}
        </Button>
        <p className="text-muted-foreground text-sm">Table not found.</p>
      </div>
    );
  }

  const fieldList: DataTableField[] = fields.map((f) => ({
    id: f.id,
    name: f.name,
    field_type: f.field_type,
    options: f.options,
  }));

  return (
    <div className="flex flex-col min-h-0 border rounded-lg bg-card">
      <div className="border-b bg-muted/30 shrink-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h2 className="text-base font-semibold truncate">{table.name}</h2>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditTableOpen(true)}>
            <Pencil className="h-3 w-3 mr-1" />
            {t("data.editTable")}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAddFieldOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />
            {t("data.addField")}
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => setRecordFormOpen("add")}>
            <Plus className="h-3 w-3 mr-1" />
            {t("data.addRecord")}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 min-h-[200px]">
        {table.description && (
          <p className="text-muted-foreground text-xs mb-3 max-w-2xl">{table.description}</p>
        )}

        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
            <p className="font-medium">{t("data.noColumns")}</p>
            <p className="text-xs mt-1">{t("data.noColumnsDescription")}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setAddFieldOpen(true)}>
              {t("data.addField")}
            </Button>
          </div>
        ) : (
          <div
            className="rounded-md border overflow-x-scroll overflow-y-hidden [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-muted/50 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-border/80"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'hsl(var(--border)) hsl(var(--muted) / 0.5)',
            }}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 shrink-0 px-1 text-center text-xs" aria-label={t("data.actions")} />
                  {fieldList.map((field, colIndex) => (
                    <TableHead key={field.id} className="min-w-[120px] max-w-[240px] whitespace-nowrap text-xs">
                      <div className="flex items-center gap-1 group">
                        <span>{field.name}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onClick={() => setEditFieldTarget(fields.find((f) => f.id === field.id) ?? null)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              {t("data.editField")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={colIndex === 0 || reorderFieldMutation.isPending}
                              onClick={() => reorderFieldMutation.mutate({ fieldId: field.id, direction: "left" })}
                            >
                              <ChevronLeft className="h-4 w-4 mr-2" />
                              {t("data.moveColumnLeft")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={colIndex === fieldList.length - 1 || reorderFieldMutation.isPending}
                              onClick={() => reorderFieldMutation.mutate({ fieldId: field.id, direction: "right" })}
                            >
                              <ChevronRight className="h-4 w-4 mr-2" />
                              {t("data.moveColumnRight")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteFieldTarget(fields.find((f) => f.id === field.id) ?? null)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t("data.deleteField")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={fieldList.length + 1} className="h-16 text-center text-muted-foreground text-sm">
                      {t("data.noRecords")} — {t("data.noRecordsDescription")}
                      <Button variant="link" className="ml-2 h-auto p-0 text-xs" onClick={() => setRecordFormOpen("add")}>
                        {t("data.addRecord")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record, rowIndex) => (
                    <TableRow key={record.id}>
                      <TableCell className="w-14 shrink-0 align-top p-0.5 text-center">
                        <div className="flex items-center justify-center gap-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title={t("data.editRecord")}
                            onClick={() => setRecordFormOpen({ edit: record })}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={rowIndex === 0 || reorderRecordMutation.isPending}
                            onClick={() => reorderRecordMutation.mutate({ recordId: record.id, direction: "up" })}
                            title={t("data.moveRowUp")}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={rowIndex === records.length - 1 || reorderRecordMutation.isPending}
                            onClick={() => reorderRecordMutation.mutate({ recordId: record.id, direction: "down" })}
                            title={t("data.moveRowDown")}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => setDeleteRecordTarget(record)}
                            title={t("data.deleteRecord")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      {fieldList.map((field) => {
                        const raw = record.data as Record<string, unknown> | null;
                        let value: unknown = raw && field.id in raw ? raw[field.id] : undefined;
                        let linkDisplayValue: string | null = null;
                        if (field.field_type === "lookup") {
                          const opts = field.options as { linked_field_id?: string; lookup_field_id?: string; multiple_record_handling?: "first" | "concatenate" } | null;
                          const linkFieldId = opts?.linked_field_id;
                          const lookupFieldId = opts?.lookup_field_id;
                          if (linkFieldId && lookupFieldId) {
                            const linkValue = raw?.[linkFieldId];
                            value = computeLookup(
                              linkValue,
                              lookupFieldId,
                              linkedRecordsMap,
                              opts?.multiple_record_handling ?? "first"
                            );
                          }
                        } else if (field.field_type === "link") {
                          const linkedTableId = (field.options as { linked_table_id?: string } | null)?.linked_table_id;
                          const primaryFieldId = linkedTableId ? linkedTablesMeta.get(linkedTableId)?.primary_field_id : null;
                          const ids = (Array.isArray(value) ? value : value ? [value] : []).filter((id): id is string => typeof id === "string");
                          if (primaryFieldId && ids.length > 0) {
                            const labels = ids
                              .map((id) => {
                                const rec = linkedRecordsMap.get(id);
                                if (!rec?.data || !(primaryFieldId in rec.data)) return null;
                                const v = rec.data[primaryFieldId];
                                return v !== null && v !== undefined && v !== "" ? String(v) : null;
                              })
                              .filter((x): x is string => x != null);
                            if (labels.length > 0) linkDisplayValue = labels.join(", ");
                          }
                        }
                        const isEditing = editingCell?.recordId === record.id && editingCell?.fieldId === field.id;

                        return (
                          <TableCell key={field.id} className="min-w-[120px] max-w-[240px] align-top p-1">
                            {isEditing ? (
                              <Popover open={true} onOpenChange={(open) => !open && setEditingCell(null)}>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="w-full min-h-[26px] text-left px-2 py-0.5 rounded border border-primary bg-background text-sm"
                                  >
                                    <DataCell field={field} value={value} linkDisplayValue={linkDisplayValue} />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-auto">
                                  <DataCellEditor
                                    field={field}
                                    value={value}
                                    onSave={(v) => handleSaveCell(record.id, field.id, v)}
                                    onCancel={() => setEditingCell(null)}
                                    recordId={record.id}
                                    tableId={tableId}
                                    companyId={companyId ?? undefined}
                                  />
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <button
                                type="button"
                                className="w-full min-h-[26px] text-left px-2 py-0.5 rounded hover:bg-muted/50 text-sm"
                                onClick={() => setEditingCell({ recordId: record.id, fieldId: field.id })}
                              >
                                <DataCell
                                  field={field}
                                  value={value}
                                  linkDisplayValue={linkDisplayValue}
                                  recordId={record.id}
                                  fieldId={field.id}
                                  onSaveCell={(v) => handleSaveCell(record.id, field.id, v)}
                                />
                              </button>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <DataFieldDialog
        open={addFieldOpen || !!editFieldTarget}
        onOpenChange={(open) => {
          if (!open) {
            setAddFieldOpen(false);
            setEditFieldTarget(null);
          } else if (!editFieldTarget) setAddFieldOpen(true);
        }}
        defaultPosition={fields.length}
        onSubmit={async (payload) => {
          await addFieldMutation.mutateAsync(payload);
        }}
        fieldToEdit={editFieldTarget ? { id: editFieldTarget.id, name: editFieldTarget.name, field_type: editFieldTarget.field_type, options: editFieldTarget.options, is_required: editFieldTarget.is_required, position: editFieldTarget.position } : null}
        onUpdate={async (fieldId, payload) => {
          await updateFieldMutation.mutateAsync({ fieldId, payload });
        }}
        companyId={companyId}
        tableFields={fields.map((f) => ({ id: f.id, name: f.name, field_type: f.field_type, options: f.options }))}
        fetchFieldsForTable={async (targetTableId) => {
          const data = await api.get<Array<{ id: string; name: string; field_type: string }>>(
            `/api/companies/${companyId}/data-tables/${targetTableId}/fields`
          );
          return data ?? [];
        }}
      />

      <DataTableEditDialog
        open={editTableOpen}
        onOpenChange={setEditTableOpen}
        name={table.name}
        description={table.description}
        primaryFieldId={(table as { primary_field_id?: string | null }).primary_field_id ?? null}
        fields={fields.map((f) => ({ id: f.id, name: f.name }))}
        fullFields={fields.map((f) => ({
          id: f.id,
          name: f.name,
          field_type: f.field_type,
          options: f.options,
          is_required: f.is_required,
          position: f.position,
        }))}
        onSubmit={async (payload) => {
          await updateTableMutation.mutateAsync(payload);
        }}
        companyId={companyId}
        tableFields={fields.map((f) => ({ id: f.id, name: f.name, field_type: f.field_type, options: f.options }))}
        fetchFieldsForTable={async (targetTableId) => {
          const data = await api.get<Array<{ id: string; name: string; field_type: string }>>(
            `/api/companies/${companyId}/data-tables/${targetTableId}/fields`
          );
          return data ?? [];
        }}
        onAddField={async (payload) => {
          await addFieldMutation.mutateAsync(payload);
        }}
        onUpdateField={async (fieldId, payload) => {
          await updateFieldMutation.mutateAsync({ fieldId, payload });
        }}
        onDeleteField={(fieldId) => {
          deleteFieldMutation.mutate(fieldId);
        }}
      />

      <DataRecordFormDialog
        open={recordFormOpen !== null}
        onOpenChange={(open) => !open && setRecordFormOpen(null)}
        mode={recordFormOpen === "add" ? "add" : "edit"}
        record={recordFormOpen !== null && recordFormOpen !== "add" ? recordFormOpen.edit : null}
        tableId={tableId}
        companyId={companyId ?? ""}
        fields={fields}
        onAdd={async (data) => {
          await addRecordMutation.mutateAsync(data);
        }}
        onEdit={async (recordId, data) => {
          await updateRecordMutation.mutateAsync({ recordId, data });
        }}
      />

      <AlertDialog open={!!deleteRecordTarget} onOpenChange={(open) => !open && setDeleteRecordTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("data.deleteRecord")}</AlertDialogTitle>
            <AlertDialogDescription>{t("data.deleteRecordConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("data.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRecordTarget && deleteRecordMutation.mutate(deleteRecordTarget.id)}
            >
              {t("data.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              onClick={() => deleteFieldTarget && deleteFieldMutation.mutate(deleteFieldTarget.id)}
            >
              {t("data.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
