import { useState, useEffect } from "react";
import { RefreshCw, Plus, Pencil, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FileMetadataKey } from "@/components/documents/MetadataValueControl";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MetadataKeys() {
  const { t } = useLanguage();
  const companyId = useCompanyId();

  const [metadataKeys, setMetadataKeys] = useState<FileMetadataKey[]>([]);
  const [loading, setLoading] = useState(true);

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyKind, setNewKeyKind] = useState<"free_text" | "predefined_list">("free_text");
  const [newKeyOptions, setNewKeyOptions] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);

  const [editKeyOpen, setEditKeyOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<FileMetadataKey | null>(null);
  const [editKeyName, setEditKeyName] = useState("");
  const [editKeyKind, setEditKeyKind] = useState<"free_text" | "predefined_list">("free_text");
  const [editKeyOptions, setEditKeyOptions] = useState("");
  const [savingKeyEdit, setSavingKeyEdit] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    void fetchMetadataKeys();
  }, [companyId]);

  const fetchMetadataKeys = async () => {
    try {
      const data = await api.get<FileMetadataKey[]>(`/api/companies/${companyId}/files-metadata-keys`);
      setMetadataKeys(data || []);
    } catch (error) {
      console.error("Error fetching metadata keys:", error);
      toast.error(String(t("organizationSettings.failedToLoadMetadataKeys")));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim() || !companyId) return;
    setCreatingKey(true);
    try {
      const allowedValues =
        newKeyKind === "predefined_list"
          ? newKeyOptions.split("\n").map((v) => v.trim()).filter(Boolean)
          : undefined;
      await api.post(`/api/companies/${companyId}/files-metadata-keys`, {
        name: newKeyName.trim(),
        value_kind: newKeyKind,
        allowed_values: allowedValues,
      });
      toast.success(String(t("organizationSettings.metadataKeyCreated")));
      setNewKeyName("");
      setNewKeyKind("free_text");
      setNewKeyOptions("");
      void fetchMetadataKeys();
    } catch (error) {
      console.error("Error creating metadata key:", error);
      toast.error(String(t("organizationSettings.failedToCreateMetadataKey")));
    } finally {
      setCreatingKey(false);
    }
  };

  const openEditKey = (key: FileMetadataKey) => {
    setEditingKey(key);
    setEditKeyName(key.name);
    setEditKeyKind(key.value_kind as "free_text" | "predefined_list");
    const vals = Array.isArray(key.allowed_values) ? (key.allowed_values as string[]).join("\n") : "";
    setEditKeyOptions(vals);
    setEditKeyOpen(true);
  };

  const handleSaveKeyEdit = async () => {
    if (!editingKey || !editKeyName.trim() || !companyId) return;
    setSavingKeyEdit(true);
    try {
      const allowedValues =
        editKeyKind === "predefined_list"
          ? editKeyOptions.split("\n").map((v) => v.trim()).filter(Boolean)
          : undefined;
      await api.patch(`/api/companies/${companyId}/files-metadata-keys/${editingKey.id}`, {
        name: editKeyName.trim(),
        value_kind: editKeyKind,
        allowed_values: allowedValues,
      });
      toast.success(String(t("organizationSettings.metadataKeyUpdated")));
      setEditKeyOpen(false);
      void fetchMetadataKeys();
    } catch (error: unknown) {
      if (error instanceof Error && error.message?.includes("409")) {
        toast.error(String(t("organizationSettings.metadataKeyConflict")));
      } else {
        console.error("Error updating metadata key:", error);
        toast.error(String(t("organizationSettings.failedToUpdateMetadataKey")));
      }
    } finally {
      setSavingKeyEdit(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!companyId) return;
    try {
      await api.delete(`/api/companies/${companyId}/files-metadata-keys/${id}`);
      toast.success(String(t("organizationSettings.metadataKeyDeleted")));
      void fetchMetadataKeys();
    } catch (error) {
      console.error("Error deleting metadata key:", error);
      toast.error(String(t("organizationSettings.failedToDeleteMetadataKey")));
    }
  };

  if (!companyId) return null;

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{String(t("metadataKeys.title"))}</h1>
        <p className="text-sm text-muted-foreground mt-1">{String(t("metadataKeys.subtitle"))}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {String(t("organizationSettings.fileMetadataKeys"))}
          </CardTitle>
          <CardDescription>{String(t("organizationSettings.fileMetadataKeysDesc"))}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new key form */}
          <div className="space-y-3 p-3 border rounded-md bg-muted/30">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder={String(t("organizationSettings.newKeyNamePlaceholder"))}
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleCreateKey(); }}
                className="flex-1"
              />
              <Select value={newKeyKind} onValueChange={(v: "free_text" | "predefined_list") => setNewKeyKind(v)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free_text">{String(t("organizationSettings.metadataTypeFreeText"))}</SelectItem>
                  <SelectItem value="predefined_list">{String(t("organizationSettings.metadataTypePredefined"))}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newKeyKind === "predefined_list" && (
              <Textarea
                value={newKeyOptions}
                onChange={(e) => setNewKeyOptions(e.target.value)}
                placeholder={String(t("organizationSettings.predefinedOptionsPlaceholder"))}
                rows={4}
                className="font-mono text-sm"
              />
            )}
            <Button onClick={handleCreateKey} disabled={creatingKey || !newKeyName.trim()} className="w-full sm:w-auto">
              {creatingKey ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {String(t("organizationSettings.addMetadataKey"))}
            </Button>
          </div>

          {/* Key list */}
          <div className="space-y-2">
            {loading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                {String(t("common.loading"))}
              </div>
            )}
            {!loading && metadataKeys.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {String(t("organizationSettings.noMetadataKeysDefined"))}
              </p>
            )}
            {metadataKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between gap-2 p-2 border rounded-md bg-muted/50">
                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-sm font-medium truncate">{key.name}</span>
                  {key.value_kind !== "system_reference" && (
                    <span className="text-xs text-muted-foreground">
                      {key.value_kind === "predefined_list"
                        ? String(t("organizationSettings.metadataTypePredefined"))
                        : String(t("organizationSettings.metadataTypeFreeText"))}
                    </span>
                  )}
                </div>
                {!key.system && (
                  <div className="flex items-center shrink-0 gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditKey(key)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDeleteKey(key.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editKeyOpen} onOpenChange={setEditKeyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{String(t("organizationSettings.editMetadataKey"))}</DialogTitle>
            <DialogDescription>{String(t("organizationSettings.editMetadataKeyDesc"))}</DialogDescription>
          </DialogHeader>
          {editingKey && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{String(t("common.name"))}</Label>
                <Input value={editKeyName} onChange={(e) => setEditKeyName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{String(t("common.type"))}</Label>
                <Select value={editKeyKind} onValueChange={(v: "free_text" | "predefined_list") => setEditKeyKind(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free_text">{String(t("organizationSettings.metadataTypeFreeText"))}</SelectItem>
                    <SelectItem value="predefined_list">{String(t("organizationSettings.metadataTypePredefined"))}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editKeyKind === "predefined_list" && (
                <Textarea
                  value={editKeyOptions}
                  onChange={(e) => setEditKeyOptions(e.target.value)}
                  placeholder={String(t("organizationSettings.predefinedOptionsPlaceholder"))}
                  rows={6}
                  className="font-mono text-sm"
                />
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditKeyOpen(false)}>{String(t("common.cancel"))}</Button>
            <Button onClick={handleSaveKeyEdit} disabled={savingKeyEdit || !editKeyName.trim()}>
              {savingKeyEdit ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              {String(t("common.save"))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
