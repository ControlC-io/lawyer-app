import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface MetadataKey {
  id: string;
  name: string | null;
  value_kind: "free_text" | "predefined_list";
}

interface DocumentTypePreset {
  id: string;
  name: string;
  namingInstructions: string;
  metadataKeyIds: string[];
}

export default function DocumentTypes() {
  const companyId = useCompanyId();
  const { hasPermission } = useAuth();
  const { t } = useLanguage();
  const canManage = hasPermission("documents.manage");

  const [presets, setPresets] = useState<DocumentTypePreset[]>([]);
  const [metadataKeys, setMetadataKeys] = useState<MetadataKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentTypePreset | null>(null);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const keyLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const key of metadataKeys) {
      map.set(key.id, key.name?.trim() || key.id);
    }
    return map;
  }, [metadataKeys]);

  const loadData = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [presetRes, keys] = await Promise.all([
        api.get<{ presets: DocumentTypePreset[] }>(`/api/companies/${companyId}/documents/split-pdf-presets`),
        api.get<MetadataKey[]>(
          `/api/companies/${companyId}/files-metadata-keys?includeSystemManaged=true`,
        ),
      ]);
      setPresets(Array.isArray(presetRes?.presets) ? presetRes.presets : []);
      setMetadataKeys(Array.isArray(keys) ? keys : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(t("documentTypes.loadFailed")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [companyId]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setInstructions("");
    setSelectedKeyIds([]);
    setDialogOpen(true);
  };

  const openEdit = (preset: DocumentTypePreset) => {
    setEditing(preset);
    setName(preset.name);
    setInstructions(preset.namingInstructions);
    setSelectedKeyIds(preset.metadataKeyIds);
    setDialogOpen(true);
  };

  const toggleKey = (keyId: string, checked: boolean) => {
    setSelectedKeyIds((current) =>
      checked ? [...new Set([...current, keyId])] : current.filter((id) => id !== keyId),
    );
  };

  const handleSave = async () => {
    if (!companyId || !canManage) return;
    if (!name.trim() || !instructions.trim() || selectedKeyIds.length === 0) {
      toast.error(String(t("documentTypes.validationError")));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        namingInstructions: instructions.trim(),
        metadataKeyIds: selectedKeyIds,
      };
      if (editing) {
        await api.patch(`/api/companies/${companyId}/documents/split-pdf-presets/${editing.id}`, payload);
        toast.success(String(t("documentTypes.updated")));
      } else {
        await api.post(`/api/companies/${companyId}/documents/split-pdf-presets`, payload);
        toast.success(String(t("documentTypes.created")));
      }
      setDialogOpen(false);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(t("documentTypes.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (preset: DocumentTypePreset) => {
    if (!companyId || !canManage) return;
    if (!window.confirm(String(t("documentTypes.deleteConfirm", { name: preset.name })))) return;
    try {
      await api.delete(`/api/companies/${companyId}/documents/split-pdf-presets/${preset.id}`);
      toast.success(String(t("documentTypes.deleted")));
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(t("documentTypes.deleteFailed")));
    }
  };

  if (!companyId) {
    return <div className="p-4 text-muted-foreground">{String(t("documentTypes.noCompany"))}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{String(t("documentTypes.title"))}</h1>
          <p className="text-muted-foreground mt-1">{String(t("documentTypes.subtitle"))}</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {String(t("documentTypes.add"))}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{String(t("documentTypes.metadataFieldsTitle"))}</CardTitle>
          <CardDescription>
            {String(t("documentTypes.metadataFieldsDescription"))}{" "}
            <Link to="/metadata-keys" className="underline">
              {String(t("documentTypes.metadataFieldsLink"))}
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metadataKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{String(t("documentTypes.noMetadataKeys"))}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {metadataKeys.map((key) => (
                <span key={key.id} className="text-xs border rounded-full px-2 py-1 bg-muted/50">
                  {key.name?.trim() || key.id}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{String(t("documentTypes.listTitle"))}</CardTitle>
          <CardDescription>{String(t("documentTypes.listDescription"))}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{String(t("common.loading"))}</p>
          ) : presets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{String(t("documentTypes.empty"))}</p>
          ) : (
            <div className="space-y-3">
              {presets.map((preset) => (
                <div key={preset.id} className="border rounded-md p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{preset.name}</div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                        {preset.namingInstructions}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(preset)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => void handleDelete(preset)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {preset.metadataKeyIds.map((keyId) => (
                      <span key={keyId} className="text-xs border rounded px-2 py-0.5">
                        {keyLabelById.get(keyId) ?? keyId}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? String(t("documentTypes.editTitle")) : String(t("documentTypes.createTitle"))}
            </DialogTitle>
            <DialogDescription>{String(t("documentTypes.formDescription"))}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{String(t("documentTypes.name"))}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{String(t("documentTypes.instructions"))}</Label>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} />
            </div>
            <div className="space-y-2">
              <Label>{String(t("documentTypes.fieldsToExtract"))}</Label>
              {metadataKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">{String(t("documentTypes.noMetadataKeys"))}</p>
              ) : (
                <div className="space-y-2 border rounded-md p-3 max-h-56 overflow-y-auto">
                  {metadataKeys.map((key) => (
                    <label key={key.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedKeyIds.includes(key.id)}
                        onCheckedChange={(checked) => toggleKey(key.id, checked === true)}
                      />
                      <span>{key.name?.trim() || key.id}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{String(t("common.cancel"))}</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{String(t("common.save"))}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
