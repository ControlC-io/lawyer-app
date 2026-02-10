import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Table2, Plus, Trash2, MoreVertical, Pencil, Copy } from "lucide-react";
import { toast } from "sonner";
import { DataTablePanel } from "@/components/data/DataTablePanel";

type DataTableRow = { id: string; name: string; description: string | null; position: number; company_id: string; primary_field_id: string | null; [key: string]: unknown };

export default function Data() {
  const companyId = useCompanyId();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { tableId: selectedTableId } = useParams<{ tableId?: string }>();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DataTableRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DataTableRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["data-tables", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const list = await api.get<DataTableRow[]>(`/api/companies/${companyId}/data-tables`);
      return list ?? [];
    },
    enabled: !!companyId,
  });

  const createTable = async () => {
    if (!companyId || !name.trim()) return;
    try {
      await api.post(`/api/companies/${companyId}/data-tables`, {
        name: name.trim(),
        description: description.trim() || null,
        position: tables.length,
      });
      toast.success(t("data.create") + " OK");
      queryClient.invalidateQueries({ queryKey: ["data-tables", companyId] });
      setCreateOpen(false);
      setName("");
      setDescription("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const updateTable = async () => {
    if (!editTarget || !name.trim() || !companyId) return;
    try {
      await api.patch(`/api/companies/${companyId}/data-tables/${editTarget.id}`, {
        name: name.trim(),
        description: description.trim() || null,
      });
      toast.success(t("data.save") + " OK");
      queryClient.invalidateQueries({ queryKey: ["data-tables", companyId] });
      setEditTarget(null);
      setName("");
      setDescription("");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const duplicateTable = async (table: DataTableRow) => {
    if (!companyId) return;
    try {
      await api.post(`/api/companies/${companyId}/data-tables/${table.id}/copy`, {
        name: `${table.name} (${t("data.copy")})`,
      });
      toast.success(t("data.duplicateTable") + " OK");
      queryClient.invalidateQueries({ queryKey: ["data-tables", companyId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const deleteTable = async () => {
    if (!deleteTarget || !companyId) return;
    try {
      await api.delete(`/api/companies/${companyId}/data-tables/${deleteTarget.id}`);
      toast.success(t("data.delete") + " OK");
      queryClient.invalidateQueries({ queryKey: ["data-tables", companyId] });
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  if (!companyId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("noOrganization.description")}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("data.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("data.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("data.createTable")}
        </Button>
      </div>

      {/* Compact table list */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm py-2">Loading...</div>
      ) : tables.length === 0 ? (
        <Card className="py-4">
          <CardHeader className="p-4 py-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Table2 className="h-4 w-4" />
              {t("data.noTables")}
            </CardTitle>
            <CardDescription className="text-sm">{t("data.noTablesDescription")}</CardDescription>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-3 w-fit">
              <Plus className="h-4 w-4 mr-2" />
              {t("data.createTable")}
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {tables.map((table) => (
            <Card
              key={table.id}
              className={`cursor-pointer transition-colors hover:bg-muted/50 py-2 px-3 ${selectedTableId === table.id ? "ring-2 ring-primary bg-muted/50" : ""}`}
              onClick={() => navigate(`/data/${table.id}`)}
            >
              <div className="flex flex-row items-center justify-between gap-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{table.name}</span>
                </div>
                <div className="flex items-center gap-0 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title={t("data.actions")}>
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTarget(table);
                          setName(table.name);
                          setDescription(table.description ?? "");
                        }}
                      >
                        <Pencil className="h-3 w-3 mr-2" />
                        {t("data.editTable")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateTable(table);
                        }}
                      >
                        <Copy className="h-3 w-3 mr-2" />
                        {t("data.duplicateTable")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(table);
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-2" />
                        {t("data.deleteTable")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {table.description && (
                <p className="text-muted-foreground text-xs truncate mt-0.5 pl-6">{table.description}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Table detail below when a table is selected */}
      {selectedTableId && (
        <div className="flex-1 min-h-0 pt-2 border-t">
          <DataTablePanel tableId={selectedTableId} onBack={() => navigate("/data")} />
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setName("");
            setDescription("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("data.createTable")}</DialogTitle>
            <DialogDescription>{t("data.noTablesDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("data.cancel")}
            </Button>
            <Button onClick={createTable} disabled={!name.trim()}>
              {t("data.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setName("");
            setDescription("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("data.editTableTitle")}</DialogTitle>
            <DialogDescription>{t("data.noTablesDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-table-name">{t("data.tableName")}</Label>
              <Input
                id="edit-table-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("data.tableName")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-table-description">{t("data.tableDescription")}</Label>
              <Textarea
                id="edit-table-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("data.tableDescriptionPlaceholder")}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              {t("data.cancel")}
            </Button>
            <Button onClick={updateTable} disabled={!name.trim()}>
              {t("data.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("data.deleteTable")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? (t("data.deleteTableConfirm") as string).replace("{{name}}", deleteTarget.name)
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("data.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTable} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("data.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
