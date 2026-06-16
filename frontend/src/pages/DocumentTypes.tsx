import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface MetadataKey {
  id: string;
  name: string | null;
  value_kind: "free_text" | "predefined_list";
}

interface DocumentType {
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

  const [presets, setPresets] = useState<DocumentType[]>([]);
  const [metadataKeys, setMetadataKeys] = useState<MetadataKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentType | null>(null);
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
        api.get<{ presets: DocumentType[] }>(`/api/companies/${companyId}/documents/document-types`),
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

  const openEdit = (preset: DocumentType) => {
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
        await api.patch(`/api/companies/${companyId}/documents/document-types/${editing.id}`, payload);
        toast.success(String(t("documentTypes.updated")));
      } else {
        await api.post(`/api/companies/${companyId}/documents/document-types`, payload);
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

  const handleDelete = async (preset: DocumentType) => {
    if (!companyId || !canManage) return;
    if (!window.confirm(String(t("documentTypes.deleteConfirm", { name: preset.name })))) return;
    try {
      await api.delete(`/api/companies/${companyId}/documents/document-types/${preset.id}`);
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
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{String(t("documentTypes.title"))}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{String(t("documentTypes.subtitle"))}</p>
        </div>
        {canManage && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            {String(t("documentTypes.add"))}
          </Button>
        )}
      </div>

      {/* Available metadata fields info */}
      {metadataKeys.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground shrink-0">
              {String(t("documentTypes.metadataFieldsTitle"))}:
            </span>
            {metadataKeys.map((key) => (
              <Badge key={key.id} variant="secondary" className="text-xs font-normal">
                {key.name?.trim() || key.id}
              </Badge>
            ))}
            <Link to="/metadata-keys" className="text-xs text-primary underline-offset-4 hover:underline ml-1">
              {String(t("documentTypes.metadataFieldsLink"))}
            </Link>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <p className="text-sm font-medium">{String(t("documentTypes.listTitle"))}</p>
            <p className="text-xs text-muted-foreground">{String(t("documentTypes.listDescription"))}</p>
          </div>
          {!loading && (
            <span className="text-xs text-muted-foreground">
              {presets.length} {presets.length === 1 ? "type" : "types"}
            </span>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[200px]">{String(t("documentTypes.name"))}</TableHead>
              <TableHead>{String(t("documentTypes.instructions"))}</TableHead>
              <TableHead className="w-[240px]">{String(t("documentTypes.fieldsToExtract"))}</TableHead>
              {canManage && <TableHead className="w-[80px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="h-24 text-center text-sm text-muted-foreground">
                  {String(t("common.loading"))}
                </TableCell>
              </TableRow>
            ) : presets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="h-24 text-center text-sm text-muted-foreground">
                  {String(t("documentTypes.empty"))}
                </TableCell>
              </TableRow>
            ) : (
              presets.map((preset) => (
                <TableRow key={preset.id}>
                  <TableCell className="font-medium align-top py-3">{preset.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground align-top py-3 max-w-xs">
                    <span className="line-clamp-2">{preset.namingInstructions}</span>
                  </TableCell>
                  <TableCell className="align-top py-3">
                    <div className="flex flex-wrap gap-1">
                      {preset.metadataKeyIds.map((keyId) => (
                        <Badge key={keyId} variant="outline" className="text-xs font-normal">
                          {keyLabelById.get(keyId) ?? keyId}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {canManage && (
                    <TableCell className="align-top py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(preset)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => void handleDelete(preset)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog */}
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
                    <label key={key.id} className="flex items-center gap-2 text-sm cursor-pointer">
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
