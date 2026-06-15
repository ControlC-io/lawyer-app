import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Eye, EyeOff, RefreshCw, Key, Shield, Building, FileText, Trash2, Plus, Upload, Pencil, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FileMetadataKey } from "@/components/documents/MetadataValueControl";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";

interface Company {
  id: string;
  name: string;
  api_key: string;
  created_at: string;
  internal_logo_url?: string | null;
  internal_primary_color?: string | null;
}

export default function OrganizationSettings() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const companyId = useCompanyId();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  const [metadataKeys, setMetadataKeys] = useState<FileMetadataKey[]>([]);
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

  const [brandingLogoUrl, setBrandingLogoUrl] = useState("");
  const [brandingPrimaryColor, setBrandingPrimaryColor] = useState("#3B82F6");
  const [showBrandingLogoUrlInput, setShowBrandingLogoUrlInput] = useState(false);
  const [brandingLogoVersion, setBrandingLogoVersion] = useState(0);
  const [brandingLogoPreviewUrl, setBrandingLogoPreviewUrl] = useState("");
  const [savingBranding, setSavingBranding] = useState(false);
  const [uploadingBrandingLogo, setUploadingBrandingLogo] = useState(false);
  const [removingBrandingLogo, setRemovingBrandingLogo] = useState(false);
  const brandingLogoFileInputRef = useRef<HTMLInputElement>(null);
  const brandingLogoObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (companyId) {
      void fetchCompanyData();
      void fetchMetadataKeys();
    }
  }, [companyId]);

  const fetchCompanyData = async () => {
    try {
      const data = await api.get<Company>(`/api/companies/${companyId}`);
      setCompany(data);
      setBrandingLogoUrl(data.internal_logo_url ?? "");
      setBrandingPrimaryColor(data.internal_primary_color ?? "#3B82F6");
    } catch (error) {
      console.error("Error fetching company data:", error);
      toast.error(t("organizationSettings.failedToLoadOrganization"));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} ${t("organizationSettings.copiedToClipboard")}`);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      toast.error(t("organizationSettings.failedToCopyToClipboard"));
    }
  };

  const regenerateApiKey = async () => {
    if (!confirm(t("organizationSettings.regenerateConfirm"))) {
      return;
    }
    setRegeneratingKey(true);
    try {
      const updated = await api.patch<Company>(`/api/companies/${companyId}`, {
        regenerate_api_key: true,
      });
      if (updated?.api_key) setCompany((c) => (c ? { ...c, api_key: updated.api_key } : null));
      toast.success(t("organizationSettings.apiKeyRegenerated"));
    } catch (error) {
      console.error("Error regenerating API key:", error);
      toast.error(t("organizationSettings.failedToRegenerateApiKey"));
    } finally {
      setRegeneratingKey(false);
    }
  };

  const fetchMetadataKeys = async () => {
    try {
      const data = await api.get<FileMetadataKey[]>(`/api/companies/${companyId}/files-metadata-keys`);
      setMetadataKeys(data || []);
    } catch (error) {
      console.error("Error fetching metadata keys:", error);
      toast.error(t("organizationSettings.failedToLoadMetadataKeys"));
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    if (newKeyKind === "predefined_list") {
      const opts = newKeyOptions.split("\n").map((s) => s.trim()).filter(Boolean);
      if (opts.length === 0) {
        toast.error(t("organizationSettings.predefinedListNeedsOption"));
        return;
      }
    }
    setCreatingKey(true);
    try {
      const allowed_values =
        newKeyKind === "predefined_list"
          ? newKeyOptions.split("\n").map((s) => s.trim()).filter(Boolean)
          : [];
      await api.post(`/api/companies/${companyId}/files-metadata-keys`, {
        name: newKeyName.trim(),
        value_kind: newKeyKind,
        allowed_values,
      });
      toast.success(t("organizationSettings.metadataKeyCreated"));
      setNewKeyName("");
      setNewKeyKind("free_text");
      setNewKeyOptions("");
      void fetchMetadataKeys();
    } catch (error) {
      console.error("Error creating metadata key:", error);
      toast.error(t("organizationSettings.failedToCreateMetadataKey"));
    } finally {
      setCreatingKey(false);
    }
  };

  const openEditKey = (key: FileMetadataKey) => {
    setEditingKey(key);
    setEditKeyName(key.name ?? "");
    setEditKeyKind(key.value_kind === "predefined_list" ? "predefined_list" : "free_text");
    const raw = key.allowed_values;
    const lines = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
    setEditKeyOptions(lines.join("\n"));
    setEditKeyOpen(true);
  };

  const handleSaveKeyEdit = async () => {
    if (!editingKey || !editKeyName.trim()) return;
    if (editKeyKind === "predefined_list") {
      const opts = editKeyOptions.split("\n").map((s) => s.trim()).filter(Boolean);
      if (opts.length === 0) {
        toast.error(t("organizationSettings.predefinedListNeedsOption"));
        return;
      }
    }
    setSavingKeyEdit(true);
    try {
      const allowed_values =
        editKeyKind === "predefined_list"
          ? editKeyOptions.split("\n").map((s) => s.trim()).filter(Boolean)
          : [];
      await api.patch(`/api/companies/${companyId}/files-metadata-keys/${editingKey.id}`, {
        name: editKeyName.trim(),
        value_kind: editKeyKind,
        allowed_values,
      });
      toast.success(t("organizationSettings.metadataKeyUpdated"));
      setEditKeyOpen(false);
      setEditingKey(null);
      void fetchMetadataKeys();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("Cannot remove") || msg.includes("Cannot apply") || msg.includes("Conflict")) {
        toast.error(t("organizationSettings.metadataKeyConflict"));
      } else {
        console.error("Error updating metadata key:", error);
        toast.error(t("organizationSettings.failedToUpdateMetadataKey"));
      }
    } finally {
      setSavingKeyEdit(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm(t("organizationSettings.deleteKeyConfirm"))) {
      return;
    }
    try {
      await api.delete(`/api/companies/${companyId}/files-metadata-keys/${id}`);
      toast.success(t("organizationSettings.metadataKeyDeleted"));
      void fetchMetadataKeys();
    } catch (error) {
      console.error("Error deleting metadata key:", error);
      toast.error(t("organizationSettings.failedToDeleteMetadataKey"));
    }
  };

  const isInternalLogoApiPath = (url: string) =>
    typeof url === "string" &&
    /^\/api\/companies\/[a-zA-Z0-9-]+\/internal-logo$/.test(url.trim());
  const isSignedStorageUrl = (url: string) =>
    typeof url === "string" && /X-Amz-Signature|X-Amz-Algorithm|X-Amz-Credential/i.test(url);
  const resolveMediaUrl = (url: string) =>
    url?.startsWith("/")
      ? `${(import.meta.env.VITE_API_URL as string) || ""}${url}`
      : url;

  const revokeBrandingLogoObjectUrl = () => {
    if (brandingLogoObjectUrlRef.current) {
      URL.revokeObjectURL(brandingLogoObjectUrlRef.current);
      brandingLogoObjectUrlRef.current = null;
    }
  };

  const setBrandingPreviewFromRawUrl = async (rawUrl: string) => {
    const value = rawUrl?.trim() ?? "";
    if (!value) {
      revokeBrandingLogoObjectUrl();
      setBrandingLogoPreviewUrl("");
      return;
    }
    if (isInternalLogoApiPath(value)) {
      try {
        const blob = await api.getBlob(value);
        revokeBrandingLogoObjectUrl();
        const objectUrl = URL.createObjectURL(blob);
        brandingLogoObjectUrlRef.current = objectUrl;
        setBrandingLogoPreviewUrl(objectUrl);
        return;
      } catch {
        revokeBrandingLogoObjectUrl();
        setBrandingLogoPreviewUrl("");
        return;
      }
    }
    revokeBrandingLogoObjectUrl();
    setBrandingLogoPreviewUrl(resolveMediaUrl(value));
  };

  const brandingLogoPreviewSrc =
    brandingLogoPreviewUrl && brandingLogoPreviewUrl.trim() !== ""
      ? (brandingLogoPreviewUrl.startsWith("blob:")
          ? brandingLogoPreviewUrl
          : `${brandingLogoPreviewUrl}${brandingLogoPreviewUrl.includes("?") ? "&" : "?"}v=${brandingLogoVersion}`)
      : "";

  const handleSaveBranding = async () => {
    if (!companyId) return;
    setSavingBranding(true);
    try {
      const payload: Record<string, unknown> = {
        internal_primary_color: brandingPrimaryColor || null,
      };
      const logoValue = brandingLogoUrl?.trim() || null;
      if (logoValue != null && !isSignedStorageUrl(logoValue) && !isInternalLogoApiPath(logoValue)) {
        payload.internal_logo_url = logoValue;
        payload.clear_internal_logo_upload = true;
      }
      if (logoValue == null) {
        payload.internal_logo_url = null;
        payload.clear_internal_logo_upload = true;
      }
      const updated = await api.patch<Company>(`/api/companies/${companyId}`, payload);
      setCompany((c) => (c ? { ...c, ...updated } : null));
      setBrandingLogoUrl(updated.internal_logo_url ?? "");
      await setBrandingPreviewFromRawUrl(updated.internal_logo_url ?? "");
      setBrandingPrimaryColor(updated.internal_primary_color ?? "#3B82F6");
      toast.success(t("organizationSettings.branding.saved"));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("organizationSettings.branding.saveError");
      toast.error(msg);
    } finally {
      setSavingBranding(false);
    }
  };

  const handleBrandingLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    setUploadingBrandingLogo(true);
    e.target.value = "";
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.postFormData<{ internal_logo_url: string }>(
        `/api/companies/${companyId}/internal-logo`,
        formData
      );
      setBrandingLogoUrl(res.internal_logo_url);
      await setBrandingPreviewFromRawUrl(res.internal_logo_url);
      setBrandingLogoVersion((v) => v + 1);
      await fetchCompanyData();
      toast.success(t("organizationSettings.branding.saved"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("organizationSettings.branding.logoUploadError");
      toast.error(msg);
    } finally {
      setUploadingBrandingLogo(false);
    }
  };

  const handleRemoveBrandingLogo = async () => {
    if (!companyId) return;
    setRemovingBrandingLogo(true);
    try {
      await api.delete(`/api/companies/${companyId}/internal-logo`);
      setBrandingLogoUrl("");
      setBrandingLogoPreviewUrl("");
      revokeBrandingLogoObjectUrl();
      await fetchCompanyData();
      toast.success(t("organizationSettings.branding.saved"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("organizationSettings.branding.saveError");
      toast.error(msg);
    } finally {
      setRemovingBrandingLogo(false);
    }
  };

  useEffect(() => {
    void setBrandingPreviewFromRawUrl(brandingLogoUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandingLogoUrl]);

  useEffect(() => {
    return () => {
      revokeBrandingLogoObjectUrl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">{t("organizationSettings.loadingSettings")}</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">{t("organizationSettings.organizationNotFound")}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("organizationSettings.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("organizationSettings.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          {t("common.back")}
        </Button>
      </div>

      <Tabs defaultValue="api" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 md:grid-cols-3">
          <TabsTrigger value="api">{t("organizationSettings.tabs.api")}</TabsTrigger>
          <TabsTrigger value="metadata">{t("organizationSettings.tabs.metadata")}</TabsTrigger>
          <TabsTrigger value="branding">{t("organizationSettings.tabs.branding")}</TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="space-y-6 mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {t("organizationSettings.apiAuthentication")}
                </CardTitle>
                <CardDescription>{t("organizationSettings.apiAuthDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>{t("organizationSettings.credentialsSafe")}</AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="api-base-url">{t("organizationSettings.baseApiUrl")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="api-base-url"
                      value={import.meta.env.VITE_API_URL ?? ""}
                      disabled
                      className="bg-muted font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(import.meta.env.VITE_API_URL ?? "", t("organizationSettings.baseApiUrl"))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  {t("organizationSettings.companyApiKey")}
                </CardTitle>
                <CardDescription>{t("organizationSettings.companyApiKeyDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key">{t("organizationSettings.companyApiKey")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="api-key"
                      type={showApiKey ? "text" : "password"}
                      value={company.api_key}
                      disabled
                      className="bg-muted font-mono text-sm"
                    />
                    <Button variant="outline" size="sm" onClick={() => setShowApiKey(!showApiKey)}>
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(company.api_key, t("organizationSettings.companyApiKey"))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <Button variant="destructive" onClick={regenerateApiKey} disabled={regeneratingKey} className="w-full">
                    {regeneratingKey ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t("organizationSettings.regenerating")}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t("organizationSettings.regenerateApiKey")}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="metadata" className="space-y-6 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                {t("organizationSettings.organizationInformation")}
              </CardTitle>
              <CardDescription>{t("organizationSettings.organizationInfoDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="org-name">{t("organizationSettings.organizationName")}</Label>
                <Input id="org-name" value={company.name} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-id">{t("organizationSettings.organizationId")}</Label>
                <div className="flex items-center gap-2">
                  <Input id="org-id" value={company.id} disabled className="bg-muted font-mono text-sm" />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(company.id, t("organizationSettings.organizationId"))}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("organizationSettings.created")}</Label>
                <p className="text-sm text-muted-foreground pt-2">
                  {new Date(company.created_at).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("organizationSettings.fileMetadataKeys")}
              </CardTitle>
              <CardDescription>{t("organizationSettings.fileMetadataKeysDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder={t("organizationSettings.newKeyNamePlaceholder")}
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
                      <SelectItem value="free_text">{t("organizationSettings.metadataTypeFreeText")}</SelectItem>
                      <SelectItem value="predefined_list">{t("organizationSettings.metadataTypePredefined")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newKeyKind === "predefined_list" && (
                  <Textarea
                    value={newKeyOptions}
                    onChange={(e) => setNewKeyOptions(e.target.value)}
                    placeholder={t("organizationSettings.predefinedOptionsPlaceholder")}
                    rows={4}
                    className="font-mono text-sm"
                  />
                )}
                <Button onClick={handleCreateKey} disabled={creatingKey || !newKeyName.trim()} className="w-full sm:w-auto">
                  {creatingKey ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {t("organizationSettings.addMetadataKey")}
                </Button>
              </div>

              <div className="space-y-2">
                {metadataKeys.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t("organizationSettings.noMetadataKeysDefined")}
                  </p>
                )}
                {metadataKeys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between gap-2 p-2 border rounded-md bg-muted/50">
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <span className="text-sm font-medium truncate">{key.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {key.value_kind === "predefined_list"
                          ? t("organizationSettings.metadataTypePredefined")
                          : t("organizationSettings.metadataTypeFreeText")}
                      </span>
                    </div>
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
                  </div>
                ))}
              </div>

              <Dialog open={editKeyOpen} onOpenChange={setEditKeyOpen}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{t("organizationSettings.editMetadataKey")}</DialogTitle>
                    <DialogDescription>{t("organizationSettings.editMetadataKeyDesc")}</DialogDescription>
                  </DialogHeader>
                  {editingKey && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t("common.name")}</Label>
                        <Input value={editKeyName} onChange={(e) => setEditKeyName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("common.type")}</Label>
                        <Select value={editKeyKind} onValueChange={(v: "free_text" | "predefined_list") => setEditKeyKind(v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free_text">{t("organizationSettings.metadataTypeFreeText")}</SelectItem>
                            <SelectItem value="predefined_list">{t("organizationSettings.metadataTypePredefined")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {editKeyKind === "predefined_list" && (
                        <Textarea
                          value={editKeyOptions}
                          onChange={(e) => setEditKeyOptions(e.target.value)}
                          placeholder={t("organizationSettings.predefinedOptionsPlaceholder")}
                          rows={6}
                          className="font-mono text-sm"
                        />
                      )}
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditKeyOpen(false)}>{t("common.cancel")}</Button>
                    <Button onClick={handleSaveKeyEdit} disabled={savingKeyEdit || !editKeyName.trim()}>
                      {savingKeyEdit ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                      {t("common.save")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-6 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                {t("organizationSettings.branding.title")}
              </CardTitle>
              <CardDescription>{t("organizationSettings.branding.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t("organizationSettings.branding.logoLabel")}</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={brandingLogoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="sr-only"
                    disabled={uploadingBrandingLogo}
                    onChange={handleBrandingLogoFileChange}
                  />
                  <Button type="button" variant="outline" disabled={uploadingBrandingLogo} onClick={() => brandingLogoFileInputRef.current?.click()}>
                    {uploadingBrandingLogo ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {t("organizationSettings.branding.uploadLogo")}
                  </Button>
                  {brandingLogoUrl && (
                    <Button type="button" variant="ghost" size="sm" disabled={removingBrandingLogo} onClick={handleRemoveBrandingLogo}>
                      {removingBrandingLogo ? <RefreshCw className="h-4 w-4 animate-spin" /> : t("organizationSettings.branding.removeLogo")}
                    </Button>
                  )}
                </div>
                {brandingLogoUrl && (
                  <img
                    src={brandingLogoPreviewSrc || undefined}
                    alt={t("organizationSettings.branding.logoPreview")}
                    className="h-12 w-12 object-contain rounded border mt-2"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={() => setShowBrandingLogoUrlInput((v) => !v)}>
                  {t("organizationSettings.branding.useLogoUrl")}
                </button>
                {showBrandingLogoUrlInput && (
                  <Input
                    value={brandingLogoUrl}
                    onChange={(e) => setBrandingLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="mt-2"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="branding-color">{t("organizationSettings.branding.primaryColor")}</Label>
                <input
                  type="color"
                  id="branding-color"
                  value={brandingPrimaryColor}
                  onChange={(e) => setBrandingPrimaryColor(e.target.value)}
                  className="h-12 w-12 rounded border cursor-pointer"
                />
              </div>

              <Button onClick={handleSaveBranding} disabled={savingBranding}>
                {savingBranding ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {t("common.saving")}
                  </>
                ) : (
                  t("organizationSettings.branding.saveSettings")
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
