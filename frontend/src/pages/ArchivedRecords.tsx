import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

interface ArchivedDocument {
  id: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
  mime_type: string | null;
  archived_datetime: string | null;
}

interface ArchivedPayload {
  documents: ArchivedDocument[];
}

export default function ArchivedRecords() {
  const { t } = useLanguage();
  const [documents, setDocuments] = useState<ArchivedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadArchived = async () => {
    setLoading(true);
    try {
      const data = await api.get<ArchivedPayload>("/api/admin/archived?entity=documents");
      setDocuments(Array.isArray(data?.documents) ? data.documents : []);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load archived documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadArchived();
  }, []);

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      await api.post("/api/admin/archived/bulk-delete", {
        entity: "documents",
        ids: Array.from(selected),
      });
      toast.success(String(t("superAdmin.archivedRecords.deleteSuccess", { count: String(selected.size) })));
      setConfirmOpen(false);
      await loadArchived();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(t("superAdmin.archivedRecords.deleteFailed")));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{String(t("superAdmin.archivedRecords.title"))}</h1>
          <p className="text-muted-foreground mt-1">{String(t("superAdmin.archivedRecords.description"))}</p>
        </div>
        <Button variant="outline" onClick={() => void loadArchived()}>
          <RotateCcw className="h-4 w-4 mr-2" />
          {String(t("common.refresh") || "Refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{String(t("superAdmin.archivedRecords.documents"))}</CardTitle>
            <CardDescription>{documents.length} {String(t("superAdmin.archivedRecords.records"))}</CardDescription>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={selected.size === 0}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {String(t("common.delete"))}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{String(t("superAdmin.archivedRecords.loading"))}</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{String(t("superAdmin.archivedRecords.emptyAll"))}</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <label key={doc.id} className="flex items-center gap-3 p-3 border rounded-md">
                  <Checkbox
                    checked={selected.has(doc.id)}
                    onCheckedChange={(checked) => toggleOne(doc.id, checked === true)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{doc.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {doc.company_name || doc.company_id}
                      {doc.archived_datetime ? ` · ${new Date(doc.archived_datetime).toLocaleString()}` : ""}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{String(t("common.delete"))}</AlertDialogTitle>
            <AlertDialogDescription>
              {String(t("superAdmin.archivedRecords.deleteConfirmDescription", { count: String(selected.size) }))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{String(t("common.cancel"))}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting}>
              {String(t("common.delete"))}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
