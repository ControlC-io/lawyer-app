import { useState } from "react";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Variable, Plus, Pencil, Trash2, MoreVertical, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { DataCell, type DataTableField } from "@/components/data/DataCell";
import { DataCellEditor } from "@/components/data/DataCellEditor";
import { GlobalVariableDialog } from "@/components/data/GlobalVariableDialog";
import type { GlobalVariablePayload } from "@/components/data/GlobalVariableDialog";

type GlobalVariableRow = {
  id: string;
  name: string;
  key: string | null;
  variable_type: string;
  position: number;
  options: Record<string, unknown> | null;
  value: unknown;
  is_locked: boolean;
  company_id: string;
  [key: string]: unknown;
};

function variableToField(v: GlobalVariableRow): DataTableField {
  return {
    id: v.id,
    name: v.name,
    field_type: v.variable_type,
    options: v.options as Record<string, unknown> | null,
  };
}

export default function GlobalVariables() {
  const companyId = useCompanyId();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GlobalVariableRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlobalVariableRow | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<GlobalVariableRow | null>(null);
  const [editingValueId, setEditingValueId] = useState<string | null>(null);

  const { data: variables = [], isLoading } = useQuery({
    queryKey: ["global-variables", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return api.get<GlobalVariableRow[]>(`/api/companies/${companyId}/global-variables`);
    },
    enabled: !!companyId,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: GlobalVariablePayload) => {
      if (!companyId) throw new Error("Missing companyId");
      await api.post(`/api/companies/${companyId}/global-variables`, {
        name: payload.name,
        key: payload.key,
        variable_type: payload.variable_type,
        position: payload.position,
        options: {},
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-variables", companyId] });
      setAddOpen(false);
      toast.success(t("data.save"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: { name?: string; key?: string | null; variable_type?: string };
    }) => {
      await api.patch(`/api/companies/${companyId}/global-variables/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-variables", companyId] });
      setEditTarget(null);
      toast.success(t("data.save"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateValueMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: unknown }) => {
      await api.patch(`/api/companies/${companyId}/global-variables/${id}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-variables", companyId] });
      setEditingValueId(null);
      toast.success(t("data.save"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/companies/${companyId}/global-variables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-variables", companyId] });
      setDeleteTarget(null);
      toast.success(t("data.save"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleLockMutation = useMutation({
    mutationFn: async ({ id, is_locked }: { id: string; is_locked: boolean }) => {
      await api.patch(`/api/companies/${companyId}/global-variables/${id}`, { is_locked });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-variables", companyId] });
      setUnlockTarget(null);
      toast.success(t("data.save"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSaveValue = (variableId: string, value: unknown) => {
    updateValueMutation.mutate({ id: variableId, value });
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
          <h1 className="text-xl font-bold tracking-tight">{t("globalVariables.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("globalVariables.subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("globalVariables.addVariable")}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm py-2">Loading...</div>
      ) : variables.length === 0 ? (
        <Card className="py-4">
          <CardHeader className="p-4 py-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Variable className="h-4 w-4" />
              {t("globalVariables.noVariables")}
            </CardTitle>
            <CardDescription className="text-sm">{t("globalVariables.noVariablesDescription")}</CardDescription>
            <Button size="sm" onClick={() => setAddOpen(true)} className="mt-3 w-fit">
              <Plus className="h-4 w-4 mr-2" />
              {t("globalVariables.addVariable")}
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">{t("globalVariables.variableName")}</TableHead>
                <TableHead className="w-[140px]">{t("globalVariables.variableType")}</TableHead>
                <TableHead>{t("globalVariables.value")}</TableHead>
                <TableHead className="w-10" aria-label={t("globalVariables.locked")} />
                <TableHead className="w-14" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {variables.map((variable) => {
                const field = variableToField(variable);
                const value = variable.value;
                const isEditing = editingValueId === variable.id;
                const isLocked = variable.is_locked ?? false;

                return (
                  <TableRow key={variable.id}>
                    <TableCell className="font-medium">{variable.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{variable.variable_type}</TableCell>
                    <TableCell className="min-w-[160px] max-w-[320px]">
                      {isEditing ? (
                        <Popover open onOpenChange={(open) => !open && setEditingValueId(null)}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="w-full min-h-[28px] text-left px-2 py-1 rounded border border-primary bg-background text-sm"
                            >
                              <DataCell field={field} value={value} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-auto">
                            <DataCellEditor
                              field={field}
                              value={value}
                              onSave={(v) => handleSaveValue(variable.id, v)}
                              onCancel={() => setEditingValueId(null)}
                              recordId={variable.id}
                              tableId="global-variables"
                              companyId={companyId ?? undefined}
                            />
                          </PopoverContent>
                        </Popover>
                      ) : isLocked ? (
                        <div className="flex items-center gap-1.5 min-h-[28px] px-2 py-1 rounded bg-muted/30 text-sm">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 truncate flex-1">
                            <DataCell field={field} value={value} />
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="w-full min-h-[28px] text-left px-2 py-1 rounded hover:bg-muted/50 text-sm"
                          onClick={() => setEditingValueId(variable.id)}
                        >
                          <DataCell field={field} value={value} />
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={isLocked ? t("globalVariables.unlockVariable") : t("globalVariables.lockVariable")}
                        onClick={() =>
                          isLocked ? setUnlockTarget(variable) : toggleLockMutation.mutate({ id: variable.id, is_locked: true })
                        }
                        disabled={toggleLockMutation.isPending}
                      >
                        {isLocked ? (
                          <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
                        ) : (
                          <Unlock className="h-4 w-4 text-muted-foreground" aria-hidden />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="p-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              isLocked ? setUnlockTarget(variable) : toggleLockMutation.mutate({ id: variable.id, is_locked: true })
                            }
                          >
                            {isLocked ? (
                              <>
                                <Unlock className="h-3 w-3 mr-2" />
                                {t("globalVariables.unlockVariable")}
                              </>
                            ) : (
                              <>
                                <Lock className="h-3 w-3 mr-2" />
                                {t("globalVariables.lockVariable")}
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditTarget(variable)}>
                            <Pencil className="h-3 w-3 mr-2" />
                            {t("globalVariables.editVariable")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(variable)}
                          >
                            <Trash2 className="h-3 w-3 mr-2" />
                            {t("globalVariables.deleteVariable")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <GlobalVariableDialog
        open={addOpen || !!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false);
            setEditTarget(null);
          } else if (!editTarget) setAddOpen(true);
        }}
        defaultPosition={variables.length}
        onSubmit={async (payload) => {
          await addMutation.mutateAsync(payload);
        }}
        variableToEdit={
          editTarget
            ? {
                id: editTarget.id,
                name: editTarget.name,
                key: editTarget.key,
                variable_type: editTarget.variable_type,
                position: editTarget.position,
              }
            : null
        }
        onUpdate={async (id, payload) => {
          await updateMutation.mutateAsync({ id, payload });
        }}
      />

      <AlertDialog open={!!unlockTarget} onOpenChange={(open) => !open && setUnlockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("globalVariables.unlockVariableConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {unlockTarget
                ? (t("globalVariables.unlockVariableConfirmDescription") as string).replace(
                    "{{name}}",
                    unlockTarget.name
                  )
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("data.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                unlockTarget && toggleLockMutation.mutate({ id: unlockTarget.id, is_locked: false })
              }
            >
              {t("globalVariables.unlockVariable")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("globalVariables.deleteVariable")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? (t("globalVariables.deleteVariableConfirm") as string).replace("{{name}}", deleteTarget.name)
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("data.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {t("data.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
