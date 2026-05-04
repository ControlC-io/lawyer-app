import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Archive, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type EntityKey = "workflows" | "executions" | "agents" | "documents";
type CompanyAwareEntity = Exclude<EntityKey, "agents">;

const ALL_COMPANIES = "all";
const NO_COMPANY = "__no_company__";

interface ArchivedWorkflow {
  id: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
  archived_datetime: string | null;
}

interface ArchivedExecution {
  id: string;
  name: string;
  workflow_name: string | null;
  company_id: string | null;
  company_name: string | null;
  workflow_archived: boolean;
  archived_datetime: string | null;
}

interface ArchivedAgentConfig {
  id: string;
  name: string;
  agent_type: string | null;
  archived_datetime: string | null;
}

interface ArchivedDocument {
  id: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
  mime_type: string | null;
  archived_datetime: string | null;
}

interface ArchivedPayload {
  workflows: ArchivedWorkflow[];
  workflow_executions: ArchivedExecution[];
  agent_configurations: ArchivedAgentConfig[];
  documents: ArchivedDocument[];
}

interface BulkDeleteResponse {
  deleted: string[];
  skipped: { id: string; reason: "not_found" | "workflow_archived" }[];
}

type SelectionState = Record<CompanyAwareEntity, Set<string>>;

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const emptySelection = (): SelectionState => ({
  workflows: new Set<string>(),
  executions: new Set<string>(),
  documents: new Set<string>(),
});

const tString = (
  value: string | string[],
  fallback: string,
): string => (typeof value === "string" ? value : fallback);

export default function ArchivedRecords() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<CompanyAwareEntity | null>(null);
  const [data, setData] = useState<ArchivedPayload>({
    workflows: [],
    workflow_executions: [],
    agent_configurations: [],
    documents: [],
  });
  const [companyFilter, setCompanyFilter] = useState<string>(ALL_COMPANIES);
  const [selected, setSelected] = useState<SelectionState>(emptySelection);
  const [confirmDelete, setConfirmDelete] = useState<{
    entity: CompanyAwareEntity;
    ids: string[];
  } | null>(null);

  const total = useMemo(
    () =>
      data.workflows.length +
      data.workflow_executions.length +
      data.agent_configurations.length +
      data.documents.length,
    [data],
  );

  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    let hasNullCompany = false;
    const visit = (
      records: { company_id: string | null; company_name: string | null }[],
    ) => {
      for (const record of records) {
        if (record.company_id) {
          if (!map.has(record.company_id)) {
            map.set(record.company_id, record.company_name || record.company_id);
          }
        } else {
          hasNullCompany = true;
        }
      }
    };
    visit(data.workflows);
    visit(data.workflow_executions);
    visit(data.documents);
    const list = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    return { list, hasNullCompany };
  }, [data]);

  const matchesCompanyFilter = (companyId: string | null): boolean => {
    if (companyFilter === ALL_COMPANIES) return true;
    if (companyFilter === NO_COMPANY) return companyId === null;
    return companyId === companyFilter;
  };

  const filteredWorkflows = useMemo(
    () => data.workflows.filter((record) => matchesCompanyFilter(record.company_id)),
    [data.workflows, companyFilter],
  );
  const filteredExecutions = useMemo(
    () =>
      data.workflow_executions.filter((record) =>
        matchesCompanyFilter(record.company_id),
      ),
    [data.workflow_executions, companyFilter],
  );
  const filteredDocuments = useMemo(
    () => data.documents.filter((record) => matchesCompanyFilter(record.company_id)),
    [data.documents, companyFilter],
  );

  // Prune selection ids that are no longer visible after filter / data changes.
  useEffect(() => {
    setSelected((prev) => {
      const visible: Record<CompanyAwareEntity, Set<string>> = {
        workflows: new Set(filteredWorkflows.map((record) => record.id)),
        executions: new Set(filteredExecutions.map((record) => record.id)),
        documents: new Set(filteredDocuments.map((record) => record.id)),
      };
      let changed = false;
      const next: SelectionState = {
        workflows: new Set<string>(),
        executions: new Set<string>(),
        documents: new Set<string>(),
      };
      (Object.keys(prev) as CompanyAwareEntity[]).forEach((key) => {
        prev[key].forEach((id) => {
          if (visible[key].has(id)) {
            next[key].add(id);
          } else {
            changed = true;
          }
        });
      });
      return changed ? next : prev;
    });
  }, [filteredWorkflows, filteredExecutions, filteredDocuments]);

  const loadArchived = async () => {
    setLoading(true);
    try {
      const response = await api.get<ArchivedPayload>("/api/admin/archived");
      setData(response);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tString(t("superAdmin.archivedRecords.loadError"), "Unable to load archived records"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArchived();
  }, []);

  const unarchive = async (entity: EntityKey, id: string) => {
    const key = `${entity}:${id}`;
    setBusyKey(key);
    try {
      await api.post(`/api/admin/archived/${entity}/${id}/unarchive`);
      setData((prev) => ({
        workflows: entity === "workflows" ? prev.workflows.filter((record) => record.id !== id) : prev.workflows,
        workflow_executions:
          entity === "executions"
            ? prev.workflow_executions.filter((record) => record.id !== id)
            : prev.workflow_executions,
        agent_configurations:
          entity === "agents"
            ? prev.agent_configurations.filter((record) => record.id !== id)
            : prev.agent_configurations,
        documents: entity === "documents" ? prev.documents.filter((record) => record.id !== id) : prev.documents,
      }));
      toast.success(tString(t("superAdmin.archivedRecords.unarchiveSuccess"), "Record restored"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tString(t("superAdmin.archivedRecords.unarchiveError"), "Unable to restore record"),
      );
    } finally {
      setBusyKey(null);
    }
  };

  const toggleSelected = (entity: CompanyAwareEntity, id: string) => {
    setSelected((prev) => {
      const next = new Set(prev[entity]);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...prev, [entity]: next };
    });
  };

  const setSectionSelection = (entity: CompanyAwareEntity, ids: string[]) => {
    setSelected((prev) => ({ ...prev, [entity]: new Set(ids) }));
  };

  const visibleIdsByEntity: Record<CompanyAwareEntity, string[]> = {
    workflows: filteredWorkflows.map((record) => record.id),
    executions: filteredExecutions.map((record) => record.id),
    documents: filteredDocuments.map((record) => record.id),
  };

  const isAllSelected = (entity: CompanyAwareEntity) => {
    const ids = visibleIdsByEntity[entity];
    if (ids.length === 0) return false;
    return ids.every((id) => selected[entity].has(id));
  };

  const handleToggleAll = (entity: CompanyAwareEntity) => {
    if (isAllSelected(entity)) {
      setSectionSelection(entity, []);
    } else {
      setSectionSelection(entity, visibleIdsByEntity[entity]);
    }
  };

  const requestBulkDelete = (entity: CompanyAwareEntity) => {
    const ids = Array.from(selected[entity]);
    if (ids.length === 0) return;
    setConfirmDelete({ entity, ids });
  };

  const performBulkDelete = async () => {
    if (!confirmDelete) return;
    const { entity, ids } = confirmDelete;
    setBulkBusy(entity);
    try {
      const response = await api.post<BulkDeleteResponse>(
        `/api/admin/archived/${entity}/bulk-delete`,
        { ids },
      );
      const deletedSet = new Set(response.deleted);
      setData((prev) => ({
        ...prev,
        workflows:
          entity === "workflows"
            ? prev.workflows.filter((record) => !deletedSet.has(record.id))
            : prev.workflows,
        workflow_executions:
          entity === "executions"
            ? prev.workflow_executions.filter((record) => !deletedSet.has(record.id))
            : prev.workflow_executions,
        documents:
          entity === "documents"
            ? prev.documents.filter((record) => !deletedSet.has(record.id))
            : prev.documents,
      }));
      setSelected((prev) => {
        const next = new Set(prev[entity]);
        deletedSet.forEach((id) => next.delete(id));
        return { ...prev, [entity]: next };
      });

      const deletedCount = response.deleted.length;
      const skippedCount = response.skipped.length;
      const totalCount = ids.length;

      if (skippedCount === 0) {
        toast.success(
          tString(
            t("superAdmin.archivedRecords.deleteSuccess", { count: String(deletedCount) }),
            `${deletedCount} record(s) deleted`,
          ),
        );
      } else {
        toast.warning(
          tString(
            t("superAdmin.archivedRecords.deletePartial", {
              deleted: String(deletedCount),
              total: String(totalCount),
              skipped: String(skippedCount),
            }),
            `${deletedCount}/${totalCount} record(s) deleted; ${skippedCount} skipped`,
          ),
        );
        const notFoundCount = response.skipped.filter((entry) => entry.reason === "not_found").length;
        const blockedCount = response.skipped.filter(
          (entry) => entry.reason === "workflow_archived",
        ).length;
        if (notFoundCount > 0) {
          toast.message(
            tString(
              t("superAdmin.archivedRecords.deleteSkippedNotFound", {
                count: String(notFoundCount),
              }),
              `${notFoundCount} record(s) were no longer archived`,
            ),
          );
        }
        if (blockedCount > 0) {
          toast.message(
            tString(
              t("superAdmin.archivedRecords.deleteSkippedWorkflowArchived", {
                count: String(blockedCount),
              }),
              `${blockedCount} record(s) skipped because the parent workflow is still archived`,
            ),
          );
        }
      }
      setConfirmDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tString(t("superAdmin.archivedRecords.deleteError"), "Unable to delete records"),
      );
    } finally {
      setBulkBusy(null);
    }
  };

  const renderBulkHeader = (entity: CompanyAwareEntity, visibleCount: number) => {
    const sectionSelected = selected[entity];
    const sectionSelectedCount = sectionSelected.size;
    const allChecked = isAllSelected(entity);
    const someChecked = sectionSelectedCount > 0 && !allChecked;
    return (
      <div className="flex items-center justify-between gap-2 pb-2 border-b">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <Checkbox
            checked={allChecked ? true : someChecked ? "indeterminate" : false}
            onCheckedChange={() => handleToggleAll(entity)}
            disabled={visibleCount === 0 || bulkBusy === entity}
            aria-label={tString(t("superAdmin.archivedRecords.selectAll"), "Select all")}
          />
          {sectionSelectedCount > 0 ? (
            <span>
              {tString(
                t("superAdmin.archivedRecords.selectedCount", {
                  count: String(sectionSelectedCount),
                }),
                `${sectionSelectedCount} selected`,
              )}
            </span>
          ) : (
            <span>{tString(t("superAdmin.archivedRecords.selectAll"), "Select all")}</span>
          )}
        </label>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => requestBulkDelete(entity)}
          disabled={sectionSelectedCount === 0 || bulkBusy === entity}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          {tString(
            t("superAdmin.archivedRecords.deletePermanently", {
              count: String(sectionSelectedCount),
            }),
            `Delete permanently (${sectionSelectedCount})`,
          )}
        </Button>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("superAdmin.archivedRecords.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t("superAdmin.archivedRecords.description")}</p>
        </div>
        <Badge variant="secondary">{`${t("superAdmin.archivedRecords.total")}: ${total}`}</Badge>
      </div>

      <div className="flex items-center gap-3">
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-[260px]">
            <SelectValue
              placeholder={tString(
                t("superAdmin.archivedRecords.filterByCompany"),
                "Filter by company",
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_COMPANIES}>
              {tString(t("superAdmin.archivedRecords.allCompanies"), "All companies")}
            </SelectItem>
            {companyOptions.hasNullCompany && (
              <SelectItem value={NO_COMPANY}>
                {tString(t("superAdmin.archivedRecords.noCompany"), "No company")}
              </SelectItem>
            )}
            {companyOptions.list.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("superAdmin.archivedRecords.workflows")}</CardTitle>
            <CardDescription>{`${filteredWorkflows.length} ${t("superAdmin.archivedRecords.records")}`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.loading")}</p>
            ) : filteredWorkflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.empty")}</p>
            ) : (
              <>
                {renderBulkHeader("workflows", filteredWorkflows.length)}
                {filteredWorkflows.map((record) => (
                  <div key={record.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <Checkbox
                        className="mt-1"
                        checked={selected.workflows.has(record.id)}
                        onCheckedChange={() => toggleSelected("workflows", record.id)}
                        disabled={bulkBusy === "workflows"}
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{record.name || record.id}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {record.company_name || "-"} - {formatDate(record.archived_datetime)}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unarchive("workflows", record.id)}
                      disabled={busyKey === `workflows:${record.id}` || bulkBusy === "workflows"}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      {t("superAdmin.archivedRecords.unarchive")}
                    </Button>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("superAdmin.archivedRecords.executions")}</CardTitle>
            <CardDescription>{`${filteredExecutions.length} ${t("superAdmin.archivedRecords.records")}`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.loading")}</p>
            ) : filteredExecutions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.empty")}</p>
            ) : (
              <>
                {renderBulkHeader("executions", filteredExecutions.length)}
                {filteredExecutions.map((record) => (
                  <div key={record.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <Checkbox
                        className="mt-1"
                        checked={selected.executions.has(record.id)}
                        onCheckedChange={() => toggleSelected("executions", record.id)}
                        disabled={bulkBusy === "executions"}
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{record.name || record.id}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {record.company_name || "-"} - {record.workflow_name || "-"} - {formatDate(record.archived_datetime)}
                        </p>
                        {record.workflow_archived && (
                          <p className="text-xs text-amber-600">{t("superAdmin.archivedRecords.executionBlocked")}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unarchive("executions", record.id)}
                      disabled={
                        busyKey === `executions:${record.id}` ||
                        record.workflow_archived ||
                        bulkBusy === "executions"
                      }
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      {t("superAdmin.archivedRecords.unarchive")}
                    </Button>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("superAdmin.archivedRecords.agentConfigurations")}</CardTitle>
            <CardDescription>{`${data.agent_configurations.length} ${t("superAdmin.archivedRecords.records")}`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.loading")}</p>
            ) : data.agent_configurations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.empty")}</p>
            ) : (
              data.agent_configurations.map((record) => (
                <div key={record.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{record.name || record.id}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {record.agent_type || "-"} - {formatDate(record.archived_datetime)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unarchive("agents", record.id)}
                    disabled={busyKey === `agents:${record.id}`}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    {t("superAdmin.archivedRecords.unarchive")}
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("superAdmin.archivedRecords.documents")}</CardTitle>
            <CardDescription>{`${filteredDocuments.length} ${t("superAdmin.archivedRecords.records")}`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.loading")}</p>
            ) : filteredDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.empty")}</p>
            ) : (
              <>
                {renderBulkHeader("documents", filteredDocuments.length)}
                {filteredDocuments.map((record) => (
                  <div key={record.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <Checkbox
                        className="mt-1"
                        checked={selected.documents.has(record.id)}
                        onCheckedChange={() => toggleSelected("documents", record.id)}
                        disabled={bulkBusy === "documents"}
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{record.name || record.id}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {record.company_name || "-"} - {record.mime_type || "-"} - {formatDate(record.archived_datetime)}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unarchive("documents", record.id)}
                      disabled={busyKey === `documents:${record.id}` || bulkBusy === "documents"}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      {t("superAdmin.archivedRecords.unarchive")}
                    </Button>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {!loading && total === 0 && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center justify-center text-center">
            <Archive className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.emptyAll")}</p>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open && bulkBusy === null) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tString(
                t("superAdmin.archivedRecords.deleteConfirmTitle"),
                "Delete archived records permanently?",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tString(
                t("superAdmin.archivedRecords.deleteConfirmDescription", {
                  count: String(confirmDelete?.ids.length ?? 0),
                }),
                `This will permanently delete ${confirmDelete?.ids.length ?? 0} archived record(s) and all related data. This action cannot be undone.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy !== null}>
              {tString(t("superAdmin.archivedRecords.deleteCancel"), "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                performBulkDelete();
              }}
              disabled={bulkBusy !== null}
            >
              {tString(
                t("superAdmin.archivedRecords.deleteConfirmAction"),
                "Delete permanently",
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
