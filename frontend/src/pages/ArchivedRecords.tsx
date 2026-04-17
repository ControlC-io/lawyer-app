import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Archive } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type EntityKey = "workflows" | "executions" | "agents" | "documents";

interface ArchivedWorkflow {
  id: string;
  name: string;
  company_name: string | null;
  archived_datetime: string | null;
}

interface ArchivedExecution {
  id: string;
  name: string;
  workflow_name: string | null;
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

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

export default function ArchivedRecords() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [data, setData] = useState<ArchivedPayload>({
    workflows: [],
    workflow_executions: [],
    agent_configurations: [],
    documents: [],
  });

  const total = useMemo(
    () =>
      data.workflows.length +
      data.workflow_executions.length +
      data.agent_configurations.length +
      data.documents.length,
    [data],
  );

  const loadArchived = async () => {
    setLoading(true);
    try {
      const response = await api.get<ArchivedPayload>("/api/admin/archived");
      setData(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("superAdmin.archivedRecords.loadError"));
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
      toast.success(t("superAdmin.archivedRecords.unarchiveSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("superAdmin.archivedRecords.unarchiveError"));
    } finally {
      setBusyKey(null);
    }
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("superAdmin.archivedRecords.workflows")}</CardTitle>
            <CardDescription>{`${data.workflows.length} ${t("superAdmin.archivedRecords.records")}`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.loading")}</p>
            ) : data.workflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.empty")}</p>
            ) : (
              data.workflows.map((record) => (
                <div key={record.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{record.name || record.id}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {record.company_name || "-"} - {formatDate(record.archived_datetime)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unarchive("workflows", record.id)}
                    disabled={busyKey === `workflows:${record.id}`}
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
            <CardTitle>{t("superAdmin.archivedRecords.executions")}</CardTitle>
            <CardDescription>{`${data.workflow_executions.length} ${t("superAdmin.archivedRecords.records")}`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.loading")}</p>
            ) : data.workflow_executions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.empty")}</p>
            ) : (
              data.workflow_executions.map((record) => (
                <div key={record.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{record.name || record.id}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {record.company_name || "-"} - {record.workflow_name || "-"} - {formatDate(record.archived_datetime)}
                    </p>
                    {record.workflow_archived && (
                      <p className="text-xs text-amber-600">{t("superAdmin.archivedRecords.executionBlocked")}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unarchive("executions", record.id)}
                    disabled={busyKey === `executions:${record.id}` || record.workflow_archived}
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
            <CardDescription>{`${data.documents.length} ${t("superAdmin.archivedRecords.records")}`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.loading")}</p>
            ) : data.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("superAdmin.archivedRecords.empty")}</p>
            ) : (
              data.documents.map((record) => (
                <div key={record.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{record.name || record.id}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {record.company_name || "-"} - {record.mime_type || "-"} - {formatDate(record.archived_datetime)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unarchive("documents", record.id)}
                    disabled={busyKey === `documents:${record.id}`}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    {t("superAdmin.archivedRecords.unarchive")}
                  </Button>
                </div>
              ))
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
    </div>
  );
}
